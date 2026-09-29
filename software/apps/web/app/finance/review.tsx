'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Item = {
  id: string; kind: string; amount_vnd: number; bank_at: string; reference_code: string;
  status: string; review_reason: string | null; lead_id: string; full_name: string; owner_name: string;
  evidence_file_name?: string | null; evidence_url?: string | null;
};

export default function FinanceReview({ payments, canReview }: { payments: Item[]; canReview: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function review(id: string, decision: string) {
    const reason = decision === 'REJECTED' ? window.prompt('Lý do từ chối:') : '';
    if (decision === 'REJECTED' && !reason) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/demo/crm/payments/${id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason }),
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? 'Không thể duyệt.'); else router.refresh();
    } catch { setError('Không thể kết nối.'); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel">
    {error && <p className="form-error" role="alert">{error}</p>}
    {payments.length === 0 && <p className="empty-state">Chưa có giao dịch phù hợp điều kiện lọc.</p>}
    {payments.map(item => <div className="finance-row" key={item.id}><div>
      <strong><Link href={`/crm/leads/${item.lead_id}`}>{item.full_name}</Link> · {item.kind === 'RECEIPT' ? 'Thu' : 'Hoàn'} {item.amount_vnd.toLocaleString('vi-VN')} ₫</strong>
      <small>{new Date(item.bank_at).toLocaleString('vi-VN')} · {item.reference_code} · {item.owner_name} · {item.status === 'PENDING' ? 'Chờ duyệt' : item.status === 'CONFIRMED' ? 'Đã duyệt' : 'Từ chối'}</small>
      {item.review_reason && <small>Lý do từ chối: {item.review_reason}</small>}
      {item.evidence_file_name && (
        <div style={{ marginTop: '5px' }}>
          <a href={item.evidence_url ?? `/api/demo/crm/payments/${item.id}/evidence`} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#3155bf', textDecoration: 'underline' }}>
            📎 Xem chứng từ ({item.evidence_file_name})
          </a>
        </div>
      )}
    </div>
      {canReview && item.status === 'PENDING' && <div className="review-buttons"><button disabled={busy} onClick={() => review(item.id, 'CONFIRMED')}>Xác nhận</button>
        <button disabled={busy} className="secondary" onClick={() => review(item.id, 'REJECTED')}>Từ chối</button></div>}
    </div>)}
  </section>;
}
