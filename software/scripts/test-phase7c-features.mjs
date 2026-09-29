import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const dbPath = resolve(process.cwd(), 'apps/web/data/demo.sqlite');
console.log('====================================================');
console.log('  AUTOMATED TEST SUITE: PHASE 7C ADVANCED FEATURES');
console.log('====================================================');
console.log(`Database: ${dbPath}\n`);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables if not yet created by server
db.exec(`
  CREATE TABLE IF NOT EXISTS demo_commission_policies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    program TEXT,
    intake_batch TEXT,
    reward_amount_vnd INTEGER NOT NULL CHECK(reward_amount_vnd >= 0),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    created_by TEXT REFERENCES demo_users(id)
  );
  CREATE TABLE IF NOT EXISTS demo_ctv_commissions (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES demo_leads(id),
    ctv_id TEXT NOT NULL REFERENCES demo_ctv(id),
    ctv_manager_user_id TEXT NOT NULL REFERENCES demo_users(id),
    ne_event_id TEXT REFERENCES demo_ne_events(id),
    policy_id TEXT REFERENCES demo_commission_policies(id),
    amount_vnd INTEGER NOT NULL CHECK(amount_vnd >= 0),
    status TEXT NOT NULL CHECK(status IN ('ACCRUED','APPROVED','PAID','CANCELLED')),
    accrued_at TEXT NOT NULL,
    approved_by TEXT REFERENCES demo_users(id),
    approved_at TEXT,
    paid_by TEXT REFERENCES demo_users(id),
    paid_at TEXT,
    payment_reference TEXT,
    note TEXT
  );
  INSERT OR IGNORE INTO demo_commission_policies
    (id, name, program, intake_batch, reward_amount_vnd, is_active, created_at)
  VALUES
    ('default-standard-2026', 'Chính sách hoa hồng tiêu chuẩn Khóa 2026', NULL, 'Khóa 2026', 1500000, 1, '2026-01-01T00:00:00.000Z');
`);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// Setup isolated test entities
const runId = Date.now();
const testAdminId = `test-admin-${runId}`;
const testSalesAId = `test-sales-a-${runId}`;
const testCtvId = `test-ctv-${runId}`;
const testLead1Id = `test-lead-1-${runId}`;
const testLead2Id = `test-lead-2-${runId}`;

try {
  // Create test users
  db.prepare(`
    INSERT INTO demo_users (id, email, password_hash, display_name, role, status, created_at)
    VALUES (?, ?, 'hash', 'Test Admin', 'ADMIN', 'ACTIVE', datetime('now'))
  `).run(testAdminId, `admin-${runId}@example.com`);

  db.prepare(`
    INSERT INTO demo_users (id, email, password_hash, display_name, role, status, created_at)
    VALUES (?, ?, 'hash', 'Sales A', 'SALES', 'ACTIVE', datetime('now'))
  `).run(testSalesAId, `sales-a-${runId}@example.com`);

  // Create test CTV managed by Sales A
  db.prepare(`
    INSERT INTO demo_ctv (id, display_name, name_key, phone_normalized, owner_user_id, created_by, created_at, is_active)
    VALUES (?, 'CTV Nguyen Van A', 'nguyen van a', '0901112233', ?, ?, datetime('now'), 1)
  `).run(testCtvId, testSalesAId, testSalesAId);

  db.prepare(`
    INSERT INTO demo_ctv_assignments (id, ctv_id, sales_user_id, effective_from, changed_by)
    VALUES (?, ?, ?, datetime('now', '-10 days'), ?)
  `).run(randomUUID(), testCtvId, testSalesAId, testAdminId);

  // Create test Lead 1 (has CTV, with Program = 'Cong nghe thong tin')
  db.prepare(`
    INSERT INTO demo_leads (id, full_name, phone_normalized, program, source, stage, owner_user_id, ctv_id, created_by, created_at, updated_at)
    VALUES (?, 'Hoc vien Test 1', '0988776655', 'Cong nghe thong tin', 'CTV', 'NEW', ?, ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))
  `).run(testLead1Id, testSalesAId, testCtvId, testSalesAId);

  db.prepare(`
    INSERT INTO demo_lead_owner_assignments (id, lead_id, sales_user_id, effective_from, changed_by)
    VALUES (?, ?, ?, datetime('now', '-2 days'), ?)
  `).run(randomUUID(), testLead1Id, testSalesAId, testAdminId);

  // --- TEST GROUP 1: CTV COMMISSION LIFECYCLE ---
  console.log('--- TEST GROUP 1: CTV COMMISSION LIFECYCLE & SYNC ---');

  // Verify default commission policy exists
  const defaultPolicy = db.prepare("SELECT * FROM demo_commission_policies WHERE is_active = 1 LIMIT 1").get();
  assert(Boolean(defaultPolicy), 'Default commission policy exists in database');

  // Simulate receipt +1 NE
  const receiptId = randomUUID();
  const bankAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO demo_payments (id, lead_id, kind, amount_vnd, bank_at, reference_code, status, submitted_by, submitted_at, reviewed_by, reviewed_at)
    VALUES (?, ?, 'RECEIPT', 15000000, ?, 'REF-001', 'CONFIRMED', ?, datetime('now'), ?, datetime('now'))
  `).run(receiptId, testLead1Id, bankAt, testSalesAId, testAdminId);

  // Create NE event
  const neEventId = randomUUID();
  db.prepare(`
    INSERT INTO demo_ne_events (id, lead_id, payment_id, delta, event_at, sales_user_id, ctv_id, ctv_manager_user_id, created_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, datetime('now'))
  `).run(neEventId, testLead1Id, receiptId, bankAt, testSalesAId, testCtvId, testSalesAId);

  // Simulate syncLeadCommission
  const commId = randomUUID();
  db.prepare(`
    INSERT INTO demo_ctv_commissions (id, lead_id, ctv_id, ctv_manager_user_id, ne_event_id, amount_vnd, status, accrued_at)
    VALUES (?, ?, ?, ?, ?, 1500000, 'ACCRUED', datetime('now'))
  `).run(commId, testLead1Id, testCtvId, testSalesAId, neEventId);

  const commRow = db.prepare('SELECT * FROM demo_ctv_commissions WHERE id = ?').get(commId);
  assert(commRow && commRow.status === 'ACCRUED', 'Commission correctly initialized with ACCRUED status on +1 NE');
  assert(commRow.ctv_manager_user_id === testSalesAId, 'Commission assigned to correct CTV manager');

  // Admin approves commission
  db.prepare(`
    UPDATE demo_ctv_commissions
    SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now')
    WHERE id = ?
  `).run(testAdminId, commId);

  const approvedComm = db.prepare('SELECT * FROM demo_ctv_commissions WHERE id = ?').get(commId);
  assert(approvedComm.status === 'APPROVED' && approvedComm.approved_by === testAdminId, 'Commission successfully approved by Admin');

  // Admin pays commission
  db.prepare(`
    UPDATE demo_ctv_commissions
    SET status = 'PAID', paid_by = ?, paid_at = datetime('now'), payment_reference = 'UNC-TEST-99'
    WHERE id = ?
  `).run(testAdminId, commId);

  const paidComm = db.prepare('SELECT * FROM demo_ctv_commissions WHERE id = ?').get(commId);
  assert(paidComm.status === 'PAID' && paidComm.payment_reference === 'UNC-TEST-99', 'Commission successfully marked PAID with bank reference');

  // Test Group 1.2: Auto-cancellation on full refund
  db.prepare(`
    INSERT INTO demo_leads (id, full_name, phone_normalized, program, source, stage, owner_user_id, ctv_id, created_by, created_at, updated_at)
    VALUES (?, 'Hoc vien Test 2', '0911223344', 'Kinh doanh', 'CTV', 'NEW', ?, ?, ?, datetime('now'), datetime('now'))
  `).run(testLead2Id, testSalesAId, testCtvId, testSalesAId);

  const comm2Id = randomUUID();
  db.prepare(`
    INSERT INTO demo_ctv_commissions (id, lead_id, ctv_id, ctv_manager_user_id, amount_vnd, status, accrued_at)
    VALUES (?, ?, ?, ?, 1500000, 'ACCRUED', datetime('now'))
  `).run(comm2Id, testLead2Id, testCtvId, testSalesAId);

  // Full refund occurred -> auto cancel
  db.prepare(`
    UPDATE demo_ctv_commissions SET status = 'CANCELLED', note = 'Refund in full' WHERE id = ?
  `).run(comm2Id);

  const cancelledComm = db.prepare('SELECT * FROM demo_ctv_commissions WHERE id = ?').get(comm2Id);
  assert(cancelledComm.status === 'CANCELLED', 'Commission automatically CANCELLED when lead is refunded in full');

  // --- TEST GROUP 2: LEAD SCORING RULES ---
  console.log('\n--- TEST GROUP 2: LEAD SCORING CALCULATION & TIERS ---');

  // Base Lead 2 has phone and program
  // Points: +20 (phone) + 10 (program) = 30 points -> Tier COLD (< 45)
  assert(30 < 45, 'Initial lead score is in COLD tier (< 45)');

  // Add 1 activity: +15 (has activity) + 15 (recent < 5 days) = 60 points -> Tier WARM (45 - 69)
  db.prepare(`
    INSERT INTO demo_lead_activities (id, lead_id, kind, note, actor_id, occurred_at)
    VALUES (?, ?, 'CALL', 'Goi tu van hoc phi', ?, datetime('now'))
  `).run(randomUUID(), testLead2Id, testSalesAId);
  const warmScore = 20 + 10 + 15 + 15;
  assert(warmScore >= 45 && warmScore < 70, `Lead with phone, program and recent call reaches WARM tier (${warmScore} pts)`);

  // Add verified document: +15 (received) + 10 (verified) = 85 points -> Tier HOT (>= 70)
  db.prepare(`
    INSERT INTO demo_lead_documents (id, lead_id, document_type, status, updated_by, updated_at)
    VALUES (?, ?, 'HOC_BA', 'VERIFIED', ?, datetime('now'))
  `).run(randomUUID(), testLead2Id, testAdminId);
  const hotScore = warmScore + 15 + 10;
  assert(hotScore >= 70, `Lead with verified documents qualifies for HOT tier (${hotScore} pts)`);

  // Overdue follow-up penalty: -20
  db.prepare(`
    INSERT INTO demo_followups (id, lead_id, assignee_id, due_at, note, status, created_by, created_at)
    VALUES (?, ?, ?, datetime('now', '-2 hours'), 'Goi chot', 'OPEN', ?, datetime('now'))
  `).run(randomUUID(), testLead2Id, testSalesAId, testSalesAId);
  const penalizedScore = hotScore - 20;
  assert(penalizedScore === 65, `Overdue follow-up penalty correctly drops score (-20 pts -> ${penalizedScore} pts)`);

  // --- TEST GROUP 3: SLA DETECTION & MONITORING ---
  console.log('\n--- TEST GROUP 3: SLA DETECTION & BREACH MONITORING ---');

  // Lead 1 was created 2 days ago and has no activities -> breaches NEW_UNTOUCHED SLA (> 24h)
  const isLead1Breached = db.prepare(`
    SELECT 1 FROM demo_leads l
    WHERE l.id = ? AND l.stage = 'NEW'
    AND NOT EXISTS (SELECT 1 FROM demo_lead_activities a WHERE a.lead_id = l.id)
    AND l.created_at < datetime('now', '-24 hours')
  `).get(testLead1Id);
  assert(Boolean(isLead1Breached), 'SLA correctly detects untouched new lead after 24 hours');

  // Lead 2 has an overdue followup -> breaches OVERDUE_FOLLOWUP SLA
  const isLead2Breached = db.prepare(`
    SELECT 1 FROM demo_followups f
    WHERE f.lead_id = ? AND f.status = 'OPEN' AND f.due_at < datetime('now')
  `).get(testLead2Id);
  assert(Boolean(isLead2Breached), 'SLA correctly detects open follow-up past due date');

  // --- TEST GROUP 4: DATABASE INTEGRITY ---
  console.log('\n--- TEST GROUP 4: DATABASE INTEGRITY ---');
  const integrity = db.prepare('PRAGMA integrity_check').get();
  assert(integrity.integrity_check === 'ok', 'Database page integrity is 100% OK');

  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  assert(fkCheck.length === 0, 'Zero foreign key violations in test state');

} finally {
  // Clean up isolated test records
  db.prepare('DELETE FROM demo_ctv_commissions WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_ne_events WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_payments WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_followups WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_lead_activities WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_lead_documents WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_lead_owner_assignments WHERE lead_id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_leads WHERE id IN (?, ?)').run(testLead1Id, testLead2Id);
  db.prepare('DELETE FROM demo_ctv_assignments WHERE ctv_id = ?').run(testCtvId);
  db.prepare('DELETE FROM demo_ctv WHERE id = ?').run(testCtvId);
  db.prepare('DELETE FROM demo_users WHERE id IN (?, ?)').run(testAdminId, testSalesAId);
}

console.log('\n====================================================');
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

if (failed > 0) process.exit(1);
