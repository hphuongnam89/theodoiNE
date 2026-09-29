import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { getCrmDb } from './crm';

export type SlaBreachType = 'NEW_UNTOUCHED' | 'STALE_ENGAGEMENT' | 'OVERDUE_FOLLOWUP';

export type SlaBreachItem = {
  leadId: string;
  fullName: string;
  phone: string | null;
  stage: string;
  salesId: string;
  salesName: string;
  breachType: SlaBreachType;
  breachTitle: string;
  breachDescription: string;
  hoursOverdue: number;
  severity: 'HIGH' | 'MEDIUM';
};

export type SlaSalesRanking = {
  salesId: string;
  salesName: string;
  activeCount: number;
  breachedCount: number;
  complianceRate: number;
};

export type SlaMetrics = {
  totalActiveLeads: number;
  compliantLeads: number;
  breachedLeads: number;
  complianceRate: number; // Tỷ lệ % tuân thủ
  breachesByType: {
    newUntouched: number;
    staleEngagement: number;
    overdueFollowup: number;
  };
  salesRanking: SlaSalesRanking[];
  breachList: SlaBreachItem[];
};

/**
 * Tính toán toàn bộ chỉ số SLA và danh sách vi phạm
 */
export function getSlaMetrics(salesId?: string, dbParam?: DatabaseSync): SlaMetrics {
  const db = dbParam ?? getCrmDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const whereClause = salesId ? 'AND l.owner_user_id = ?' : '';
  const params = salesId ? [salesId] : [];

  // Lấy toàn bộ lead đang trong quá trình chăm sóc (không tính LOST hoặc đã đạt NE)
  const leads = db.prepare(`
    SELECT
      l.id, l.full_name, l.phone_normalized, l.stage, l.created_at,
      l.owner_user_id, u.display_name AS sales_name,
      (SELECT MAX(a.occurred_at) FROM demo_lead_activities a WHERE a.lead_id = l.id) AS latest_activity_at,
      (SELECT COUNT(*) FROM demo_lead_activities a WHERE a.lead_id = l.id) AS activity_count,
      (SELECT MIN(f.due_at) FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < ?) AS overdue_due_at,
      (SELECT COUNT(*) FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < ?) AS overdue_count,
      (SELECT COALESCE(SUM(delta), 0) FROM demo_ne_events e WHERE e.lead_id = l.id) AS ne_count
    FROM demo_leads l
    JOIN demo_users u ON l.owner_user_id = u.id
    WHERE l.stage <> 'LOST'
    ${whereClause}
  `).all(nowIso, nowIso, ...params) as Array<{
    id: string;
    full_name: string;
    phone_normalized: string | null;
    stage: string;
    created_at: string;
    owner_user_id: string;
    sales_name: string;
    latest_activity_at: string | null;
    activity_count: number;
    overdue_due_at: string | null;
    overdue_count: number;
    ne_count: number;
  }>;

  const breachList: SlaBreachItem[] = [];
  const breachedLeadIds = new Set<string>();

  const breachesByType = {
    newUntouched: 0,
    staleEngagement: 0,
    overdueFollowup: 0,
  };

  const salesMap = new Map<string, { salesName: string; activeCount: number; breachedCount: number }>();

  for (const lead of leads) {
    // Nếu lead đã có NE chính thức, bỏ qua kiểm tra SLA chăm sóc
    if (Number(lead.ne_count) > 0) continue;

    if (!salesMap.has(lead.owner_user_id)) {
      salesMap.set(lead.owner_user_id, {
        salesName: lead.sales_name,
        activeCount: 0,
        breachedCount: 0,
      });
    }
    const salesStat = salesMap.get(lead.owner_user_id)!;
    salesStat.activeCount += 1;

    let hasBreach = false;

    // 1. Kiểm tra SLA Lead mới (NEW): Chưa có tương tác sau 24h
    if (lead.stage === 'NEW' && Number(lead.activity_count) === 0) {
      const createdTime = Date.parse(lead.created_at);
      const hoursSinceCreated = Math.floor((now.getTime() - createdTime) / (1000 * 3600));
      if (hoursSinceCreated >= 24) {
        hasBreach = true;
        breachesByType.newUntouched += 1;
        breachList.push({
          leadId: lead.id,
          fullName: lead.full_name,
          phone: lead.phone_normalized,
          stage: lead.stage,
          salesId: lead.owner_user_id,
          salesName: lead.sales_name,
          breachType: 'NEW_UNTOUCHED',
          breachTitle: 'Chưa liên hệ lead mới (> 24h)',
          breachDescription: `Lead tiếp nhận từ ${new Date(lead.created_at).toLocaleDateString('vi-VN')} chưa có cuộc gọi hay tin nhắn đầu tiên.`,
          hoursOverdue: hoursSinceCreated - 24,
          severity: 'HIGH',
        });
      }
    }

    // 2. Kiểm tra SLA Lead đang chăm sóc bị bỏ quên (> 5 ngày = 120 giờ)
    if (['CONTACTED', 'CONSULTING', 'WAITING_DOCUMENTS', 'WAITING_PAYMENT'].includes(lead.stage)) {
      const refTime = lead.latest_activity_at ? Date.parse(lead.latest_activity_at) : Date.parse(lead.created_at);
      const hoursSinceRef = Math.floor((now.getTime() - refTime) / (1000 * 3600));
      if (hoursSinceRef >= 120) {
        hasBreach = true;
        breachesByType.staleEngagement += 1;
        breachList.push({
          leadId: lead.id,
          fullName: lead.full_name,
          phone: lead.phone_normalized,
          stage: lead.stage,
          salesId: lead.owner_user_id,
          salesName: lead.sales_name,
          breachType: 'STALE_ENGAGEMENT',
          breachTitle: `Lead không có tương tác > ${Math.floor(hoursSinceRef / 24)} ngày`,
          breachDescription: 'Lead đang trong phễu tư vấn nhưng không có hoạt động chăm sóc cập nhật nào trong hơn 5 ngày.',
          hoursOverdue: hoursSinceRef - 120,
          severity: 'MEDIUM',
        });
      }
    }

    // 3. Kiểm tra SLA Lịch hẹn follow-up quá hạn
    if (Number(lead.overdue_count) > 0 && lead.overdue_due_at) {
      const dueTime = Date.parse(lead.overdue_due_at);
      const hoursOverdue = Math.max(1, Math.floor((now.getTime() - dueTime) / (1000 * 3600)));
      hasBreach = true;
      breachesByType.overdueFollowup += 1;
      breachList.push({
        leadId: lead.id,
        fullName: lead.full_name,
        phone: lead.phone_normalized,
        stage: lead.stage,
        salesId: lead.owner_user_id,
        salesName: lead.sales_name,
        breachType: 'OVERDUE_FOLLOWUP',
        breachTitle: `Lịch hẹn quá hạn ${hoursOverdue} giờ`,
        breachDescription: `Có ${lead.overdue_count} lịch hẹn liên hệ lại đã qua thời điểm cam kết mà chưa hoàn thành.`,
        hoursOverdue,
        severity: 'HIGH',
      });
    }

    if (hasBreach) {
      breachedLeadIds.add(lead.id);
      salesStat.breachedCount += 1;
    }
  }

  // Sắp xếp danh sách vi phạm: Ưu tiên HIGH trước, sau đó theo số giờ quá hạn giảm dần
  breachList.sort((a, b) => {
    if (a.severity === 'HIGH' && b.severity !== 'HIGH') return -1;
    if (a.severity !== 'HIGH' && b.severity === 'HIGH') return 1;
    return b.hoursOverdue - a.hoursOverdue;
  });

  const totalActiveLeads = leads.filter(l => Number(l.ne_count) === 0).length;
  const breachedLeads = breachedLeadIds.size;
  const compliantLeads = Math.max(0, totalActiveLeads - breachedLeads);
  const complianceRate = totalActiveLeads > 0 ? Math.round((compliantLeads / totalActiveLeads) * 100) : 100;

  const salesRanking: SlaSalesRanking[] = Array.from(salesMap.entries()).map(([salesId, stat]) => ({
    salesId,
    salesName: stat.salesName,
    activeCount: stat.activeCount,
    breachedCount: stat.breachedCount,
    complianceRate: stat.activeCount > 0 ? Math.round(((stat.activeCount - stat.breachedCount) / stat.activeCount) * 100) : 100,
  })).sort((a, b) => a.complianceRate - b.complianceRate); // Tỷ lệ thấp xếp trên để nhắc nhở

  return {
    totalActiveLeads,
    compliantLeads,
    breachedLeads,
    complianceRate,
    breachesByType,
    salesRanking,
    breachList,
  };
}

/**
 * Kiểm tra trạng thái SLA của một lead cụ thể
 */
export function checkLeadSlaStatus(leadId: string, dbParam?: DatabaseSync): SlaBreachItem[] {
  const db = dbParam ?? getCrmDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const lead = db.prepare(`
    SELECT
      l.id, l.full_name, l.phone_normalized, l.stage, l.created_at,
      l.owner_user_id, u.display_name AS sales_name,
      (SELECT MAX(a.occurred_at) FROM demo_lead_activities a WHERE a.lead_id = l.id) AS latest_activity_at,
      (SELECT COUNT(*) FROM demo_lead_activities a WHERE a.lead_id = l.id) AS activity_count,
      (SELECT MIN(f.due_at) FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < ?) AS overdue_due_at,
      (SELECT COUNT(*) FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < ?) AS overdue_count,
      (SELECT COALESCE(SUM(delta), 0) FROM demo_ne_events e WHERE e.lead_id = l.id) AS ne_count
    FROM demo_leads l
    JOIN demo_users u ON l.owner_user_id = u.id
    WHERE l.id = ?
  `).get(nowIso, nowIso, leadId) as any;

  if (!lead || lead.stage === 'LOST' || Number(lead.ne_count) > 0) return [];

  const items: SlaBreachItem[] = [];

  if (lead.stage === 'NEW' && Number(lead.activity_count) === 0) {
    const createdTime = Date.parse(lead.created_at);
    const hours = Math.floor((now.getTime() - createdTime) / (1000 * 3600));
    if (hours >= 24) {
      items.push({
        leadId: lead.id,
        fullName: lead.full_name,
        phone: lead.phone_normalized,
        stage: lead.stage,
        salesId: lead.owner_user_id,
        salesName: lead.sales_name,
        breachType: 'NEW_UNTOUCHED',
        breachTitle: 'Chưa liên hệ lead mới (> 24h)',
        breachDescription: `Lead tiếp nhận ${Math.floor(hours / 24)} ngày chưa có cuộc gọi/tin nhắn.`,
        hoursOverdue: hours - 24,
        severity: 'HIGH',
      });
    }
  }

  if (['CONTACTED', 'CONSULTING', 'WAITING_DOCUMENTS', 'WAITING_PAYMENT'].includes(lead.stage)) {
    const refTime = lead.latest_activity_at ? Date.parse(lead.latest_activity_at) : Date.parse(lead.created_at);
    const hours = Math.floor((now.getTime() - refTime) / (1000 * 3600));
    if (hours >= 120) {
      items.push({
        leadId: lead.id,
        fullName: lead.full_name,
        phone: lead.phone_normalized,
        stage: lead.stage,
        salesId: lead.owner_user_id,
        salesName: lead.sales_name,
        breachType: 'STALE_ENGAGEMENT',
        breachTitle: `Chưa tương tác lại > ${Math.floor(hours / 24)} ngày`,
        breachDescription: 'Lead đang tư vấn nhưng không có hoạt động cập nhật nào trong 5 ngày.',
        hoursOverdue: hours - 120,
        severity: 'MEDIUM',
      });
    }
  }

  if (Number(lead.overdue_count) > 0 && lead.overdue_due_at) {
    const dueTime = Date.parse(lead.overdue_due_at);
    const hours = Math.max(1, Math.floor((now.getTime() - dueTime) / (1000 * 3600)));
    items.push({
      leadId: lead.id,
      fullName: lead.full_name,
      phone: lead.phone_normalized,
      stage: lead.stage,
      salesId: lead.owner_user_id,
      salesName: lead.sales_name,
      breachType: 'OVERDUE_FOLLOWUP',
      breachTitle: `Lịch hẹn quá hạn ${hours} giờ`,
      breachDescription: `Có ${lead.overdue_count} lịch hẹn đã quá hạn chưa hoàn thành.`,
      hoursOverdue: hours,
      severity: 'HIGH',
    });
  }

  return items;
}
