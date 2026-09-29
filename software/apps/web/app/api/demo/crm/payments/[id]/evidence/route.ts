import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, canReadLead, canWriteLead, getCrmDb, type LeadRow } from '@/lib/crm';
import type { Payment } from '@/lib/finance';

export const runtime = 'nodejs';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return new Response('Chưa đăng nhập.', { status: 401 });
  const { id } = await context.params;
  const db = getCrmDb();
  const payment = db.prepare('SELECT * FROM demo_payments WHERE id = ?').get(id) as Payment | undefined;
  if (!payment || !payment.evidence_file_name) return new Response('Chứng từ không tồn tại.', { status: 404 });
  const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(payment.lead_id) as LeadRow | undefined;
  if (!lead || !canReadLead(user, lead, db)) return new Response('Không có quyền xem chứng từ.', { status: 403 });

  const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
  try {
    const files = readdirSync(uploadsDir);
    const targetFile = files.find(file => file.startsWith(`${id}-`));
    if (!targetFile) return new Response('Tệp không còn trên máy chủ.', { status: 404 });
    const fullPath = path.join(uploadsDir, targetFile);
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    const buffer = readFileSync(fullPath);
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(payment.evidence_file_name)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Không thể đọc tệp.', { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  const { id } = await context.params;
  const db = getCrmDb();
  const payment = db.prepare('SELECT * FROM demo_payments WHERE id = ?').get(id) as Payment | undefined;
  if (!payment) return Response.json({ error: 'Giao dịch không tồn tại.' }, { status: 404 });
  const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(payment.lead_id) as LeadRow | undefined;
  if (!lead || !canWriteLead(user, lead)) return Response.json({ error: 'Không có quyền sửa giao dịch.' }, { status: 403 });

  let formData: FormData;
  try { formData = await request.formData(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const file = formData.get('evidence');
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'Vui lòng chọn tệp chứng từ.' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'Tệp không được vượt quá 10MB.' }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.has(ext)) {
    return Response.json({ error: 'Định dạng chứng từ chỉ hỗ trợ ảnh (PNG, JPG, WEBP) hoặc PDF.' }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  const safeBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 50);
  const diskFilename = `${id}-${safeBase}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  writeFileSync(path.join(uploadsDir, diskFilename), bytes);

  const evidenceFileName = file.name.slice(0, 200);
  const evidenceUrl = `/api/demo/crm/payments/${id}/evidence`;
  db.prepare('UPDATE demo_payments SET evidence_file_name = ?, evidence_url = ? WHERE id = ?')
    .run(evidenceFileName, evidenceUrl, id);
  auditCrm(db, user.id, 'payment', id, 'UPLOAD_EVIDENCE', { before: payment.evidence_file_name }, { after: evidenceFileName });
  return Response.json({ ok: true, url: evidenceUrl, fileName: evidenceFileName });
}
