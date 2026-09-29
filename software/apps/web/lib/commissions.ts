import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { auditCrm, getCrmDb, type LeadRow } from './crm';
import { ctvManagerAt } from './finance';
import type { DemoUser } from './demo-auth';

export type CommissionStatus = 'ACCRUED' | 'APPROVED' | 'PAID' | 'CANCELLED';

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  ACCRUED: 'Dự kiến',
  APPROVED: 'Đã duyệt chi',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy (mất NE)',
};

export type CommissionRow = {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  program: string | null;
  ctv_id: string;
  ctv_name: string;
  ctv_phone: string | null;
  ctv_manager_user_id: string;
  manager_name: string;
  policy_id: string | null;
  policy_name: string | null;
  amount_vnd: number;
  status: CommissionStatus;
  accrued_at: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  note: string | null;
};

export type CommissionPolicyRow = {
  id: string;
  name: string;
  program: string | null;
  intake_batch: string | null;
  reward_amount_vnd: number;
  is_active: number;
  created_at: string;
  created_by: string | null;
};

/**
 * Tự động đồng bộ hoa hồng CTV khi NE của Lead thay đổi:
 * - officialNe === 1: Tạo bản ghi ACCRUED nếu Lead có CTV và chưa có bản ghi hoa hồng hiệu lực.
 * - officialNe === 0: Hủy (CANCELLED) bản ghi hoa hồng đang ACCRUED hoặc APPROVED do Lead bị hoàn toàn bộ học phí.
 */
export function syncLeadCommission(
  db: DatabaseSync,
  lead: LeadRow,
  officialNeAfter: number,
  actorId: string,
  neEventId?: string
): void {
  if (!lead.ctv_id) return;

  if (officialNeAfter === 1) {
    // Kiểm tra xem đã có hoa hồng đang hiệu lực cho lead này chưa
    const existing = db.prepare(
      "SELECT id, status FROM demo_ctv_commissions WHERE lead_id = ? AND status IN ('ACCRUED', 'APPROVED', 'PAID') LIMIT 1"
    ).get(lead.id) as { id: string; status: string } | undefined;

    if (!existing) {
      // Xác định Sales quản lý CTV tại thời điểm hiện tại
      const now = new Date().toISOString();
      const managerId = ctvManagerAt(db, lead.ctv_id, now) ?? lead.owner_user_id;

      // Tìm chính sách hoa hồng phù hợp
      let policy: { id: string; reward_amount_vnd: number; name: string } | undefined;
      if (lead.program) {
        policy = db.prepare(
          "SELECT id, reward_amount_vnd, name FROM demo_commission_policies WHERE is_active = 1 AND program = ? LIMIT 1"
        ).get(lead.program) as { id: string; reward_amount_vnd: number; name: string } | undefined;
      }
      if (!policy) {
        policy = db.prepare(
          "SELECT id, reward_amount_vnd, name FROM demo_commission_policies WHERE is_active = 1 AND (program IS NULL OR program = '') ORDER BY reward_amount_vnd DESC LIMIT 1"
        ).get() as { id: string; reward_amount_vnd: number; name: string } | undefined;
      }

      const rewardAmount = policy ? policy.reward_amount_vnd : 1_500_000;
      const commissionId = randomUUID();

      db.prepare(`
        INSERT INTO demo_ctv_commissions
          (id, lead_id, ctv_id, ctv_manager_user_id, ne_event_id, policy_id, amount_vnd, status, accrued_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACCRUED', ?)
      `).run(
        commissionId,
        lead.id,
        lead.ctv_id,
        managerId,
        neEventId ?? null,
        policy?.id ?? null,
        rewardAmount,
        now
      );

      auditCrm(db, actorId, 'commission', commissionId, 'ACCRUE_COMMISSION', null, {
        lead_id: lead.id,
        ctv_id: lead.ctv_id,
        amount_vnd: rewardAmount,
        manager_id: managerId,
      });
    }
  } else if (officialNeAfter === 0) {
    // Nếu lead bị trừ hết NE (hoàn toàn bộ), hủy hoa hồng ACCRUED hoặc APPROVED
    const activeCommissions = db.prepare(
      "SELECT id, status FROM demo_ctv_commissions WHERE lead_id = ? AND status IN ('ACCRUED', 'APPROVED')"
    ).all(lead.id) as Array<{ id: string; status: string }>;

    for (const comm of activeCommissions) {
      db.prepare(
        "UPDATE demo_ctv_commissions SET status = 'CANCELLED', note = ? WHERE id = ?"
      ).run('Tự động hủy do học viên hoàn hết học phí (mất NE)', comm.id);

      auditCrm(db, actorId, 'commission', comm.id, 'CANCEL_COMMISSION', { status: comm.status }, {
        status: 'CANCELLED',
        reason: 'REFUND_IN_FULL',
      });
    }
  }
}

/**
 * Thống kê tổng hợp số liệu hoa hồng
 */
export function getCommissionSummary(salesUserId?: string) {
  const db = getCrmDb();
  const filterClause = salesUserId ? 'WHERE ctv_manager_user_id = ?' : '';
  const params = salesUserId ? [salesUserId] : [];

  const rows = db.prepare(`
    SELECT
      status,
      COUNT(*) AS count,
      COALESCE(SUM(amount_vnd), 0) AS total_amount
    FROM demo_ctv_commissions
    ${filterClause}
    GROUP BY status
  `).all(...params) as Array<{ status: CommissionStatus; count: number; total_amount: number }>;

  const summary = {
    accrued: { count: 0, amount: 0 },
    approved: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0 },
    totalPayable: 0,
  };

  for (const row of rows) {
    if (row.status === 'ACCRUED') summary.accrued = { count: Number(row.count), amount: Number(row.total_amount) };
    if (row.status === 'APPROVED') summary.approved = { count: Number(row.count), amount: Number(row.total_amount) };
    if (row.status === 'PAID') summary.paid = { count: Number(row.count), amount: Number(row.total_amount) };
    if (row.status === 'CANCELLED') summary.cancelled = { count: Number(row.count), amount: Number(row.total_amount) };
  }

  summary.totalPayable = summary.accrued.amount + summary.approved.amount;
  return summary;
}

/**
 * Danh sách hoa hồng có phân trang và bộ lọc
 */
export function listCommissions(
  user: DemoUser,
  filters: {
    status?: string;
    ctvId?: string;
    managerId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const db = getCrmDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  // Phân quyền: Sales chỉ xem hoa hồng thuộc CTV mình quản lý
  if (user.role === 'SALES') {
    whereClauses.push('c.ctv_manager_user_id = ?');
    params.push(user.id);
  } else if (filters.managerId) {
    whereClauses.push('c.ctv_manager_user_id = ?');
    params.push(filters.managerId);
  }

  if (filters.status && filters.status in COMMISSION_STATUS_LABELS) {
    whereClauses.push('c.status = ?');
    params.push(filters.status);
  }

  if (filters.ctvId) {
    whereClauses.push('c.ctv_id = ?');
    params.push(filters.ctvId);
  }

  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    whereClauses.push('(l.full_name LIKE ? OR ctv.display_name LIKE ? OR l.phone_normalized LIKE ?)');
    params.push(term, term, term);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM demo_ctv_commissions c
    JOIN demo_leads l ON c.lead_id = l.id
    JOIN demo_ctv ctv ON c.ctv_id = ctv.id
    ${whereSql}
  `).get(...params) as { total: number };

  const totalCount = Number(countRow?.total ?? 0);

  const rows = db.prepare(`
    SELECT
      c.id, c.lead_id, l.full_name AS lead_name, l.phone_normalized AS lead_phone, l.program,
      c.ctv_id, ctv.display_name AS ctv_name, ctv.phone_normalized AS ctv_phone,
      c.ctv_manager_user_id, u.display_name AS manager_name,
      c.policy_id, p.name AS policy_name,
      c.amount_vnd, c.status, c.accrued_at,
      c.approved_by, c.approved_at, c.paid_by, c.paid_at,
      c.payment_reference, c.note
    FROM demo_ctv_commissions c
    JOIN demo_leads l ON c.lead_id = l.id
    JOIN demo_ctv ctv ON c.ctv_id = ctv.id
    JOIN demo_users u ON c.ctv_manager_user_id = u.id
    LEFT JOIN demo_commission_policies p ON c.policy_id = p.id
    ${whereSql}
    ORDER BY c.accrued_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as CommissionRow[];

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

/**
 * Duyệt chi hoa hồng (Admin hoặc Leader)
 */
export function approveCommission(db: DatabaseSync, commissionId: string, actorId: string, note?: string) {
  const comm = db.prepare('SELECT * FROM demo_ctv_commissions WHERE id = ?').get(commissionId) as any;
  if (!comm) throw new Error('COMMISSION_NOT_FOUND');
  if (comm.status !== 'ACCRUED') throw new Error('CANNOT_APPROVE_CURRENT_STATUS');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE demo_ctv_commissions
    SET status = 'APPROVED', approved_by = ?, approved_at = ?, note = COALESCE(?, note)
    WHERE id = ?
  `).run(actorId, now, note ?? null, commissionId);

  auditCrm(db, actorId, 'commission', commissionId, 'APPROVE_COMMISSION', { status: comm.status }, {
    status: 'APPROVED',
    approved_at: now,
  });
}

/**
 * Xác nhận đã chi trả hoa hồng (Admin hoặc Leader)
 */
export function payCommission(
  db: DatabaseSync,
  commissionId: string,
  actorId: string,
  paymentReference: string,
  note?: string
) {
  const comm = db.prepare('SELECT * FROM demo_ctv_commissions WHERE id = ?').get(commissionId) as any;
  if (!comm) throw new Error('COMMISSION_NOT_FOUND');
  if (comm.status !== 'APPROVED') throw new Error('CANNOT_PAY_UNAPPROVED_COMMISSION');
  if (!paymentReference.trim()) throw new Error('PAYMENT_REFERENCE_REQUIRED');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE demo_ctv_commissions
    SET status = 'PAID', paid_by = ?, paid_at = ?, payment_reference = ?, note = COALESCE(?, note)
    WHERE id = ?
  `).run(actorId, now, paymentReference.trim(), note ?? null, commissionId);

  auditCrm(db, actorId, 'commission', commissionId, 'PAY_COMMISSION', { status: comm.status }, {
    status: 'PAID',
    payment_reference: paymentReference.trim(),
    paid_at: now,
  });
}

/**
 * Danh sách chính sách hoa hồng
 */
export function listCommissionPolicies(db: DatabaseSync): CommissionPolicyRow[] {
  return db.prepare('SELECT * FROM demo_commission_policies ORDER BY is_active DESC, created_at DESC').all() as CommissionPolicyRow[];
}
