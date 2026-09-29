import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, canWriteLead, getCrmDb, type LeadRow, type LeadStage } from '@/lib/crm';

export const runtime = 'nodejs';

const STAGES = new Set<LeadStage>(['NEW', 'CONTACTED', 'CONSULTING', 'WAITING_DOCUMENTS', 'WAITING_PAYMENT', 'LOST']);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const stage = body.stage;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const ownerUserId = body.ownerUserId;
  if ((stage === undefined && ownerUserId === undefined) ||
      (stage !== undefined && (typeof stage !== 'string' || !STAGES.has(stage as LeadStage))) ||
      (stage === 'LOST' && (!reason || reason.length > 300)) ||
      (reason.length > 300) ||
      (ownerUserId !== undefined && typeof ownerUserId !== 'string')) {
    return Response.json({ error: 'Trạng thái, lý do hoặc owner không hợp lệ.' }, { status: 400 });
  }
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(id) as LeadRow | undefined;
    if (!lead || !canWriteLead(user, lead)) {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Không tìm thấy lead.' }, { status: 404 });
    }
    const nextOwner = typeof ownerUserId === 'string' ? ownerUserId : lead.owner_user_id;
    if (nextOwner !== lead.owner_user_id) {
      if (user.role === 'SALES') {
        db.exec('ROLLBACK');
        return Response.json({ error: 'Chỉ Admin/Leader được chuyển owner.' }, { status: 403 });
      }
      const owner = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(nextOwner);
      if (!owner) { db.exec('ROLLBACK'); return Response.json({ error: 'Sales mới chưa được duyệt.' }, { status: 400 }); }
      if (lead.ctv_id) {
        const ctv = db.prepare('SELECT owner_user_id FROM demo_ctv WHERE id = ?').get(lead.ctv_id) as { owner_user_id: string } | undefined;
        if (ctv?.owner_user_id !== nextOwner) {
          db.exec('ROLLBACK');
          return Response.json({ error: 'Chuyển CTV trước khi chuyển lead sang Sales mới.' }, { status: 400 });
        }
      }
    }
    const nextStage = (stage as LeadStage | undefined) ?? lead.stage;
    const nextReason = nextStage === 'LOST' ? (stage === undefined ? lead.lost_reason : reason) : null;
    const now = new Date().toISOString();
    db.prepare('UPDATE demo_leads SET stage = ?, lost_reason = ?, owner_user_id = ?, updated_at = ? WHERE id = ?')
      .run(nextStage, nextReason, nextOwner, now, id);
    if (nextOwner !== lead.owner_user_id) {
      db.prepare("UPDATE demo_followups SET assignee_id = ? WHERE lead_id = ? AND status = 'OPEN'")
        .run(nextOwner, id);
      db.prepare('UPDATE demo_lead_owner_assignments SET effective_to = ? WHERE lead_id = ? AND effective_to IS NULL')
        .run(now, id);
      db.prepare(`INSERT INTO demo_lead_owner_assignments
        (id, lead_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
        .run(randomUUID(), id, nextOwner, now, user.id);
    }
    if (nextStage !== lead.stage) db.prepare(`INSERT INTO demo_lead_stage_events
      (id, lead_id, old_stage, new_stage, reason, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), id, lead.stage, nextStage, nextReason, user.id, now);
    auditCrm(db, user.id, 'lead', id, 'UPDATE', { stage: lead.stage, ownerId: lead.owner_user_id },
      { stage: nextStage, ownerId: nextOwner });
    db.exec('COMMIT');
    return Response.json({ ok: true });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể cập nhật lead.' }, { status: 500 });
  }
}
