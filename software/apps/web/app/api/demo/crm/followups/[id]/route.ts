import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, canWriteLead, getCrmDb, type LeadRow } from '@/lib/crm';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  const { id } = await context.params;
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const task = db.prepare(`SELECT f.status, f.lead_id, l.owner_user_id FROM demo_followups f
      JOIN demo_leads l ON l.id = f.lead_id WHERE f.id = ?`).get(id) as
      { status: string; lead_id: string; owner_user_id: string } | undefined;
    if (!task || !canWriteLead(user, { owner_user_id: task.owner_user_id } as LeadRow)) {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Không tìm thấy lịch hẹn.' }, { status: 404 });
    }
    if (task.status !== 'OPEN') { db.exec('ROLLBACK'); return Response.json({ error: 'Lịch hẹn đã hoàn tất.' }, { status: 409 }); }
    db.prepare("UPDATE demo_followups SET status = 'DONE', completed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    auditCrm(db, user.id, 'followup', id, 'COMPLETE', { status: 'OPEN' }, { status: 'DONE' });
    db.exec('COMMIT');
    return Response.json({ ok: true });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể cập nhật lịch hẹn.' }, { status: 500 });
  }
}
