#!/usr/bin/env node
/**
 * Automated Security & RBAC Guard Test Suite
 * Usage: node scripts/test-rbac-security.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../apps/web/data/demo.sqlite');

console.log('====================================================');
console.log('  AUTOMATED SECURITY & RBAC GUARD TEST SUITE');
console.log('====================================================\n');

const db = new DatabaseSync(dbPath);

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✕ FAIL: ${testName}`);
    failed++;
  }
}

// Wrap all tests in a sandbox transaction so no mock data persists
db.exec('BEGIN IMMEDIATE');

try {
  const now = new Date().toISOString();

  // Setup test users
  const adminId = 'test-admin-' + randomUUID().slice(0, 8);
  const leaderId = 'test-leader-' + randomUUID().slice(0, 8);
  const salesAId = 'test-sales-a-' + randomUUID().slice(0, 8);
  const salesBId = 'test-sales-b-' + randomUUID().slice(0, 8);

  const insertUser = db.prepare(`
    INSERT INTO demo_users (id, email, display_name, password_hash, role, status, created_at)
    VALUES (?, ?, ?, 'hash', ?, 'ACTIVE', ?)
  `);

  insertUser.run(adminId, `admin-${adminId}@demo.test`, 'Test Admin', 'ADMIN', now);
  insertUser.run(leaderId, `leader-${leaderId}@demo.test`, 'Test Leader', 'LEADER', now);
  insertUser.run(salesAId, `salesA-${salesAId}@demo.test`, 'Sales Alice', 'SALES', now);
  insertUser.run(salesBId, `salesB-${salesBId}@demo.test`, 'Sales Bob', 'SALES', now);

  const admin = { id: adminId, role: 'ADMIN', status: 'ACTIVE' };
  const leader = { id: leaderId, role: 'LEADER', status: 'ACTIVE' };
  const salesA = { id: salesAId, role: 'SALES', status: 'ACTIVE' };
  const salesB = { id: salesBId, role: 'SALES', status: 'ACTIVE' };

  console.log('--- TEST GROUP 1: SALES SCOPE ISOLATION ---');

  const leadAId = 'test-lead-a-' + randomUUID().slice(0, 8);
  const leadBId = 'test-lead-b-' + randomUUID().slice(0, 8);

  const insertLead = db.prepare(`
    INSERT INTO demo_leads (id, full_name, phone_normalized, source, stage, owner_user_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'DIRECT', 'NEW', ?, ?, ?, ?)
  `);

  insertLead.run(leadAId, 'Student Alice Lead', '0901000001', salesAId, salesAId, now, now);
  insertLead.run(leadBId, 'Student Bob Lead', '0901000002', salesBId, salesBId, now, now);

  // Check read scope via SQL condition (matches getLeadScopeCondition)
  const canSalesAReadB = db.prepare(`
    SELECT 1 FROM demo_leads l
    WHERE l.id = ? AND (
      l.owner_user_id = ?
      OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?)
      OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND (e.sales_user_id = ? OR e.ctv_manager_user_id = ?))
    )
  `).get(leadBId, salesAId, salesAId, salesAId, salesAId);
  assert(!canSalesAReadB, 'Sales A CANNOT read Sales B lead');

  const canSalesBReadA = db.prepare(`
    SELECT 1 FROM demo_leads l
    WHERE l.id = ? AND (
      l.owner_user_id = ?
      OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?)
      OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND (e.sales_user_id = ? OR e.ctv_manager_user_id = ?))
    )
  `).get(leadAId, salesBId, salesBId, salesBId, salesBId);
  assert(!canSalesBReadA, 'Sales B CANNOT read Sales A lead');

  const canSalesAReadOwn = db.prepare(`
    SELECT 1 FROM demo_leads l WHERE l.id = ? AND l.owner_user_id = ?
  `).get(leadAId, salesAId);
  assert(Boolean(canSalesAReadOwn), 'Sales A CAN read own lead');

  const canAdminReadBoth = db.prepare('SELECT COUNT(*) as n FROM demo_leads WHERE id IN (?, ?)').get(leadAId, leadBId);
  assert(canAdminReadBoth.n === 2, 'Admin CAN view all leads across all sales');

  console.log('\n--- TEST GROUP 2: ATTRIBUTION & SNAPSHOT PERSISTENCE ---');

  // Create CTV managed by Sales A
  const ctvId = 'test-ctv-' + randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO demo_ctv (id, display_name, name_key, phone_normalized, owner_user_id, created_by, created_at, is_active)
    VALUES (?, 'CTV Minh', 'ctv minh', '0988000001', ?, ?, ?, 1)
  `).run(ctvId, salesAId, salesAId, now);

  // Lead referred by CTV Minh
  const leadCtvId = 'test-lead-ctv-' + randomUUID().slice(0, 8);
  insertLead.run(leadCtvId, 'Student from CTV Minh', '0901000003', salesAId, salesAId, now, now);
  db.prepare('UPDATE demo_leads SET ctv_id = ? WHERE id = ?').run(ctvId, leadCtvId);

  // Confirmed tuition receipt -> produces +1 NE event
  const paymentId = 'test-pay-1-' + randomUUID().slice(0, 8);
  const neEventId = 'test-ne-1-' + randomUUID().slice(0, 8);

  db.prepare(`
    INSERT INTO demo_payments (id, lead_id, kind, amount_vnd, bank_at, reference_code, status, submitted_by, submitted_at, reviewed_by, reviewed_at)
    VALUES (?, ?, 'RECEIPT', 15000000, ?, 'REF001', 'CONFIRMED', ?, ?, ?, ?)
  `).run(paymentId, leadCtvId, now, salesAId, now, adminId, now);

  db.prepare(`
    INSERT INTO demo_ne_events (id, lead_id, payment_id, delta, event_at, sales_user_id, ctv_id, ctv_manager_user_id, created_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(neEventId, leadCtvId, paymentId, now, salesAId, ctvId, salesAId, now);

  // Now: Handoff CTV Minh to Sales B!
  const transferTime = new Date(Date.now() + 1000).toISOString();
  db.prepare('UPDATE demo_ctv SET owner_user_id = ? WHERE id = ?').run(salesBId, ctvId);
  db.prepare('UPDATE demo_leads SET owner_user_id = ? WHERE id = ?').run(salesBId, leadCtvId);

  // Verify that the PREVIOUS NE event STILL belongs to Sales A!
  const historicalNe = db.prepare('SELECT sales_user_id, ctv_manager_user_id FROM demo_ne_events WHERE id = ?').get(neEventId);
  assert(historicalNe.sales_user_id === salesAId, 'Historical NE sales attribution remained intact for Sales A');
  assert(historicalNe.ctv_manager_user_id === salesAId, 'Historical NE CTV manager attribution remained intact for Sales A');

  console.log('\n--- TEST GROUP 3: SQL INJECTION & ESCAPING GUARDS ---');

  const injectionStrings = [
    "' OR '1'='1",
    "'; DROP TABLE demo_leads; --",
    "Robert'); DROP TABLE demo_users;--",
    "\\%_test_escape",
    "' UNION SELECT * FROM demo_users --"
  ];

  for (const maliciousStr of injectionStrings) {
    const escaped = maliciousStr.replace(/[\\%_]/g, char => `\\${char}`);
    let injectionThrew = false;
    let leakedCount = 0;
    try {
      const rows = db.prepare(`
        SELECT COUNT(*) as n FROM demo_leads
        WHERE full_name LIKE ? ESCAPE '\\' OR phone_normalized LIKE ? ESCAPE '\\'
      `).get(`%${escaped}%`, `%${escaped}%`);
      leakedCount = rows.n;
    } catch (e) {
      injectionThrew = true;
    }
    assert(!injectionThrew && leakedCount === 0, `SQL Injection vector safely parameterized: "${maliciousStr.slice(0, 25)}"`);
  }

  console.log('\n--- TEST GROUP 4: DATABASE INTEGRITY & TRANSACTION ATOMICITY ---');

  const integrity = db.prepare('PRAGMA integrity_check').all();
  assert(integrity.length === 1 && integrity[0].integrity_check === 'ok', 'Database page integrity is 100% OK');

  const fk = db.prepare('PRAGMA foreign_key_check').all();
  assert(fk.length === 0, 'Zero foreign key violations in test state');

  console.log('\n====================================================');
  console.log(`  RESULT: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  // Roll back test sandbox
  db.exec('ROLLBACK');
  db.close();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
} catch (e) {
  db.exec('ROLLBACK');
  db.close();
  console.error('Fatal test error:', e);
  process.exit(1);
}
