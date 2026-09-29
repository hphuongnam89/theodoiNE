import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb } from '@/lib/crm';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const actor = await getSessionUser();
  if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'ADMIN') {
    return Response.json({ error: 'Chỉ Admin được duyệt roster CTV.' }, { status: 403 });
  }
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const ownerId = body.ownerUserId;
  if (typeof ownerId !== 'string') return Response.json({ error: 'Chọn Sales quản lý.' }, { status: 400 });
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT id, display_name, name_key FROM demo_ctv_roster_draft WHERE id = ?').get(id) as
      { id: string; display_name: string; name_key: string } | undefined;
    const owner = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(ownerId);
    if (!row || !owner) { db.exec('ROLLBACK'); return Response.json({ error: 'Roster hoặc Sales không hợp lệ.' }, { status: 400 }); }
    const activated = db.prepare('SELECT id FROM demo_ctv WHERE origin_roster_id = ?').get(id) as { id: string } | undefined;
    if (activated) { db.exec('ROLLBACK'); return Response.json({ id: activated.id, alreadyActive: true }); }
    const phones = db.prepare('SELECT phone_normalized FROM demo_ctv_phones WHERE ctv_id = ? ORDER BY phone_normalized')
      .all(id) as Array<{ phone_normalized: string }>;
    if (phones.length > 1 && (typeof body.phone !== 'string' || !phones.some(item => item.phone_normalized === body.phone))) {
      db.exec('ROLLBACK'); return Response.json({ error: 'Hãy chọn một số điện thoại CTV.' }, { status: 400 });
    }
    const phone = phones.length > 1 ? body.phone as string : phones[0]?.phone_normalized ?? null;
    const duplicate = db.prepare(`SELECT 1 FROM demo_ctv WHERE
      (phone_normalized IS NOT NULL AND phone_normalized = ?) OR (name_key = ? AND owner_user_id = ?) LIMIT 1`)
      .get(phone, row.name_key, ownerId);
    if (duplicate) { db.exec('ROLLBACK'); return Response.json({ error: 'CTV có thể đã tồn tại; cần đối chiếu trước khi duyệt.' }, { status: 409 }); }
    const ctvId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO demo_ctv
      (id, display_name, name_key, phone_normalized, owner_user_id, created_by, created_at, origin_roster_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(ctvId, row.display_name, row.name_key, phone, ownerId, actor.id, now, id);
    db.prepare(`INSERT INTO demo_ctv_assignments
      (id, ctv_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
      .run(randomUUID(), ctvId, ownerId, now, actor.id);
    db.prepare('UPDATE demo_ctv_roster_draft SET approved_owner_user_id = ? WHERE id = ?').run(ownerId, id);
    auditCrm(db, actor.id, 'ctv', ctvId, 'APPROVE_ROSTER', null, { rosterId: id, ownerId });
    db.exec('COMMIT');
    return Response.json({ id: ctvId }, { status: 201 });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể duyệt CTV.' }, { status: 500 });
  }
}
