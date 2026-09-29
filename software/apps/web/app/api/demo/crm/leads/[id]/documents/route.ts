import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, canWriteLead, getCrmDb, type LeadRow } from '@/lib/crm';

export const runtime = 'nodejs';
const TYPES = new Set(['APPLICATION', 'IDENTITY', 'ACADEMIC', 'PHOTO', 'OTHER']);
const STATUSES = new Set(['MISSING', 'RECEIVED', 'VERIFIED']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const { id } = await context.params;
  const type = body.documentType;
  const status = body.status;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (typeof type !== 'string' || !TYPES.has(type) || typeof status !== 'string' || !STATUSES.has(status) || note.length > 300)
    return Response.json({ error: 'Thông tin hồ sơ không hợp lệ.' }, { status: 400 });
  if (status === 'VERIFIED' && user.role === 'SALES')
    return Response.json({ error: 'Chỉ Admin/Leader được xác minh hồ sơ.' }, { status: 403 });
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(id) as LeadRow | undefined;
    if (!lead || !canWriteLead(user, lead)) {
      db.exec('ROLLBACK'); return Response.json({ error: 'Không tìm thấy lead.' }, { status: 404 });
    }
    const before = db.prepare('SELECT status, note FROM demo_lead_documents WHERE lead_id = ? AND document_type = ?')
      .get(id, type) as { status: string; note: string | null } | undefined;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO demo_lead_documents
      (id, lead_id, document_type, status, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lead_id, document_type) DO UPDATE SET status = excluded.status,
      note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .run(randomUUID(), id, type, status, note || null, user.id, now);
    auditCrm(db, user.id, 'document', id, 'UPDATE', before ?? null, { type, status, note });
    db.exec('COMMIT'); return Response.json({ ok: true });
  } catch {
    db.exec('ROLLBACK'); return Response.json({ error: 'Không thể cập nhật hồ sơ.' }, { status: 500 });
  }
}
