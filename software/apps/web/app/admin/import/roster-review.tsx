'use client';

import { useState } from 'react';

type Roster = { id: string; display_name: string; phones: string | null; active_ctv_id: string | null };
type Sales = { id: string; display_name: string; email: string };

export default function RosterReview({ roster: initial, sales }: { roster: Roster[]; sales: Sales[] }) {
  const [roster, setRoster] = useState(initial);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function approve(id: string) {
    if (!owners[id]) { setError('Hãy chọn Sales quản lý CTV.'); return; }
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/demo/admin/ctv-roster/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId: owners[id], phone: phones[id] }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể duyệt CTV.'); return; }
      setRoster(items => items.map(item => item.id === id ? { ...item, active_ctv_id: result.id } : item));
    } catch { setError('Không thể kết nối.'); } finally { setBusy(null); }
  }
  return <><p className="list-count">{roster.filter(item => item.active_ctv_id).length}/{roster.length} CTV đã duyệt</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {roster.map(item => { const choices = item.phones?.split('|') ?? []; return <div className="alias-row roster-row" key={item.id}>
      <div><strong>{item.display_name}</strong><small>{choices.join(', ') || 'Chưa có số hợp lệ'}</small></div>
      {item.active_ctv_id ? <span className="status-pill">Đã duyệt</span> : <>
        <select aria-label={`Sales quản lý ${item.display_name}`} value={owners[item.id] ?? ''} onChange={event => setOwners(values => ({ ...values, [item.id]: event.target.value }))}>
          <option value="">Chọn Sales</option>{sales.map(user => <option key={user.id} value={user.id}>{user.display_name} · {user.email}</option>)}
        </select>
        {choices.length > 1 && <select aria-label={`Điện thoại ${item.display_name}`} value={phones[item.id] ?? ''} onChange={event => setPhones(values => ({ ...values, [item.id]: event.target.value }))}>
          <option value="">Chọn số</option>{choices.map(phone => <option key={phone} value={phone}>{phone}</option>)}
        </select>}
        <button disabled={busy === item.id || sales.length === 0} onClick={() => approve(item.id)}>{busy === item.id ? 'Đang lưu…' : 'Duyệt'}</button>
      </>}
    </div>; })}
  </>;
}
