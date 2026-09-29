import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb, hasPotentialDuplicate, normalizePhone } from '@/lib/crm';

export const runtime = 'nodejs';

const SOURCES = new Set(['DIRECT', 'CTV', 'WEB', 'PHONE', 'EXCEL', 'OTHER']);

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const contactText = typeof body.contactText === 'string' ? body.contactText.trim() : '';
  const program = typeof body.program === 'string' ? body.program.trim() : '';
  const source = body.source ?? 'DIRECT';
  const ctvId = typeof body.ctvId === 'string' && body.ctvId ? body.ctvId : null;
  const ownerId = user.role === 'SALES' ? user.id : body.ownerUserId;
  if (name.length < 2 || name.length > 120 || (rawPhone && !phone) ||
      (!phone && !contactText) || contactText.length > 300 || program.length > 120 ||
      typeof source !== 'string' || !SOURCES.has(source) || typeof ownerId !== 'string') {
    return Response.json({ error: 'Kiểm tra họ tên, liên hệ, ngành và nguồn lead.' }, { status: 400 });
  }
  const db = getCrmDb();
  const owner = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(ownerId);
  if (!owner) return Response.json({ error: 'Sales phụ trách chưa được duyệt.' }, { status: 400 });
  if (ctvId) {
    const ctv = db.prepare('SELECT owner_user_id FROM demo_ctv WHERE id = ? AND is_active = 1').get(ctvId) as
      { owner_user_id: string } | undefined;
    if (!ctv || ctv.owner_user_id !== ownerId) {
      return Response.json({ error: 'CTV không thuộc Sales phụ trách.' }, { status: 400 });
    }
  }
  if (phone && hasPotentialDuplicate(db, phone) && body.ackDuplicate !== true) {
    return Response.json({ duplicate: true, error: 'Số điện thoại có thể đã có trong CRM hoặc Excel. Hãy kiểm tra trước khi tiếp tục.' }, { status: 409 });
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO demo_leads
      (id, full_name, phone_normalized, contact_text, program, source, stage,
       owner_user_id, ctv_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?)`)
      .run(id, name, phone, contactText || null, program || null, source, ownerId, ctvId, user.id, now, now);
    db.prepare(`INSERT INTO demo_lead_stage_events
      (id, lead_id, old_stage, new_stage, actor_id, occurred_at) VALUES (?, ?, NULL, 'NEW', ?, ?)`)
      .run(randomUUID(), id, user.id, now);
    db.prepare(`INSERT INTO demo_lead_owner_assignments
      (id, lead_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
      .run(randomUUID(), id, ownerId, now, user.id);
    auditCrm(db, user.id, 'lead', id, 'CREATE', null, { ownerId, source, ctvId, stage: 'NEW' });
    db.exec('COMMIT');
    return Response.json({ id }, { status: 201 });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể tạo lead.' }, { status: 500 });
  }
}
