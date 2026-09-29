import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb } from '@/lib/crm';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE' || user.role === 'SALES') {
    return Response.json({ error: 'Chỉ Admin/Leader được chuyển CTV.' }, { status: 403 });
  }
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const nextOwner = body.ownerUserId;
  if (typeof nextOwner !== 'string') return Response.json({ error: 'Sales mới không hợp lệ.' }, { status: 400 });
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const ctv = db.prepare('SELECT owner_user_id FROM demo_ctv WHERE id = ? AND is_active = 1').get(id) as
      { owner_user_id: string } | undefined;
    if (!ctv) { db.exec('ROLLBACK'); return Response.json({ error: 'Không tìm thấy CTV.' }, { status: 404 }); }
    const owner = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(nextOwner);
    if (!owner) { db.exec('ROLLBACK'); return Response.json({ error: 'Sales mới chưa được duyệt.' }, { status: 400 }); }
    if (ctv.owner_user_id === nextOwner) { db.exec('ROLLBACK'); return Response.json({ ok: true, unchanged: true }); }
    const now = new Date().toISOString();
    db.prepare('UPDATE demo_ctv_assignments SET effective_to = ? WHERE ctv_id = ? AND effective_to IS NULL').run(now, id);
    db.prepare('UPDATE demo_ctv SET owner_user_id = ? WHERE id = ?').run(nextOwner, id);
    db.prepare(`INSERT INTO demo_ctv_assignments
      (id, ctv_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
      .run(randomUUID(), id, nextOwner, now, user.id);
    auditCrm(db, user.id, 'ctv', id, 'TRANSFER', { ownerId: ctv.owner_user_id }, { ownerId: nextOwner });
    db.exec('COMMIT');
    return Response.json({ ok: true });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể chuyển CTV.' }, { status: 500 });
  }
}
