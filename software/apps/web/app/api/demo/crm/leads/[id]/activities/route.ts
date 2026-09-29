import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, canWriteLead, getCrmDb, type LeadRow } from '@/lib/crm';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const kind = body.kind;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (kind !== 'CALL' && kind !== 'MESSAGE' && kind !== 'MEETING' && kind !== 'NOTE' ||
      !note || note.length > 1000) {
    return Response.json({ error: 'Chọn loại hoạt động và ghi chú tối đa 1.000 ký tự.' }, { status: 400 });
  }
  const db = getCrmDb();
  const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(id) as LeadRow | undefined;
  if (!lead || !canWriteLead(user, lead)) return Response.json({ error: 'Không tìm thấy lead.' }, { status: 404 });
  const activityId = randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO demo_lead_activities
      (id, lead_id, kind, note, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(activityId, id, kind, note, user.id, now);
    db.prepare('UPDATE demo_leads SET updated_at = ? WHERE id = ?').run(now, id);
    auditCrm(db, user.id, 'activity', activityId, 'CREATE', null, { leadId: id, kind });
    db.exec('COMMIT');
    return Response.json({ id: activityId }, { status: 201 });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể lưu hoạt động.' }, { status: 500 });
  }
}
