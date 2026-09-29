import { getCrmDb } from './crm';

export type CrmStats = { leads: number; newLeads: number; overdue: number; recentActivities: number };

export type FunnelStageItem = {
  key: string;
  label: string;
  count: number;
  conversionPercent: number; // % so với tổng lead
  dropPercent: number; // % rơi rớt từ bước trước
  href: string;
  description: string;
};

export type ProgramBreakdownItem = {
  program: string;
  leadCount: number;
  neCount: number;
  conversionRate: number;
  href: string;
};

export type SourceBreakdownItem = {
  source: string;
  label: string;
  leadCount: number;
  neCount: number;
  conversionRate: number;
  href: string;
};

export type OperationalAlertItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  actionLabel: string;
  href: string;
};

function getLeadScopeWhere(salesId?: string, alias = 'l'): { sql: string; args: string[] } {
  if (!salesId) return { sql: '1=1', args: [] };
  const sql = `(
    ${alias}.owner_user_id = ?
    OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = ${alias}.ctv_id AND c.owner_user_id = ?)
    OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = ${alias}.id AND (e.sales_user_id = ? OR e.ctv_manager_user_id = ?))
  )`;
  return { sql, args: [salesId, salesId, salesId, salesId] };
}

export function crmStats(salesId?: string): CrmStats {
  const db = getCrmDb();
  const { sql: leadScope, args: leadArgs } = getLeadScopeWhere(salesId, 'demo_leads');
  const leads = db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN stage = 'NEW' THEN 1 ELSE 0 END) AS new_leads FROM demo_leads WHERE ${leadScope}`)
    .get(...leadArgs) as { total: number; new_leads: number | null };
  const now = new Date().toISOString();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const followupScope = salesId
    ? `AND (f.assignee_id = ? OR l.owner_user_id = ? OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?))`
    : '';
  const followupArgs = salesId ? [now, salesId, salesId, salesId] : [now];
  const overdue = db.prepare(`SELECT COUNT(*) AS n FROM demo_followups f
    JOIN demo_leads l ON l.id = f.lead_id WHERE f.status = 'OPEN' AND f.due_at < ?
    ${followupScope}`).get(...followupArgs) as { n: number };
  const activityScope = salesId
    ? `AND (a.actor_id = ? OR l.owner_user_id = ? OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?))`
    : '';
  const activityArgs = salesId ? [last24h, salesId, salesId, salesId] : [last24h];
  const recent = db.prepare(`SELECT COUNT(*) AS n FROM demo_lead_activities a
    JOIN demo_leads l ON l.id = a.lead_id WHERE a.occurred_at >= ?
    ${activityScope}`).get(...activityArgs) as { n: number };
  return { leads: leads.total, newLeads: leads.new_leads ?? 0, overdue: overdue.n, recentActivities: recent.n };
}

export function funnelStats(salesId?: string): {
  stages: FunnelStageItem[];
  pipeline: Record<string, number>;
  totalLeads: number;
  officialNeCount: number;
} {
  const db = getCrmDb();
  const { sql: leadScope, args: leadArgs } = getLeadScopeWhere(salesId, 'l');

  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_leads,
      SUM(CASE WHEN l.stage = 'NEW' THEN 1 ELSE 0 END) AS stage_new,
      SUM(CASE WHEN l.stage = 'CONTACTED' THEN 1 ELSE 0 END) AS stage_contacted,
      SUM(CASE WHEN l.stage = 'CONSULTING' THEN 1 ELSE 0 END) AS stage_consulting,
      SUM(CASE WHEN l.stage = 'WAITING_DOCUMENTS' THEN 1 ELSE 0 END) AS stage_waiting_docs,
      SUM(CASE WHEN l.stage = 'WAITING_PAYMENT' THEN 1 ELSE 0 END) AS stage_waiting_pay,
      SUM(CASE WHEN l.stage = 'LOST' THEN 1 ELSE 0 END) AS stage_lost,
      COUNT(DISTINCT CASE WHEN ne.id IS NOT NULL THEN l.id END) AS official_ne_leads
    FROM demo_leads l
    LEFT JOIN (
      SELECT lead_id, id FROM demo_ne_events WHERE delta = 1
    ) ne ON ne.lead_id = l.id
    WHERE ${leadScope}
  `).get(...leadArgs) as Record<string, number | null>;

  const total = row.total_leads ?? 0;
  const sNew = row.stage_new ?? 0;
  const sContacted = row.stage_contacted ?? 0;
  const sConsulting = row.stage_consulting ?? 0;
  const sWaitingDocs = row.stage_waiting_docs ?? 0;
  const sWaitingPay = row.stage_waiting_pay ?? 0;
  const sLost = row.stage_lost ?? 0;
  const officialNe = row.official_ne_leads ?? 0;

  // Cumulative funnel counts (progressed through or currently at stage)
  // Step 1: All leads
  const f1Count = total;
  // Step 2: Contacted + later
  const f2Count = sContacted + sConsulting + sWaitingDocs + sWaitingPay + officialNe;
  // Step 3: Consulting + later
  const f3Count = sConsulting + sWaitingDocs + sWaitingPay + officialNe;
  // Step 4: Waiting docs / payment + later
  const f4Count = sWaitingDocs + sWaitingPay + officialNe;
  // Step 5: Official NE (confirmed positive tuition)
  const f5Count = officialNe;

  const calcRates = (count: number, prev: number) => {
    const conv = total > 0 ? Math.round((count / total) * 100) : 0;
    const drop = prev > 0 ? Math.max(0, Math.round(((prev - count) / prev) * 100)) : 0;
    return { conv, drop };
  };

  const r1 = calcRates(f1Count, f1Count);
  const r2 = calcRates(f2Count, f1Count);
  const r3 = calcRates(f3Count, f2Count);
  const r4 = calcRates(f4Count, f3Count);
  const r5 = calcRates(f5Count, f4Count);

  const stages: FunnelStageItem[] = [
    {
      key: 'TOTAL',
      label: '1. Tiếp nhận lead',
      count: f1Count,
      conversionPercent: r1.conv,
      dropPercent: r1.drop,
      href: '/crm/leads',
      description: 'Tổng lead được đưa vào CRM quản lý',
    },
    {
      key: 'CONTACTED',
      label: '2. Đã liên hệ',
      count: f2Count,
      conversionPercent: r2.conv,
      dropPercent: r2.drop,
      href: '/crm/leads?stage=CONTACTED',
      description: 'Đã thực hiện kết nối hoặc tương tác ban đầu',
    },
    {
      key: 'CONSULTING',
      label: '3. Đang tư vấn',
      count: f3Count,
      conversionPercent: r3.conv,
      dropPercent: r3.drop,
      href: '/crm/leads?stage=CONSULTING',
      description: 'Đang giải đáp lộ trình học và chương trình',
    },
    {
      key: 'WAITING',
      label: '4. Chờ hồ sơ & học phí',
      count: f4Count,
      conversionPercent: r4.conv,
      dropPercent: r4.drop,
      href: '/crm/leads?stage=WAITING_DOCUMENTS',
      description: 'Chờ hoàn thiện thủ tục và chuyển khoản',
    },
    {
      key: 'OFFICIAL_NE',
      label: '5. Đạt NE chính thức',
      count: f5Count,
      conversionPercent: r5.conv,
      dropPercent: r5.drop,
      href: '/crm/leads?filter=has_ne',
      description: 'Đã xác nhận học phí dương qua ngân hàng',
    },
  ];

  return {
    stages,
    pipeline: {
      NEW: sNew,
      CONTACTED: sContacted,
      CONSULTING: sConsulting,
      WAITING_DOCUMENTS: sWaitingDocs,
      WAITING_PAYMENT: sWaitingPay,
      LOST: sLost,
      NE: officialNe,
    },
    totalLeads: total,
    officialNeCount: officialNe,
  };
}

export function breakdownByProgram(salesId?: string): ProgramBreakdownItem[] {
  const db = getCrmDb();
  const { sql: leadScope, args: leadArgs } = getLeadScopeWhere(salesId, 'l');

  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(l.program), ''), 'Chưa phân ngành') AS program,
      COUNT(DISTINCT l.id) AS lead_count,
      COUNT(DISTINCT CASE WHEN ne.id IS NOT NULL THEN l.id END) AS ne_count
    FROM demo_leads l
    LEFT JOIN (
      SELECT lead_id, id FROM demo_ne_events WHERE delta = 1
    ) ne ON ne.lead_id = l.id
    WHERE ${leadScope}
    GROUP BY program
    ORDER BY lead_count DESC, program
    LIMIT 10
  `).all(...leadArgs) as Array<{ program: string; lead_count: number; ne_count: number }>;

  return rows.map(r => ({
    program: r.program,
    leadCount: r.lead_count,
    neCount: r.ne_count,
    conversionRate: r.lead_count > 0 ? Math.round((r.ne_count / r.lead_count) * 100) : 0,
    href: `/crm/leads?program=${encodeURIComponent(r.program)}`,
  }));
}

const SOURCE_LABELS: Record<string, string> = {
  EXCEL: 'Dữ liệu Excel',
  EXCEL_IMPORT: 'Dữ liệu Excel',
  CTV: 'Cộng tác viên',
  DIRECT: 'Trực tiếp / Hotline',
  FACEBOOK: 'Facebook / MXH',
  GOOGLE: 'Google / Web',
  ZALO: 'Zalo OA',
  WEBSITE: 'Website tuyển sinh',
  REFERRAL: 'Giới thiệu',
};

export function breakdownBySource(salesId?: string): SourceBreakdownItem[] {
  const db = getCrmDb();
  const { sql: leadScope, args: leadArgs } = getLeadScopeWhere(salesId, 'l');

  const rows = db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(l.source), ''), 'OTHER') AS source,
      COUNT(DISTINCT l.id) AS lead_count,
      COUNT(DISTINCT CASE WHEN ne.id IS NOT NULL THEN l.id END) AS ne_count
    FROM demo_leads l
    LEFT JOIN (
      SELECT lead_id, id FROM demo_ne_events WHERE delta = 1
    ) ne ON ne.lead_id = l.id
    WHERE ${leadScope}
    GROUP BY source
    ORDER BY lead_count DESC, source
    LIMIT 10
  `).all(...leadArgs) as Array<{ source: string; lead_count: number; ne_count: number }>;

  return rows.map(r => ({
    source: r.source,
    label: SOURCE_LABELS[r.source.toUpperCase()] ?? r.source,
    leadCount: r.lead_count,
    neCount: r.ne_count,
    conversionRate: r.lead_count > 0 ? Math.round((r.ne_count / r.lead_count) * 100) : 0,
    href: `/crm/leads?source=${encodeURIComponent(r.source)}`,
  }));
}

export function operationalAlerts(salesId?: string, userRole?: string): OperationalAlertItem[] {
  const db = getCrmDb();
  const alerts: OperationalAlertItem[] = [];

  // 1. Học phí chờ đối soát
  const leadScope = salesId ? 'AND (l.owner_user_id = ? OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?))' : '';
  const leadParams = salesId ? [salesId, salesId] : [];
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM demo_payments p JOIN demo_leads l ON l.id = p.lead_id
    WHERE p.status = 'PENDING' ${leadScope}`).get(...leadParams) as { n: number };
  if (pending.n > 0 || userRole !== 'SALES') {
    alerts.push({
      id: 'pending_payments',
      title: 'Học phí chờ đối soát',
      detail: 'Admin/Leader cần kiểm tra mã giao dịch, chứng từ và ngày tiền vào.',
      count: pending.n,
      urgency: pending.n > 0 ? 'HIGH' : 'LOW',
      actionLabel: 'Mở đối soát',
      href: '/finance?status=PENDING',
    });
  }

  // 2. Follow-up quá hạn
  const now = new Date().toISOString();
  const followupScope = salesId
    ? `AND (f.assignee_id = ? OR l.owner_user_id = ? OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?))`
    : '';
  const followupArgs = salesId ? [now, salesId, salesId, salesId] : [now];
  const overdue = db.prepare(`SELECT COUNT(*) AS n FROM demo_followups f
    JOIN demo_leads l ON l.id = f.lead_id WHERE f.status = 'OPEN' AND f.due_at < ?
    ${followupScope}`).get(...followupArgs) as { n: number };
  alerts.push({
    id: 'overdue_followups',
    title: 'Lịch hẹn follow-up quá hạn',
    detail: 'Lịch hẹn khách hàng đã qua thời gian hẹn nhưng chưa hoàn tất.',
    count: overdue.n,
    urgency: overdue.n > 0 ? 'HIGH' : 'LOW',
    actionLabel: 'Xử lý ngay',
    href: '/crm/leads?filter=overdue',
  });

  // 3. Hồ sơ NE hoặc chờ hồ sơ thiếu chứng từ
  const missingDocs = db.prepare(`
    SELECT COUNT(DISTINCT l.id) AS n FROM demo_leads l
    WHERE (l.stage = 'WAITING_DOCUMENTS'
      OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND e.delta = 1))
      AND (
        EXISTS (SELECT 1 FROM demo_lead_documents d WHERE d.lead_id = l.id AND d.status = 'MISSING')
        OR NOT EXISTS (SELECT 1 FROM demo_lead_documents d WHERE d.lead_id = l.id)
      )
      ${leadScope}
  `).get(...leadParams) as { n: number };
  alerts.push({
    id: 'missing_docs',
    title: 'Hồ sơ thiếu chứng từ / giấy tờ',
    detail: 'Học viên đã vào giai đoạn hồ sơ hoặc đã đạt NE nhưng chưa hoàn thiện giấy tờ bắt buộc.',
    count: missingDocs.n,
    urgency: missingDocs.n > 0 ? 'MEDIUM' : 'LOW',
    actionLabel: 'Kiểm tra hồ sơ',
    href: '/crm/leads?filter=missing_docs',
  });

  // 4. Nhóm SĐT trùng vùng chờ Excel (Admin/Leader)
  if (userRole !== 'SALES') {
    try {
      const dupCount = db.prepare(`
        SELECT COUNT(*) AS n FROM (
          SELECT p.phone_normalized
          FROM demo_import_phones p
          JOIN demo_import_records r ON r.id = p.record_id
          WHERE r.flags NOT LIKE '%SKIPPED_DUPLICATE%'
          GROUP BY p.phone_normalized
          HAVING COUNT(DISTINCT p.record_id) > 1
        )
      `).get() as { n: number };
      alerts.push({
        id: 'dup_imports',
        title: 'Hàng chờ SĐT trùng từ Excel',
        detail: 'Nhiều dòng nguồn Excel trùng số điện thoại giữa các sheet hoặc file cần đối chiếu.',
        count: dupCount.n,
        urgency: dupCount.n > 0 ? 'MEDIUM' : 'LOW',
        actionLabel: 'Duyệt trùng lặp',
        href: '/admin/import/duplicates',
      });
    } catch {}

    // 5. Bản ghi Excel chưa gán sales
    try {
      const unassignedRow = db.prepare(`
        SELECT COUNT(*) AS n FROM demo_import_records
        WHERE assigned_sales_user_id IS NULL AND flags NOT LIKE '%SKIPPED_DUPLICATE%'
      `).get() as { n: number };
      alerts.push({
        id: 'unassigned_imports',
        title: 'Dòng Excel chưa gán Sales',
        detail: 'Cần gán người phụ trách trước khi hồ sơ hiển thị cho tư vấn viên.',
        count: unassignedRow.n,
        urgency: unassignedRow.n > 0 ? 'MEDIUM' : 'LOW',
        actionLabel: 'Ánh xạ Sales',
        href: '/admin/import',
      });
    } catch {}
  }

  // 6. Cảnh báo vi phạm SLA tư vấn & phản hồi
  try {
    const slaScope = salesId ? 'AND l.owner_user_id = ?' : '';
    const slaParams = salesId ? [salesId] : [];
    const slaCount = db.prepare(`
      SELECT COUNT(DISTINCT l.id) AS n FROM demo_leads l
      WHERE l.stage <> 'LOST' AND NOT EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND e.delta = 1)
      ${slaScope}
      AND (
        (l.stage = 'NEW' AND NOT EXISTS (SELECT 1 FROM demo_lead_activities a WHERE a.lead_id = l.id) AND l.created_at < datetime('now', '-24 hours'))
        OR EXISTS (SELECT 1 FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < datetime('now'))
        OR (
          l.stage IN ('CONTACTED', 'CONSULTING', 'WAITING_DOCUMENTS', 'WAITING_PAYMENT')
          AND NOT EXISTS (SELECT 1 FROM demo_lead_activities a WHERE a.lead_id = l.id AND a.occurred_at >= datetime('now', '-5 days'))
          AND l.created_at < datetime('now', '-5 days')
        )
      )
    `).get(...slaParams) as { n: number };
    if (slaCount.n > 0) {
      alerts.unshift({
        id: 'sla_breaches',
        title: 'Lead vi phạm cam kết SLA phản hồi',
        detail: 'Lead mới chưa được liên hệ > 24h hoặc không có tương tác chăm sóc trong hơn 5 ngày.',
        count: slaCount.n,
        urgency: 'HIGH',
        actionLabel: 'Giám sát SLA',
        href: '/crm/sla',
      });
    }
  } catch {}

  // 7. Hoa hồng CTV chờ duyệt chi
  try {
    const managerScope = salesId ? 'AND c.ctv_manager_user_id = ?' : '';
    const managerParams = salesId ? [salesId] : [];
    const commPending = db.prepare(`
      SELECT COUNT(*) AS n FROM demo_ctv_commissions c
      WHERE c.status = 'ACCRUED' ${managerScope}
    `).get(...managerParams) as { n: number };
    if (commPending.n > 0) {
      alerts.push({
        id: 'commissions_pending',
        title: 'Hoa hồng CTV chờ duyệt chi',
        detail: 'Có khoản hoa hồng phát sinh từ NE đạt chuẩn cần Admin/Leader duyệt quyết toán.',
        count: commPending.n,
        urgency: userRole === 'SALES' ? 'LOW' : 'MEDIUM',
        actionLabel: 'Duyệt hoa hồng',
        href: '/crm/commissions?status=ACCRUED',
      });
    }
  } catch {}

  return alerts;
}
