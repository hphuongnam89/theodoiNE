import { addAudit, getDemoDb, getSessionUser, sameOrigin } from '@/lib/demo-auth';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const actor = await getSessionUser();
  if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'ADMIN') {
    return Response.json({ error: 'Không có quyền.' }, { status: 403 });
  }
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const decision = body.decision;
  const role = body.role;
  if ((decision !== 'APPROVE' && decision !== 'REJECT') ||
      (decision === 'APPROVE' && role !== 'SALES' && role !== 'LEADER' && role !== 'ADMIN')) {
    return Response.json({ error: 'Quyết định hoặc vai trò không hợp lệ.' }, { status: 400 });
  }
  const db = getDemoDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const target = db.prepare('SELECT status FROM demo_users WHERE id = ?').get(id) as { status: string } | undefined;
    if (!target) { db.exec('ROLLBACK'); return Response.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 }); }
    if (target.status !== 'PENDING') {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Tài khoản này đã được xử lý.' }, { status: 409 });
    }
    const nextStatus = decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED';
    db.prepare(`UPDATE demo_users SET status = ?, role = ?, approved_by = ?, approved_at = ? WHERE id = ?`)
      .run(nextStatus, decision === 'APPROVE' ? role as string : 'SALES', actor.id, new Date().toISOString(), id);
    addAudit(actor.id, id, decision === 'APPROVE' ? `APPROVE_${role}` : 'REJECT');
    db.exec('COMMIT');
    return Response.json({ ok: true, status: nextStatus });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể cập nhật tài khoản.' }, { status: 500 });
  }
}
