'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ActivateImport({ id, phones }: { id: string; phones: string[] }) {
  const router = useRouter();
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(phones[0] ?? '');
  async function activate() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/demo/crm/import/${id}/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, ackDuplicate: duplicate }),
      });
      const result = await response.json();
      if (response.status === 409 && result.duplicate) { setDuplicate(true); setError(result.error); return; }
      if (!response.ok) { setError(result.error ?? 'Không thể kích hoạt.'); return; }
      router.push(`/crm/leads/${result.id}`); router.refresh();
    } catch { setError('Không thể kết nối.'); } finally { setBusy(false); }
  }
  return <div className="activate-box"><p>Chuyển dòng này thành lead vận hành để ghi hoạt động và follow-up. Bản gốc Excel vẫn được giữ riêng.</p>
    {phones.length > 1 && <label>Số điện thoại dùng cho lead<select value={phone} onChange={event => { setPhone(event.target.value); setDuplicate(false); }}>
      {phones.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button disabled={busy} onClick={activate}>{busy ? 'Đang xử lý…' : duplicate ? 'Tạo lead riêng dù nghi trùng' : 'Đưa vào CRM'}</button>
  </div>;
}
