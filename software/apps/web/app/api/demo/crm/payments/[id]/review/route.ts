import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb, type LeadRow } from '@/lib/crm';
import { projectNeEvents, type Payment } from '@/lib/finance';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE' || user.role === 'SALES')
    return Response.json({ error: 'Chỉ Admin/Leader được đối soát học phí.' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const decision = body.decision;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if ((decision !== 'CONFIRMED' && decision !== 'REJECTED') || (decision === 'REJECTED' && !reason) || reason.length > 300)
    return Response.json({ error: 'Quyết định hoặc lý do từ chối không hợp lệ.' }, { status: 400 });
  const { id } = await context.params;
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const payment = db.prepare('SELECT * FROM demo_payments WHERE id = ?').get(id) as Payment | undefined;
    if (!payment || payment.status !== 'PENDING') {
      db.exec('ROLLBACK'); return Response.json({ error: 'Giao dịch không còn chờ duyệt.' }, { status: 409 });
    }
    const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(payment.lead_id) as LeadRow;
    if (decision === 'CONFIRMED' && payment.kind === 'REFUND') {
      const original = db.prepare("SELECT * FROM demo_payments WHERE id = ? AND lead_id = ? AND status = 'CONFIRMED' AND kind = 'RECEIPT'")
        .get(payment.original_receipt_id, payment.lead_id) as Payment | undefined;
      const refunded = db.prepare(`SELECT COALESCE(SUM(amount_vnd),0) AS amount FROM demo_payments
        WHERE original_receipt_id = ? AND status = 'CONFIRMED'`).get(payment.original_receipt_id) as { amount: number };
      if (!original || refunded.amount + payment.amount_vnd > original.amount_vnd) {
        db.exec('ROLLBACK'); return Response.json({ error: 'Khoản hoàn không còn khớp khoản thu.' }, { status: 409 });
      }
    }
    db.prepare('UPDATE demo_payments SET status = ?, reviewed_by = ?, reviewed_at = ?, review_reason = ? WHERE id = ?')
      .run(decision, user.id, new Date().toISOString(), reason || null, id);
    const projection = decision === 'CONFIRMED' ? projectNeEvents(db, lead, user.id) : null;
    auditCrm(db, user.id, 'payment', id, decision, { status: 'PENDING' },
      { status: decision, reason: reason || null, ne: projection });
    db.exec('COMMIT');
    return Response.json({ ok: true, ne: projection });
  } catch (error) {
    db.exec('ROLLBACK');
    return Response.json({ error: error instanceof Error && error.message === 'REFUND_EXCEEDS_BALANCE'
      ? 'Theo thứ tự ngày ngân hàng, tiền hoàn vượt số đã thu. Kiểm tra lại thời điểm giao dịch.' : 'Không thể duyệt giao dịch.' }, { status: 409 });
  }
}
