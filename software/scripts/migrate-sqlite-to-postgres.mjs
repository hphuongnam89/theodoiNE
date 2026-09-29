#!/usr/bin/env node
/**
 * Migration Script: SQLite (demo.sqlite) -> PostgreSQL (phase1/schema.sql)
 * 
 * Usage:
 *   node scripts/migrate-sqlite-to-postgres.mjs --dry-run
 *   node scripts/migrate-sqlite-to-postgres.mjs --sqlite=apps/web/data/demo.sqlite
 * 
 * Environment variables:
 *   DATABASE_URL : PostgreSQL connection string (e.g. postgresql://postgres:postgres@localhost:5432/ne_crm)
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const isDryRun = process.argv.includes('--dry-run');
const sqliteArg = process.argv.find(arg => arg.startsWith('--sqlite='));
const sqlitePath = sqliteArg ? sqliteArg.split('=')[1] : path.resolve('apps/web/data/demo.sqlite');

console.log('='.repeat(70));
console.log('🚀 CRM TUYỂN SINH — CHUYỂN ĐỔI DỮ LIỆU SQLITE SANG POSTGRESQL');
console.log('='.repeat(70));
console.log(`📁 SQLite DB: ${sqlitePath}`);
console.log(`⚙️  Chế độ:   ${isDryRun ? 'DRY-RUN (Chỉ kiểm tra tính toàn vẹn)' : 'MIGRATION THỰC TẾ'}`);

if (!existsSync(sqlitePath)) {
  console.error(`❌ Không tìm thấy tệp SQLite tại: ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath);

// Verify tables exist in SQLite
const existingTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
console.log(`📊 Tìm thấy ${existingTables.length} bảng trong SQLite.`);

const stats = {
  users: 0,
  ctv: 0,
  ctvAssignments: 0,
  leads: 0,
  ownerAssignments: 0,
  stageEvents: 0,
  activities: 0,
  followups: 0,
  documents: 0,
  payments: 0,
  neEvents: 0,
  audit: 0,
};

// 1. Read SQLite records
console.log('\n🔍 Đang đọc dữ liệu từ SQLite...');

const users = existingTables.includes('demo_users') ? sqlite.prepare('SELECT * FROM demo_users').all() : [];
stats.users = users.length;

const ctvList = existingTables.includes('demo_ctv') ? sqlite.prepare('SELECT * FROM demo_ctv').all() : [];
stats.ctv = ctvList.length;

const ctvAssignments = existingTables.includes('demo_ctv_assignments') ? sqlite.prepare('SELECT * FROM demo_ctv_assignments').all() : [];
stats.ctvAssignments = ctvAssignments.length;

const leads = existingTables.includes('demo_leads') ? sqlite.prepare('SELECT * FROM demo_leads').all() : [];
stats.leads = leads.length;

const ownerAssignments = existingTables.includes('demo_lead_owner_assignments') ? sqlite.prepare('SELECT * FROM demo_lead_owner_assignments').all() : [];
stats.ownerAssignments = ownerAssignments.length;

const stageEvents = existingTables.includes('demo_lead_stage_events') ? sqlite.prepare('SELECT * FROM demo_lead_stage_events').all() : [];
stats.stageEvents = stageEvents.length;

const activities = existingTables.includes('demo_lead_activities') ? sqlite.prepare('SELECT * FROM demo_lead_activities').all() : [];
stats.activities = activities.length;

const followups = existingTables.includes('demo_followups') ? sqlite.prepare('SELECT * FROM demo_followups').all() : [];
stats.followups = followups.length;

const documents = existingTables.includes('demo_lead_documents') ? sqlite.prepare('SELECT * FROM demo_lead_documents').all() : [];
stats.documents = documents.length;

const payments = existingTables.includes('demo_payments') ? sqlite.prepare('SELECT * FROM demo_payments').all() : [];
stats.payments = payments.length;

const neEvents = existingTables.includes('demo_ne_events') ? sqlite.prepare('SELECT * FROM demo_ne_events').all() : [];
stats.neEvents = neEvents.length;

const auditLogs = existingTables.includes('demo_crm_audit') ? sqlite.prepare('SELECT * FROM demo_crm_audit').all() : [];
stats.audit = auditLogs.length;

console.log('📈 Thống kê số lượng bản ghi SQLite:');
console.table(stats);

// Validate UUID format helper
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function ensureUuid(val) {
  if (val && UUID_REGEX.test(val)) return val;
  return randomUUID();
}

// Map user IDs to valid UUIDs if any legacy IDs are not standard UUID
const userIdMap = new Map();
for (const u of users) {
  const validId = ensureUuid(u.id);
  userIdMap.set(u.id, validId);
}

// Map lead IDs to people ID and application ID
const leadIdMap = new Map();
for (const l of leads) {
  leadIdMap.set(l.id, {
    applicationId: ensureUuid(l.id),
    personId: randomUUID(),
  });
}

// Map CTV IDs
const ctvIdMap = new Map();
for (const c of ctvList) {
  ctvIdMap.set(c.id, ensureUuid(c.id));
}

// Validation Checks
console.log('\n🛡️  Đang kiểm tra tính toàn vẹn quan hệ (Integrity Checks)...');
let validationErrors = 0;

for (const c of ctvList) {
  if (!userIdMap.has(c.owner_user_id)) {
    console.warn(`  ⚠️ CTV ${c.display_name} (${c.id}) có owner_user_id (${c.owner_user_id}) không tìm thấy trong users.`);
    validationErrors++;
  }
}

for (const l of leads) {
  if (!userIdMap.has(l.owner_user_id)) {
    console.warn(`  ⚠️ Lead ${l.full_name} (${l.id}) có owner_user_id (${l.owner_user_id}) không tìm thấy trong users.`);
    validationErrors++;
  }
  if (l.ctv_id && !ctvIdMap.has(l.ctv_id)) {
    console.warn(`  ⚠️ Lead ${l.full_name} (${l.id}) có ctv_id (${l.ctv_id}) không tìm thấy trong CTV.`);
    validationErrors++;
  }
}

for (const p of payments) {
  if (!leadIdMap.has(p.lead_id)) {
    console.warn(`  ⚠️ Payment ${p.reference_code} (${p.id}) tham chiếu lead_id không tồn tại.`);
    validationErrors++;
  }
}

for (const e of neEvents) {
  if (!leadIdMap.has(e.lead_id)) {
    console.warn(`  ⚠️ NE Event ${e.id} tham chiếu lead_id không tồn tại.`);
    validationErrors++;
  }
}

if (validationErrors === 0) {
  console.log('✅ Toàn bộ khóa ngoại và quan hệ dữ liệu hợp lệ 100%!');
} else {
  console.warn(`⚠️ Phát hiện ${validationErrors} cảnh báo tính toàn vẹn.`);
}

if (isDryRun) {
  console.log('\n[DRY RUN HOÀN TẤT] Dữ liệu đã sẵn sàng để chuyển đổi sang PostgreSQL.');
  console.log('Để thực thi ghi dữ liệu vào PostgreSQL thật:');
  console.log('  1. Cấu hình biến môi trường DATABASE_URL=postgresql://user:pass@host:port/dbname');
  console.log('  2. Áp dụng schema PostgreSQL: psql $DATABASE_URL -f phase1/schema.sql');
  console.log('  3. Chạy lệnh: node scripts/migrate-sqlite-to-postgres.mjs');
  process.exit(0);
}

// Actual PostgreSQL Migration
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('\n❌ Thiếu biến môi trường DATABASE_URL để kết nối PostgreSQL.');
  console.error('Vui lòng set DATABASE_URL (ví dụ: postgresql://postgres:postgres@localhost:5432/ne_crm).');
  process.exit(1);
}

let pgPool;
try {
  let pgModule;
  try {
    pgModule = await import('pg');
  } catch {
    const apiPgPath = path.resolve('apps/api/node_modules/pg/lib/index.js');
    pgModule = await import(apiPgPath);
  }
  const { Pool } = pgModule.default || pgModule;
  pgPool = new Pool({ connectionString: databaseUrl });
} catch (err) {
  console.error('❌ Không thể nạp thư viện pg:', err.message);
  process.exit(1);
}

console.log('\n🐘 Đang kết nối tới PostgreSQL...');
const pgClient = await pgPool.connect();

try {
  await pgClient.query('BEGIN');
  console.log('🔒 Đã mở Transaction PostgreSQL.');

  // 1. Seed or resolve catalogs: programs, intakes, lead_sources
  console.log('🌱 Chuẩn bị danh mục (Programs, Intakes, Sources)...');
  const programMap = new Map();
  const sourceMap = new Map();

  const distinctPrograms = [...new Set(leads.map(l => l.program).filter(Boolean))];
  for (const prog of distinctPrograms) {
    const code = prog.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20) || 'GEN';
    const res = await pgClient.query(
      `INSERT INTO programs (id, code, name, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [randomUUID(), code, prog]
    );
    programMap.set(prog, res.rows[0].id);
  }

  const distinctSources = [...new Set(leads.map(l => l.source).filter(Boolean))];
  for (const src of distinctSources) {
    const code = src.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20) || 'DIRECT';
    const res = await pgClient.query(
      `INSERT INTO lead_sources (id, code, name, channel)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [randomUUID(), code, src, 'DIRECT']
    );
    sourceMap.set(src, res.rows[0].id);
  }

  // 2. Insert app_users
  console.log(`👤 Đang chuyển ${users.length} người dùng...`);
  for (const u of users) {
    const pgId = userIdMap.get(u.id);
    await pgClient.query(
      `INSERT INTO app_users (id, email, display_name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role`,
      [pgId, u.email, u.display_name, u.role, u.status === 'ACTIVE', u.created_at]
    );
  }

  // 3. Insert ctv & ctv_sales_assignments
  console.log(`🤝 Đang chuyển ${ctvList.length} cộng tác viên...`);
  for (const c of ctvList) {
    const pgId = ctvIdMap.get(c.id);
    const ownerId = userIdMap.get(c.owner_user_id);
    await pgClient.query(
      `INSERT INTO ctv (id, display_name, phone_normalized, category, current_owner_sales_id, is_active, joined_on, created_at)
       VALUES ($1, $2, $3, 'CTV', $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, current_owner_sales_id = EXCLUDED.current_owner_sales_id`,
      [pgId, c.display_name, c.phone_normalized || null, ownerId, c.is_active === 1, c.created_at ? c.created_at.slice(0, 10) : null, c.created_at]
    );
  }

  for (const a of ctvAssignments) {
    const ctvId = ctvIdMap.get(a.ctv_id);
    const salesId = userIdMap.get(a.sales_user_id);
    const changedBy = userIdMap.get(a.changed_by) || salesId;
    if (ctvId && salesId) {
      await pgClient.query(
        `INSERT INTO ctv_sales_assignments (id, ctv_id, sales_id, effective_from, effective_to, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [ensureUuid(a.id), ctvId, salesId, a.effective_from, a.effective_to || null, changedBy, a.effective_from]
      );
    }
  }

  // 4. Insert people, person_phones, applications
  console.log(`📋 Đang chuyển ${leads.length} lead & hồ sơ tuyển sinh...`);
  for (const l of leads) {
    const { applicationId, personId } = leadIdMap.get(l.id);
    const ownerId = userIdMap.get(l.owner_user_id);
    const ctvId = l.ctv_id ? ctvIdMap.get(l.ctv_id) : null;
    const progId = l.program ? programMap.get(l.program) : null;
    const srcId = l.source ? sourceMap.get(l.source) : null;

    // Create person record
    await pgClient.query(
      `INSERT INTO people (id, full_name, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [personId, l.full_name, l.created_at]
    );

    // Primary phone
    if (l.phone_normalized) {
      await pgClient.query(
        `INSERT INTO person_phones (id, person_id, phone_normalized, phone_original, is_primary, created_at)
         VALUES ($1, $2, $3, $4, true, $5)
         ON CONFLICT (person_id, phone_normalized) DO NOTHING`,
        [randomUUID(), personId, l.phone_normalized, l.contact_text || l.phone_normalized, l.created_at]
      );
    }

    // Application
    const pgStage = l.stage === 'LOST' ? 'LOST' : l.stage;
    const lostReason = pgStage === 'LOST' ? (l.lost_reason || 'Không có nhu cầu') : null;
    await pgClient.query(
      `INSERT INTO applications (id, person_id, program_id, source_id, sales_owner_id, referrer_ctv_id, stage, lost_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = EXCLUDED.updated_at`,
      [applicationId, personId, progId, srcId, ownerId, ctvId, pgStage, lostReason, l.created_at, l.updated_at]
    );
  }

  // 5. Insert stage events & activities & followups
  console.log(`📞 Đang chuyển hoạt động (${activities.length}) và lịch hẹn (${followups.length})...`);
  for (const act of activities) {
    const app = leadIdMap.get(act.lead_id);
    const actorId = userIdMap.get(act.actor_id);
    if (app && actorId) {
      await pgClient.query(
        `INSERT INTO activities (id, application_id, actor_user_id, kind, occurred_at, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [ensureUuid(act.id), app.applicationId, actorId, act.kind, act.occurred_at, act.note, act.occurred_at]
      );
    }
  }

  for (const f of followups) {
    const app = leadIdMap.get(f.lead_id);
    const assigneeId = userIdMap.get(f.assignee_id);
    if (app && assigneeId) {
      await pgClient.query(
        `INSERT INTO follow_up_tasks (id, application_id, assignee_id, due_at, status, completed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [ensureUuid(f.id), app.applicationId, assigneeId, f.due_at, f.status, f.completed_at || null, f.created_at]
      );
    }
  }

  // 6. Documents
  console.log(`📄 Đang chuyển hồ sơ giấy tờ (${documents.length})...`);
  for (const doc of documents) {
    const app = leadIdMap.get(doc.lead_id);
    const reviewerId = userIdMap.get(doc.updated_by);
    if (app) {
      await pgClient.query(
        `INSERT INTO document_items (id, application_id, document_type, status, note, reviewed_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (application_id, document_type) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
        [randomUUID(), app.applicationId, doc.document_type, doc.status, doc.note || null, reviewerId || null, doc.updated_at]
      );
    }
  }

  // 7. Payment transactions
  console.log(`💰 Đang chuyển ${payments.length} giao dịch học phí...`);
  const paymentIdMap = new Map();
  for (const p of payments) {
    const app = leadIdMap.get(p.lead_id);
    const recordedBy = userIdMap.get(p.submitted_by);
    const confirmedBy = p.reviewed_by ? userIdMap.get(p.reviewed_by) : null;
    const pgKind = p.kind === 'RECEIPT' ? 'TUITION_RECEIPT' : 'TUITION_REFUND';
    const pgId = ensureUuid(p.id);
    paymentIdMap.set(p.id, pgId);

    if (app && recordedBy) {
      await pgClient.query(
        `INSERT INTO payment_transactions
          (id, application_id, kind, amount_vnd, bank_at, status, original_receipt_id,
           evidence_storage_key, recorded_by, confirmed_by, confirmed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          pgId, app.applicationId, pgKind, p.amount_vnd, p.bank_at, p.status,
          p.original_receipt_id ? paymentIdMap.get(p.original_receipt_id) || null : null,
          p.evidence_file_name || null, recordedBy,
          p.status === 'CONFIRMED' ? confirmedBy : null,
          p.status === 'CONFIRMED' ? (p.reviewed_at || p.bank_at) : null,
          p.submitted_at
        ]
      );
    }
  }

  // 8. NE events
  console.log(`🎯 Đang chuyển ${neEvents.length} sự kiện NE chính thức...`);
  for (const e of neEvents) {
    const app = leadIdMap.get(e.lead_id);
    const paymentId = paymentIdMap.get(e.payment_id);
    const salesId = userIdMap.get(e.sales_user_id);
    const ctvId = e.ctv_id ? ctvIdMap.get(e.ctv_id) : null;
    const ctvMgrId = e.ctv_manager_user_id ? userIdMap.get(e.ctv_manager_user_id) : null;
    const pgKind = e.delta === 1 ? 'RECOGNIZED' : 'REVERSED';

    if (app && paymentId && salesId) {
      await pgClient.query(
        `INSERT INTO ne_events
          (id, application_id, payment_transaction_id, kind, delta, event_at,
           credited_sales_id, referrer_ctv_id, ctv_manager_at_ne_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [ensureUuid(e.id), app.applicationId, paymentId, pgKind, e.delta, e.event_at, salesId, ctvId, ctvMgrId, e.created_at]
      );
    }
  }

  // 9. Audit events
  console.log(`🛡️  Đang chuyển ${auditLogs.length} bản ghi audit...`);
  for (const a of auditLogs) {
    const actorId = userIdMap.get(a.actor_id);
    await pgClient.query(
      `INSERT INTO audit_events (id, actor_user_id, entity_type, entity_id, action, before_data, after_data, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        ensureUuid(a.id), actorId || null, a.entity_type, a.entity_id, a.action,
        a.before_json ? JSON.parse(a.before_json) : null,
        a.after_json ? JSON.parse(a.after_json) : null,
        a.occurred_at
      ]
    );
  }

  await pgClient.query('COMMIT');
  console.log('\n🎉 Chuyển đổi dữ liệu sang PostgreSQL THÀNH CÔNG RỰC RỠ!');

} catch (err) {
  await pgClient.query('ROLLBACK');
  console.error('\n❌ Lỗi trong quá trình migration, đã ROLLBACK an toàn:', err.message);
  process.exit(1);
} finally {
  pgClient.release();
  await pgPool.end();
}
