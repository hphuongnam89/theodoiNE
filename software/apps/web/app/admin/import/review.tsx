'use client';

import { useState } from 'react';

type Alias = { owner_key: string; source_name: string; rows: number; assigned: number; approved_sales_user_id: string | null };
type Sales = { id: string; display_name: string; email: string };

export default function AliasReview({ aliases: initial, sales }: { aliases: Alias[]; sales: Sales[] }) {
  const [aliases, setAliases] = useState(initial);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function approve(ownerKey: string) {
    const salesUserId = selected[ownerKey] ?? aliases.find(row => row.owner_key === ownerKey)?.approved_sales_user_id;
    if (!salesUserId) { setError('Hãy chọn tài khoản Sales.'); return; }
    setBusy(ownerKey); setError('');
    try {
      const response = await fetch('/api/demo/admin/owner-alias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerKey, salesUserId }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể lưu ánh xạ.'); return; }
      setAliases(rows => rows.map(row => row.owner_key === ownerKey
        ? { ...row, approved_sales_user_id: salesUserId, assigned: row.rows } : row));
    } catch { setError('Không thể kết nối.'); } finally { setBusy(null); }
  }
  return <>
    {sales.length === 0 && <p className="form-error">Chưa có tài khoản Sales hoạt động. Hãy đăng ký và duyệt tài khoản trước khi ánh xạ.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="alias-list">{aliases.map(row => <div className="alias-row" key={row.owner_key}>
      <div><strong>{row.source_name}</strong><small>{row.rows} dòng · {row.assigned} đã gán</small></div>
      <select aria-label={`Sales cho ${row.source_name}`} value={selected[row.owner_key] ?? row.approved_sales_user_id ?? ''}
        onChange={event => setSelected(values => ({ ...values, [row.owner_key]: event.target.value }))}>
        <option value="">Chọn Sales</option>{sales.map(user => <option key={user.id} value={user.id}>{user.display_name} · {user.email}</option>)}
      </select><button disabled={busy === row.owner_key || sales.length === 0} onClick={() => approve(row.owner_key)}>{busy === row.owner_key ? 'Đang lưu…' : 'Duyệt'}</button>
    </div>)}</div>
  </>;
}
