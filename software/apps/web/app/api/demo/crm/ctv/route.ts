import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, foldName, getCrmDb, normalizePhone } from '@/lib/crm';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const ownerId = user.role === 'SALES' ? user.id : body.ownerUserId;
  if (name.length < 2 || name.length > 120 || (rawPhone && !phone) || typeof ownerId !== 'string') {
    return Response.json({ error: 'Tên, điện thoại hoặc Sales quản lý không hợp lệ.' }, { status: 400 });
  }
  const db = getCrmDb();
  const owner = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(ownerId);
  if (!owner) return Response.json({ error: 'Sales quản lý chưa được duyệt.' }, { status: 400 });
  const key = foldName(name);
  const duplicate = db.prepare(`SELECT 1 FROM demo_ctv
    WHERE (phone_normalized IS NOT NULL AND phone_normalized = ?) OR (name_key = ? AND owner_user_id = ?)
    LIMIT 1`).get(phone, key, ownerId);
  if (duplicate) return Response.json({ error: 'CTV có thể đã tồn tại trong danh sách.' }, { status: 409 });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO demo_ctv
      (id, display_name, name_key, phone_normalized, owner_user_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, name, key, phone, ownerId, user.id, now);
    db.prepare(`INSERT INTO demo_ctv_assignments
      (id, ctv_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
      .run(randomUUID(), id, ownerId, now, user.id);
    auditCrm(db, user.id, 'ctv', id, 'CREATE', null, { ownerId });
    db.exec('COMMIT');
    return Response.json({ id }, { status: 201 });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể tạo CTV.' }, { status: 500 });
  }
}
