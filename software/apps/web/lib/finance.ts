import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { auditCrm, type LeadRow } from './crm';
import { syncLeadCommission } from './commissions';

export type Payment = {
  id: string; lead_id: string; kind: 'RECEIPT' | 'REFUND'; amount_vnd: number;
  bank_at: string; reference_code: string; note: string | null;
  original_receipt_id: string | null; status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  evidence_file_name: string | null; evidence_url: string | null;
  submitted_by: string; submitted_at: string; reviewed_by: string | null;
  reviewed_at: string | null; review_reason: string | null;
};

export function validBankAt(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() + 5 * 60_000 && time >= Date.UTC(2020, 0, 1) ? new Date(time).toISOString() : null;
}

function ownerAt(db: DatabaseSync, lead: LeadRow, at: string): string {
  const row = db.prepare(`SELECT sales_user_id FROM demo_lead_owner_assignments
    WHERE lead_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
    ORDER BY effective_from DESC LIMIT 1`).get(lead.id, at, at) as { sales_user_id: string } | undefined;
  if (row) return row.sales_user_id;
  const first = db.prepare('SELECT sales_user_id FROM demo_lead_owner_assignments WHERE lead_id = ? ORDER BY effective_from LIMIT 1')
    .get(lead.id) as { sales_user_id: string } | undefined;
  return first?.sales_user_id ?? lead.owner_user_id;
}

export function ctvManagerAt(db: DatabaseSync, ctvId: string | null, at: string): string | null {
  if (!ctvId) return null;
  const row = db.prepare(`SELECT sales_user_id FROM demo_ctv_assignments WHERE ctv_id = ?
    AND effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
    ORDER BY effective_from DESC LIMIT 1`).get(ctvId, at, at) as { sales_user_id: string } | undefined;
  if (row) return row.sales_user_id;
  const first = db.prepare('SELECT sales_user_id FROM demo_ctv_assignments WHERE ctv_id = ? ORDER BY effective_from LIMIT 1')
    .get(ctvId) as { sales_user_id: string } | undefined;
  return first?.sales_user_id ?? null;
}

// Call inside the confirmation transaction. Rebuild only this lead's materialized NE events.
export function projectNeEvents(db: DatabaseSync, lead: LeadRow, actorId: string): { before: number; after: number } {
  const rows = db.prepare(`SELECT * FROM demo_payments WHERE lead_id = ? AND status = 'CONFIRMED'
    ORDER BY bank_at, CASE kind WHEN 'RECEIPT' THEN 0 ELSE 1 END, submitted_at, id`).all(lead.id) as Payment[];
  let balance = 0;
  let activeCredit: { salesId: string; ctvManagerId: string | null } | null = null;
  const events: Array<{ payment: Payment; delta: number; salesId: string; ctvManagerId: string | null }> = [];
  for (const payment of rows) {
    const previous = balance;
    balance += payment.kind === 'RECEIPT' ? payment.amount_vnd : -payment.amount_vnd;
    if (balance < 0) throw new Error('REFUND_EXCEEDS_BALANCE');
    if (previous === 0 && balance > 0) {
      activeCredit = { salesId: ownerAt(db, lead, payment.bank_at),
        ctvManagerId: ctvManagerAt(db, lead.ctv_id, payment.bank_at) };
      events.push({ payment, delta: 1, ...activeCredit });
    }
    if (previous > 0 && balance === 0) {
      if (!activeCredit) throw new Error('NE_CREDIT_MISSING');
      events.push({ payment, delta: -1, ...activeCredit });
      activeCredit = null;
    }
  }
  const before = (db.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM demo_ne_events WHERE lead_id = ?')
    .get(lead.id) as { n: number }).n;
  db.prepare('DELETE FROM demo_ne_events WHERE lead_id = ?').run(lead.id);
  const now = new Date().toISOString();
  for (const { payment, delta, salesId, ctvManagerId } of events) {
    db.prepare(`INSERT INTO demo_ne_events
      (id, lead_id, payment_id, delta, event_at, sales_user_id, ctv_id, ctv_manager_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), lead.id, payment.id, delta,
        payment.bank_at, salesId, lead.ctv_id, ctvManagerId, now);
  }
  const after = balance > 0 ? 1 : 0;
  auditCrm(db, actorId, 'lead', lead.id, 'RECALCULATE_NE', { officialNe: before },
    { officialNe: after, eventCount: events.length });
  const positiveEvent = events.find(e => e.delta === 1);
  syncLeadCommission(db, lead, after, actorId, positiveEvent?.payment.id);
  return { before, after };
}

export function formatVnd(amount: number): string { return `${amount.toLocaleString('vi-VN')} ₫`; }
