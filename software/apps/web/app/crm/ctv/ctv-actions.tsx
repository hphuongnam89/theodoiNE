'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type Ctv = { id: string; display_name: string; phone_normalized: string | null; owner_user_id: string; owner_name: string };
type Sales = { id: string; display_name: string };

export default function CtvActions({ role, sales, ctv }: { role: string; sales: Sales[]; ctv: Ctv[] }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch('/api/demo/crm/ctv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.get('name'), phone: data.get('phone'), ownerUserId: data.get('ownerUserId') }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể tạo CTV.'); return; }
      form.reset(); router.refresh();
    } catch { setError('Không thể kết nối.'); } finally { setBusy(false); }
  }
  async function transfer(id: string) {
    const ownerUserId = transfers[id];
    if (!ownerUserId) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/demo/crm/ctv/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể chuyển CTV.'); return; }
      router.refresh();
    } catch { setError('Không thể kết nối.'); } finally { setBusy(false); }
  }
  return <div className="crm-grid"><section className="admin-panel"><h2>Thêm CTV</h2>
    <form className="crm-form" onSubmit={create}><label>Họ tên<input name="name" required maxLength={120} /></label>
      <label>Điện thoại<input name="phone" inputMode="tel" /></label>
      {role !== 'SALES' && <label>Sales quản lý<select name="ownerUserId" required><option value="">Chọn Sales</option>{sales.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>}
      {error && <p className="form-error" role="alert">{error}</p>}<button disabled={busy}>Thêm CTV</button></form>
    </section><section className="admin-panel"><h2>CTV đang quản lý <span>{ctv.length}</span></h2>
      {ctv.length === 0 && <p className="empty-state">Chưa có CTV chính thức. Roster Excel vẫn là dự thảo.</p>}
      {ctv.map(item => <div className="ctv-row" key={item.id}><div><strong>{item.display_name}</strong><small>{item.phone_normalized ?? 'Chưa có số điện thoại'} · Sales: {item.owner_name}</small></div>
        {role !== 'SALES' && <div className="ctv-transfer"><select aria-label={`Chuyển ${item.display_name}`} value={transfers[item.id] ?? item.owner_user_id} onChange={event => setTransfers(values => ({ ...values, [item.id]: event.target.value }))}>
          {sales.map(option => <option key={option.id} value={option.id}>{option.display_name}</option>)}</select>
          <button disabled={busy || !transfers[item.id] || transfers[item.id] === item.owner_user_id} onClick={() => transfer(item.id)}>Chuyển</button></div>}
      </div>)}
    </section></div>;
}
