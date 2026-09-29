import { randomUUID } from 'node:crypto';
import { getDemoDb, getSessionUser, sameOrigin } from '@/lib/demo-auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const actor = await getSessionUser();
  if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'ADMIN') {
    return Response.json({ error: 'Không có quyền.' }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const ownerKey = body.ownerKey;
  const salesUserId = body.salesUserId;
  if (typeof ownerKey !== 'string' || !ownerKey || ownerKey.length > 120 ||
      typeof salesUserId !== 'string' || salesUserId.length > 100) {
    return Response.json({ error: 'Tên nguồn hoặc sales không hợp lệ.' }, { status: 400 });
  }
  const db = getDemoDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const alias = db.prepare('SELECT COUNT(*) AS n FROM demo_import_records WHERE owner_key = ?').get(ownerKey) as { n: number };
    const sales = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(salesUserId);
    if (!alias.n || !sales) {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Cần chọn tên nguồn có thật và tài khoản Sales đã được duyệt.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const update = db.prepare(`UPDATE demo_import_records
      SET assigned_sales_user_id = ?, assignment_source = 'OWNER_ALIAS', reviewed_at = ?, reviewed_by = ?
      WHERE owner_key = ? AND (assignment_source IS NULL OR assignment_source = 'OWNER_ALIAS')`)
      .run(salesUserId, now, actor.id, ownerKey);
    db.prepare(`INSERT INTO demo_owner_alias_approvals
      (owner_key, approved_sales_user_id, approved_by, approved_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_key) DO UPDATE SET approved_sales_user_id = excluded.approved_sales_user_id,
        approved_by = excluded.approved_by, approved_at = excluded.approved_at`)
      .run(ownerKey, salesUserId, actor.id, now);
    db.prepare(`INSERT INTO demo_import_audit
      (id, actor_id, owner_key, sales_user_id, affected_rows, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), actor.id, ownerKey, salesUserId, Number(update.changes), now);
    db.exec('COMMIT');
    return Response.json({ ok: true, affectedRows: Number(update.changes) });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể lưu ánh xạ.' }, { status: 500 });
  }
}
