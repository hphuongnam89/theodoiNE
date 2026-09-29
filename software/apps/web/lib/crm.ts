import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDemoDb, type DemoUser } from './demo-auth';
import { STAGE_LABELS, type LeadStage } from './crm-shared';

export { STAGE_LABELS };
export type { LeadStage };
export type LeadRow = {
  id: string; full_name: string; phone_normalized: string | null; contact_text: string | null;
  program: string | null; source: string; stage: LeadStage; lost_reason: string | null;
  owner_user_id: string; ctv_id: string | null; origin_import_record_id: string | null;
  created_at: string; updated_at: string;
};

export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('84') && (digits.length === 11 || digits.length === 12)) digits = `0${digits.slice(2)}`;
  else if (digits.length === 9) digits = `0${digits}`;
  return digits.startsWith('0') && (digits.length === 10 || digits.length === 11) && new Set(digits).size > 1
    ? digits : null;
}

export function foldName(input: string): string {
  return input.toLocaleLowerCase('vi-VN').replace(/đ/g, 'd').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getCrmDb(): DatabaseSync {
  const db = getDemoDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_ctv (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, name_key TEXT NOT NULL,
      phone_normalized TEXT, owner_user_id TEXT NOT NULL REFERENCES demo_users(id),
      created_by TEXT NOT NULL REFERENCES demo_users(id), created_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1, origin_roster_id TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS demo_ctv_owner_idx ON demo_ctv(owner_user_id, is_active);
    CREATE INDEX IF NOT EXISTS demo_ctv_phone_idx ON demo_ctv(phone_normalized);
    CREATE TABLE IF NOT EXISTS demo_ctv_assignments (
      id TEXT PRIMARY KEY, ctv_id TEXT NOT NULL REFERENCES demo_ctv(id),
      sales_user_id TEXT NOT NULL REFERENCES demo_users(id),
      effective_from TEXT NOT NULL, effective_to TEXT,
      changed_by TEXT NOT NULL REFERENCES demo_users(id)
    );
    CREATE TABLE IF NOT EXISTS demo_leads (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone_normalized TEXT,
      contact_text TEXT, program TEXT, source TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('NEW','CONTACTED','CONSULTING','WAITING_DOCUMENTS','WAITING_PAYMENT','LOST')),
      lost_reason TEXT, owner_user_id TEXT NOT NULL REFERENCES demo_users(id),
      ctv_id TEXT REFERENCES demo_ctv(id),
      origin_import_record_id TEXT UNIQUE REFERENCES demo_import_records(id),
      created_by TEXT NOT NULL REFERENCES demo_users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_leads_owner_idx ON demo_leads(owner_user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS demo_leads_phone_idx ON demo_leads(phone_normalized);
    CREATE TABLE IF NOT EXISTS demo_lead_stage_events (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      old_stage TEXT, new_stage TEXT NOT NULL, reason TEXT,
      actor_id TEXT NOT NULL REFERENCES demo_users(id), occurred_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_lead_activities (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      kind TEXT NOT NULL CHECK (kind IN ('CALL','MESSAGE','MEETING','NOTE')),
      note TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES demo_users(id), occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_lead_activities_time_idx ON demo_lead_activities(lead_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS demo_followups (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      assignee_id TEXT NOT NULL REFERENCES demo_users(id),
      due_at TEXT NOT NULL, note TEXT, status TEXT NOT NULL CHECK (status IN ('OPEN','DONE')),
      created_by TEXT NOT NULL REFERENCES demo_users(id), created_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS demo_followups_due_idx ON demo_followups(assignee_id, status, due_at);
    CREATE TABLE IF NOT EXISTS demo_crm_audit (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES demo_users(id),
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
      before_json TEXT, after_json TEXT, occurred_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_lead_owner_assignments (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      sales_user_id TEXT NOT NULL REFERENCES demo_users(id),
      effective_from TEXT NOT NULL, effective_to TEXT,
      changed_by TEXT NOT NULL REFERENCES demo_users(id)
    );
    CREATE INDEX IF NOT EXISTS demo_lead_owner_time_idx ON demo_lead_owner_assignments(lead_id, effective_from);
    CREATE TABLE IF NOT EXISTS demo_lead_documents (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      document_type TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('MISSING','RECEIVED','VERIFIED')),
      note TEXT, updated_by TEXT NOT NULL REFERENCES demo_users(id), updated_at TEXT NOT NULL,
      UNIQUE(lead_id, document_type)
    );
    CREATE TABLE IF NOT EXISTS demo_payments (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      kind TEXT NOT NULL CHECK(kind IN ('RECEIPT','REFUND')),
      amount_vnd INTEGER NOT NULL CHECK(amount_vnd > 0),
      bank_at TEXT NOT NULL, reference_code TEXT NOT NULL, note TEXT,
      original_receipt_id TEXT REFERENCES demo_payments(id),
      status TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','REJECTED')),
      evidence_file_name TEXT, evidence_url TEXT,
      submitted_by TEXT NOT NULL REFERENCES demo_users(id), submitted_at TEXT NOT NULL,
      reviewed_by TEXT REFERENCES demo_users(id), reviewed_at TEXT, review_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS demo_payments_lead_time_idx ON demo_payments(lead_id, bank_at);
    CREATE INDEX IF NOT EXISTS demo_payments_status_idx ON demo_payments(status, submitted_at);
    CREATE TABLE IF NOT EXISTS demo_ne_events (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES demo_leads(id),
      payment_id TEXT NOT NULL UNIQUE REFERENCES demo_payments(id),
      delta INTEGER NOT NULL CHECK(delta IN (-1,1)), event_at TEXT NOT NULL,
      sales_user_id TEXT NOT NULL REFERENCES demo_users(id),
      ctv_id TEXT REFERENCES demo_ctv(id), ctv_manager_user_id TEXT REFERENCES demo_users(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_ne_events_time_idx ON demo_ne_events(event_at, sales_user_id);
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
    CREATE INDEX IF NOT EXISTS demo_ctv_commissions_ctv_idx ON demo_ctv_commissions(ctv_id, status);
    CREATE INDEX IF NOT EXISTS demo_ctv_commissions_manager_idx ON demo_ctv_commissions(ctv_manager_user_id, status);
    CREATE INDEX IF NOT EXISTS demo_ctv_commissions_lead_idx ON demo_ctv_commissions(lead_id);
    INSERT OR IGNORE INTO demo_commission_policies
      (id, name, program, intake_batch, reward_amount_vnd, is_active, created_at)
    VALUES
      ('default-standard-2026', 'Chính sách hoa hồng tiêu chuẩn Khóa 2026', NULL, 'Khóa 2026', 1500000, 1, '2026-01-01T00:00:00.000Z');
  `);
  const columns = db.prepare('PRAGMA table_info(demo_ctv)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'origin_roster_id')) {
    db.exec('ALTER TABLE demo_ctv ADD COLUMN origin_roster_id TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS demo_ctv_origin_roster_idx ON demo_ctv(origin_roster_id)');
  }
  const paymentColumns = db.prepare('PRAGMA table_info(demo_payments)').all() as Array<{ name: string }>;
  if (!paymentColumns.some(column => column.name === 'evidence_file_name')) {
    db.exec('ALTER TABLE demo_payments ADD COLUMN evidence_file_name TEXT');
  }
  if (!paymentColumns.some(column => column.name === 'evidence_url')) {
    db.exec('ALTER TABLE demo_payments ADD COLUMN evidence_url TEXT');
  }
  db.prepare(`INSERT INTO demo_lead_owner_assignments
    (id, lead_id, sales_user_id, effective_from, changed_by)
    SELECT lower(hex(randomblob(16))), l.id, l.owner_user_id, l.created_at, l.created_by
    FROM demo_leads l WHERE NOT EXISTS
      (SELECT 1 FROM demo_lead_owner_assignments h WHERE h.lead_id = l.id)`).run();
  return db;
}

export function canReadLead(user: DemoUser, lead: LeadRow, db?: DatabaseSync): boolean {
  if (user.role !== 'SALES') return true;
  if (lead.owner_user_id === user.id) return true;
  const database = db ?? getCrmDb();
  if (lead.ctv_id) {
    const ctv = database.prepare('SELECT owner_user_id FROM demo_ctv WHERE id = ?').get(lead.ctv_id) as { owner_user_id: string } | undefined;
    if (ctv?.owner_user_id === user.id) return true;
  }
  const hasNe = database.prepare('SELECT 1 FROM demo_ne_events WHERE lead_id = ? AND (sales_user_id = ? OR ctv_manager_user_id = ?) LIMIT 1')
    .get(lead.id, user.id, user.id);
  return Boolean(hasNe);
}

export function canWriteLead(user: DemoUser, lead: LeadRow): boolean {
  return user.role !== 'SALES' || lead.owner_user_id === user.id;
}

export function getLeadScopeCondition(user: DemoUser, alias = 'l'): { sql: string; params: string[] } {
  if (user.role !== 'SALES') return { sql: '1=1', params: [] };
  const sql = `(
    ${alias}.owner_user_id = ?
    OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = ${alias}.ctv_id AND c.owner_user_id = ?)
    OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = ${alias}.id AND (e.sales_user_id = ? OR e.ctv_manager_user_id = ?))
  )`;
  return { sql, params: [user.id, user.id, user.id, user.id] };
}

export function auditCrm(db: DatabaseSync, actorId: string, entityType: string, entityId: string,
  action: string, before: unknown, after: unknown): void {
  db.prepare(`INSERT INTO demo_crm_audit
    (id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), actorId, entityType, entityId, action,
      before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), new Date().toISOString());
}

export function hasPotentialDuplicate(db: DatabaseSync, phone: string, exceptLeadId?: string): boolean {
  const live = db.prepare('SELECT 1 FROM demo_leads WHERE phone_normalized = ? AND id <> ? LIMIT 1')
    .get(phone, exceptLeadId ?? '') as object | undefined;
  if (live) return true;
  try {
    return Boolean(db.prepare('SELECT 1 FROM demo_import_phones WHERE phone_normalized = ? LIMIT 1').get(phone));
  } catch { return false; }
}
