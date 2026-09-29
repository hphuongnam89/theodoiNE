import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { getCrmDb, type LeadRow } from './crm';

export type LeadTier = 'HOT' | 'WARM' | 'COLD';

export type ScoreFactor = {
  category: 'CONTACT' | 'ENGAGEMENT' | 'DOCUMENTS' | 'FOLLOWUP' | 'STATUS';
  label: string;
  points: number;
  achieved: boolean;
  hint?: string;
};

export type LeadScore = {
  score: number;
  tier: LeadTier;
  tierLabel: string;
  tierColor: string;
  tierBg: string;
  factors: ScoreFactor[];
};

export const TIER_CONFIG: Record<LeadTier, { label: string; color: string; bg: string }> = {
  HOT: { label: 'Rất tiềm năng', color: '#b71c1c', bg: '#ffebee' },
  WARM: { label: 'Đang theo sát', color: '#b26a00', bg: '#fff8e1' },
  COLD: { label: 'Cần kích hoạt', color: '#5f6368', bg: '#f1f3f4' },
};

/**
 * Tính điểm tiềm năng chi tiết cho một Lead
 */
export function calculateLeadScore(leadId: string, dbParam?: DatabaseSync): LeadScore {
  const db = dbParam ?? getCrmDb();
  const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(leadId) as LeadRow | undefined;

  if (!lead) {
    return {
      score: 0,
      tier: 'COLD',
      tierLabel: TIER_CONFIG.COLD.label,
      tierColor: TIER_CONFIG.COLD.color,
      tierBg: TIER_CONFIG.COLD.bg,
      factors: [],
    };
  }

  // Nếu lead đã dừng chăm sóc (LOST)
  if (lead.stage === 'LOST') {
    return {
      score: 0,
      tier: 'COLD',
      tierLabel: 'Không tiếp tục',
      tierColor: '#757575',
      tierBg: '#eeeeee',
      factors: [
        {
          category: 'STATUS',
          label: 'Trạng thái dừng chăm sóc (Lost)',
          points: 0,
          achieved: false,
          hint: lead.lost_reason ? `Lý do: ${lead.lost_reason}` : 'Học viên đã từ chối hoặc dừng liên hệ',
        },
      ],
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Kiểm tra NE chính thức
  const neRow = db.prepare('SELECT COALESCE(SUM(delta), 0) AS ne FROM demo_ne_events WHERE lead_id = ?').get(lead.id) as { ne: number };
  const hasNe = Number(neRow?.ne ?? 0) > 0;

  // Lấy dữ liệu hoạt động
  const actRow = db.prepare(`
    SELECT COUNT(*) AS total, MAX(occurred_at) AS latest
    FROM demo_lead_activities WHERE lead_id = ?
  `).get(lead.id) as { total: number; latest: string | null };
  const actCount = Number(actRow?.total ?? 0);
  const latestActTime = actRow?.latest ? Date.parse(actRow.latest) : null;
  const daysSinceLastAct = latestActTime ? Math.floor((now.getTime() - latestActTime) / (1000 * 3600 * 24)) : null;

  // Lấy dữ liệu hồ sơ
  const docRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('RECEIVED', 'VERIFIED') THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified
    FROM demo_lead_documents WHERE lead_id = ?
  `).get(lead.id) as { total: number; received: number; verified: number };
  const docsReceived = Number(docRow?.received ?? 0);
  const docsVerified = Number(docRow?.verified ?? 0);

  // Lấy dữ liệu follow-up
  const followRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'OPEN' AND due_at < ? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN status = 'OPEN' AND due_at >= ? THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done
    FROM demo_followups WHERE lead_id = ?
  `).get(nowIso, nowIso, lead.id) as { total: number; overdue: number; upcoming: number; done: number };
  const followOverdue = Number(followRow?.overdue ?? 0);
  const followUpcoming = Number(followRow?.upcoming ?? 0);
  const followDone = Number(followRow?.done ?? 0);

  // Xây dựng danh sách các yếu tố điểm
  const factors: ScoreFactor[] = [];
  let points = 0;

  // 1. Thông tin liên hệ
  const hasPhone = Boolean(lead.phone_normalized);
  factors.push({
    category: 'CONTACT',
    label: 'Số điện thoại chuẩn hóa',
    points: 20,
    achieved: hasPhone,
    hint: hasPhone ? undefined : 'Bổ sung số điện thoại 10 số chính xác',
  });
  if (hasPhone) points += 20;

  const hasProgram = Boolean(lead.program && lead.program.trim());
  factors.push({
    category: 'CONTACT',
    label: 'Ngành đào tạo quan tâm',
    points: 10,
    achieved: hasProgram,
    hint: hasProgram ? undefined : 'Xác định ngành học học viên muốn theo học',
  });
  if (hasProgram) points += 10;

  // 2. Tương tác & Tư vấn
  const hasEngaged = actCount > 0;
  factors.push({
    category: 'ENGAGEMENT',
    label: 'Đã có nhật ký tư vấn',
    points: 15,
    achieved: hasEngaged,
    hint: hasEngaged ? undefined : 'Thực hiện và ghi nhận cuộc gọi/tin nhắn đầu tiên',
  });
  if (hasEngaged) points += 15;

  const isRecent = daysSinceLastAct !== null && daysSinceLastAct <= 5;
  factors.push({
    category: 'ENGAGEMENT',
    label: 'Tương tác gần đây (trong 5 ngày)',
    points: 15,
    achieved: isRecent,
    hint: isRecent ? undefined : 'Đã quá 5 ngày chưa tương tác lại',
  });
  if (isRecent) points += 15;

  // 3. Hồ sơ giấy tờ
  const hasDocReceived = docsReceived > 0;
  factors.push({
    category: 'DOCUMENTS',
    label: 'Đã nộp giấy tờ hồ sơ',
    points: 15,
    achieved: hasDocReceived,
    hint: hasDocReceived ? undefined : 'Thu thập học bạ / bằng tốt nghiệp / CCCD',
  });
  if (hasDocReceived) points += 15;

  const hasDocVerified = docsVerified > 0;
  factors.push({
    category: 'DOCUMENTS',
    label: 'Đã xác minh hồ sơ hợp lệ',
    points: 10,
    achieved: hasDocVerified,
    hint: hasDocVerified ? undefined : 'Chờ Admin/Leader xác minh tính hợp lệ của hồ sơ',
  });
  if (hasDocVerified) points += 10;

  // 4. Kế hoạch chăm sóc
  const hasActiveFollowup = followUpcoming > 0 || followDone > 0;
  factors.push({
    category: 'FOLLOWUP',
    label: 'Có lịch hẹn chăm sóc tiếp theo',
    points: 15,
    achieved: hasActiveFollowup,
    hint: hasActiveFollowup ? undefined : 'Đặt lịch hẹn gọi lại để duy trì liên hệ',
  });
  if (hasActiveFollowup) points += 15;

  // 5. Thưởng NE chính thức
  if (hasNe) {
    points = 100;
    factors.unshift({
      category: 'STATUS',
      label: 'Đạt NE chính thức (Đã hoàn tất học phí)',
      points: 100,
      achieved: true,
    });
  } else {
    // Trừ điểm nếu có vi phạm
    if (followOverdue > 0) {
      points -= 20;
      factors.push({
        category: 'FOLLOWUP',
        label: `Có ${followOverdue} lịch hẹn follow-up quá hạn`,
        points: -20,
        achieved: false,
        hint: 'Cần xử lý hoàn thành lịch hẹn quá hạn ngay',
      });
    }

    const createdDaysAgo = Math.floor((now.getTime() - Date.parse(lead.created_at)) / (1000 * 3600 * 24));
    if (!hasEngaged && createdDaysAgo >= 2) {
      points -= 15;
      factors.push({
        category: 'ENGAGEMENT',
        label: `Lead tiếp nhận ${createdDaysAgo} ngày chưa liên hệ`,
        points: -15,
        achieved: false,
        hint: 'Vi phạm tốc độ tiếp nhận lead mới',
      });
    }
  }

  const finalScore = Math.max(0, Math.min(100, points));

  let tier: LeadTier = 'COLD';
  if (hasNe || finalScore >= 70) tier = 'HOT';
  else if (finalScore >= 45) tier = 'WARM';

  return {
    score: finalScore,
    tier,
    tierLabel: TIER_CONFIG[tier].label,
    tierColor: TIER_CONFIG[tier].color,
    tierBg: TIER_CONFIG[tier].bg,
    factors,
  };
}

/**
 * Tính điểm nhanh hàng loạt cho danh sách Lead (tối ưu hóa truy vấn, không N+1)
 */
export function getBatchLeadScores(
  leadIds: string[],
  dbParam?: DatabaseSync
): Map<string, { score: number; tier: LeadTier; tierLabel: string; tierColor: string; tierBg: string }> {
  const result = new Map<string, { score: number; tier: LeadTier; tierLabel: string; tierColor: string; tierBg: string }>();
  if (leadIds.length === 0) return result;

  const db = dbParam ?? getCrmDb();
  for (const id of leadIds) {
    const res = calculateLeadScore(id, db);
    result.set(id, {
      score: res.score,
      tier: res.tier,
      tierLabel: res.tierLabel,
      tierColor: res.tierColor,
      tierBg: res.tierBg,
    });
  }

  return result;
}
