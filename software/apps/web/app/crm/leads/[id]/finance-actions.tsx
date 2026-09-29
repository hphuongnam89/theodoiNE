'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type PaymentView = {
  id: string; kind: 'RECEIPT' | 'REFUND'; amount_vnd: number; bank_at: string;
  reference_code: string; status: string; review_reason: string | null;
  evidence_file_name?: string | null; evidence_url?: string | null;
};
type DocumentView = { document_type: string; status: string; note: string | null };
const TYPES: Record<string, string> = { APPLICATION: 'Đơn đăng ký', IDENTITY: 'Giấy tờ tùy thân', ACADEMIC: 'Bằng/học bạ', PHOTO: 'Ảnh', OTHER: 'Khác' };
const STATUS: Record<string, string> = { MISSING: 'Thiếu', RECEIVED: 'Đã nhận', VERIFIED: 'Đã xác minh' };

export default function FinanceActions({ leadId, role, payments, documents }: {
  leadId: string; role: string; payments: PaymentView[]; documents: DocumentView[];
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'RECEIPT' | 'REFUND'>('RECEIPT');
  const [uploadingPaymentId, setUploadingPaymentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function sendJson(url: string, body: object) {
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể lưu.'); return false; }
      router.refresh(); return true;
    } catch { setError('Không thể kết nối.'); return false; }
    finally { setBusy(false); }
  }

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawBankAt = String(data.get('bankAt') || '');
    const parsedDate = new Date(rawBankAt);
    if (isNaN(parsedDate.getTime())) {
      setError('Ngày giờ ngân hàng không hợp lệ.');
      return;
    }
    data.set('bankAt', parsedDate.toISOString());

    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/demo/crm/leads/${leadId}/payments`, {
        method: 'POST',
        body: data,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? 'Không thể lưu.');
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError('Không thể kết nối máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await sendJson(`/api/demo/crm/leads/${leadId}/documents`, {
      documentType: data.get('documentType'), status: data.get('status'), note: data.get('note'),
    })) form.reset();
  }

  async function uploadEvidenceForPayment(paymentId: string, file: File) {
    const data = new FormData();
    data.append('evidence', file);
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/demo/crm/payments/${paymentId}/evidence`, {
        method: 'POST',
        body: data,
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? 'Không thể tải chứng từ.');
      else router.refresh();
    } catch {
      setError('Không thể kết nối.');
    } finally {
      setBusy(false);
      setUploadingPaymentId(null);
    }
  }

  async function review(id: string, decision: string) {
    const reason = decision === 'REJECTED' ? window.prompt('Lý do từ chối giao dịch:') : '';
    if (decision === 'REJECTED' && !reason) return;
    await sendJson(`/api/demo/crm/payments/${id}/review`, { decision, reason });
  }

  const receipts = payments.filter(p => p.kind === 'RECEIPT' && p.status === 'CONFIRMED');

  return <section className="admin-panel finance-panel"><h2>Học phí và hồ sơ</h2>
    <p className="review-note">NE chỉ phát sinh sau khi Admin/Leader duyệt khoản thu. Ngày NE là thời điểm tiền vào tài khoản.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="finance-grid"><div><h3>Giao dịch học phí</h3>
      {payments.length === 0 && <p className="empty-state">Chưa có giao dịch.</p>}
      {payments.map(item => <div className="finance-row" key={item.id}><div>
        <strong>{item.kind === 'RECEIPT' ? 'Thu' : 'Hoàn'} {item.amount_vnd.toLocaleString('vi-VN')} ₫</strong>
        <small>{new Date(item.bank_at).toLocaleString('vi-VN')} · {item.reference_code} · {item.status === 'PENDING' ? 'Chờ duyệt' : item.status === 'CONFIRMED' ? 'Đã duyệt' : 'Từ chối'}</small>
        {item.review_reason && <small>Lý do: {item.review_reason}</small>}
        {item.evidence_file_name ? (
          <div style={{ marginTop: '5px' }}>
            <a href={item.evidence_url ?? `/api/demo/crm/payments/${item.id}/evidence`} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#3155bf', textDecoration: 'underline' }}>
              📎 Xem chứng từ ({item.evidence_file_name})
            </a>
          </div>
        ) : (
          item.status === 'PENDING' && (
            <div style={{ marginTop: '5px' }}>
              <label style={{ fontSize: '11px', color: '#65748b', cursor: 'pointer', textDecoration: 'underline' }}>
                + Đính kèm chứng từ
                <input
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadEvidenceForPayment(item.id, f);
                  }}
                />
              </label>
            </div>
          )
        )}
      </div>
        {role !== 'SALES' && item.status === 'PENDING' && <div className="review-buttons"><button disabled={busy} onClick={() => review(item.id, 'CONFIRMED')}>Xác nhận</button><button className="secondary" disabled={busy} onClick={() => review(item.id, 'REJECTED')}>Từ chối</button></div>}</div>)}
      <form className="crm-form" onSubmit={addPayment}><h3>Ghi giao dịch để đối soát</h3>
        <label>Loại<select value={kind} onChange={e => setKind(e.target.value as 'RECEIPT' | 'REFUND')}><option value="RECEIPT">Thu học phí</option><option value="REFUND">Hoàn học phí</option></select></label>
        {kind === 'REFUND' && <label>Khoản thu gốc<select name="originalReceiptId" required><option value="">Chọn khoản thu</option>{receipts.map(p => <option value={p.id} key={p.id}>{p.reference_code} · {p.amount_vnd.toLocaleString('vi-VN')} ₫</option>)}</select></label>}
        <label>Số tiền (VND)<input type="number" name="amountVnd" min="1" step="1" required /></label>
        <label>Ngày giờ tiền vào/hoàn tại ngân hàng<input type="datetime-local" name="bankAt" required /></label>
        <label>Mã giao dịch đối soát<input name="referenceCode" minLength={3} maxLength={100} required /></label>
        <label>Chứng từ / Giấy nộp tiền (ảnh chụp hoặc PDF)
          <input type="file" name="evidence" accept="image/*,.pdf" />
        </label>
        <label>Ghi chú<input name="note" maxLength={500} /></label><button disabled={busy}>Gửi duyệt</button>
      </form></div><div><h3>Danh mục hồ sơ</h3>
      {Object.entries(TYPES).map(([type, label]) => { const item = documents.find(d => d.document_type === type);
        return <div className="finance-row" key={type}><div><strong>{label}</strong><small>{STATUS[item?.status ?? 'MISSING']}{item?.note ? ` · ${item.note}` : ''}</small></div></div>; })}
      <form className="crm-form" onSubmit={addDocument}><h3>Cập nhật hồ sơ</h3>
        <label>Loại<select name="documentType">{Object.entries(TYPES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Trạng thái<select name="status"><option value="MISSING">Thiếu</option><option value="RECEIVED">Đã nhận</option>{role !== 'SALES' && <option value="VERIFIED">Đã xác minh</option>}</select></label>
        <label>Ghi chú<input name="note" maxLength={300} /></label><button disabled={busy}>Lưu hồ sơ</button>
      </form></div></div>
  </section>;
}
