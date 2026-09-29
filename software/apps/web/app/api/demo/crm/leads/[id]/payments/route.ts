import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, canWriteLead, getCrmDb, type LeadRow } from '@/lib/crm';
import { validBankAt, type Payment } from '@/lib/finance';

export const runtime = 'nodejs';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  const { id } = await context.params;

  let kind: unknown;
  let amount: unknown;
  let bankAt: string | null = null;
  let reference = '';
  let note = '';
  let originalId: string | null = null;
  let evidenceFile: File | null = null;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try { formData = await request.formData(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
    kind = formData.get('kind');
    amount = Number(formData.get('amountVnd'));
    bankAt = validBankAt(formData.get('bankAt'));
    reference = typeof formData.get('referenceCode') === 'string' ? String(formData.get('referenceCode')).trim().toUpperCase() : '';
    note = typeof formData.get('note') === 'string' ? String(formData.get('note')).trim() : '';
    const orig = formData.get('originalReceiptId');
    originalId = typeof orig === 'string' && orig ? orig : null;
    const file = formData.get('evidence');
    if (file instanceof File && file.size > 0) {
      evidenceFile = file;
    }
  } else {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
    kind = body.kind;
    amount = body.amountVnd;
    bankAt = validBankAt(body.bankAt);
    reference = typeof body.referenceCode === 'string' ? body.referenceCode.trim().toUpperCase() : '';
    note = typeof body.note === 'string' ? body.note.trim() : '';
    originalId = typeof body.originalReceiptId === 'string' ? body.originalReceiptId : null;
  }

  if ((kind !== 'RECEIPT' && kind !== 'REFUND') || typeof amount !== 'number' || !Number.isSafeInteger(amount) ||
      amount <= 0 || amount > 1_000_000_000_000 || !bankAt || reference.length < 3 || reference.length > 100 ||
      note.length > 500 || (kind === 'REFUND' && !originalId) || (kind === 'RECEIPT' && originalId)) {
    return Response.json({ error: 'Loại giao dịch, số tiền, thời điểm hoặc mã đối soát không hợp lệ.' }, { status: 400 });
  }

  let evidenceFileName: string | null = null;
  let evidenceUrl: string | null = null;

  if (evidenceFile) {
    if (evidenceFile.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'Tệp chứng từ không được vượt quá 10MB.' }, { status: 400 });
    }
    const ext = path.extname(evidenceFile.name).toLowerCase();
    if (!ALLOWED_MIME.has(evidenceFile.type) && !ALLOWED_EXT.has(ext)) {
      return Response.json({ error: 'Định dạng chứng từ chỉ hỗ trợ ảnh (PNG, JPG, WEBP) hoặc PDF.' }, { status: 400 });
    }
  }

  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(id) as LeadRow | undefined;
    if (!lead || !canWriteLead(user, lead)) {
      db.exec('ROLLBACK'); return Response.json({ error: 'Không tìm thấy lead.' }, { status: 404 });
    }
    const duplicate = db.prepare(`SELECT id FROM demo_payments WHERE reference_code = ? AND kind = ? AND status <> 'REJECTED'`)
      .get(reference, kind);
    if (duplicate) { db.exec('ROLLBACK'); return Response.json({ error: 'Mã đối soát đã được ghi nhận.' }, { status: 409 }); }
    if (kind === 'REFUND') {
      const original = db.prepare("SELECT * FROM demo_payments WHERE id = ? AND lead_id = ? AND kind = 'RECEIPT' AND status = 'CONFIRMED'")
        .get(originalId, id) as Payment | undefined;
      if (!original || bankAt < original.bank_at) {
        db.exec('ROLLBACK'); return Response.json({ error: 'Chọn khoản thu đã duyệt và ngày hoàn sau ngày thu.' }, { status: 400 });
      }
      const refunded = db.prepare("SELECT COALESCE(SUM(amount_vnd),0) AS amount FROM demo_payments WHERE original_receipt_id = ? AND status <> 'REJECTED'")
        .get(originalId) as { amount: number };
      if (refunded.amount + amount > original.amount_vnd) {
        db.exec('ROLLBACK'); return Response.json({ error: 'Tổng tiền hoàn vượt khoản thu gốc.' }, { status: 409 });
      }
    }
    const paymentId = randomUUID();
    const now = new Date().toISOString();

    if (evidenceFile) {
      const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
      mkdirSync(uploadsDir, { recursive: true });
      const ext = path.extname(evidenceFile.name).toLowerCase() || '.bin';
      const safeBase = path.basename(evidenceFile.name, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 50);
      const diskFilename = `${paymentId}-${safeBase}${ext}`;
      const bytes = Buffer.from(await evidenceFile.arrayBuffer());
      writeFileSync(path.join(uploadsDir, diskFilename), bytes);
      evidenceFileName = evidenceFile.name.slice(0, 200);
      evidenceUrl = `/api/demo/crm/payments/${paymentId}/evidence`;
    }

    db.prepare(`INSERT INTO demo_payments
      (id, lead_id, kind, amount_vnd, bank_at, reference_code, note, original_receipt_id,
       status, evidence_file_name, evidence_url, submitted_by, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`)
      .run(paymentId, id, kind, amount, bankAt, reference, note || null, originalId,
           evidenceFileName, evidenceUrl, user.id, now);
    auditCrm(db, user.id, 'payment', paymentId, 'SUBMIT', null,
      { leadId: id, kind, amountVnd: amount, bankAt, referenceCode: reference, hasEvidence: Boolean(evidenceFile) });
    db.exec('COMMIT');
    return Response.json({ id: paymentId }, { status: 201 });
  } catch {
    db.exec('ROLLBACK'); return Response.json({ error: 'Không thể ghi giao dịch.' }, { status: 500 });
  }
}
