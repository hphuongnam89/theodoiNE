'use client';

import { useState } from 'react';

type User = { id: string; email: string; display_name: string; role: string; status: string; created_at: string };

export default function ApprovalList({ users: initial }: { users: User[] }) {
  const [users, setUsers] = useState(initial);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function decide(id: string, decision: 'APPROVE' | 'REJECT') {
    setBusy(id);
    setError('');
    try {
      const response = await fetch(`/api/demo/admin/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, role: roles[id] ?? 'SALES' }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể cập nhật tài khoản.'); return; }
      setUsers(current => current.map(user => user.id === id
        ? { ...user, status: result.status, role: decision === 'APPROVE' ? roles[id] ?? 'SALES' : user.role }
        : user));
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setBusy(null);
    }
  }

  const pending = users.filter(user => user.status === 'PENDING');
  const reviewed = users.filter(user => user.status !== 'PENDING');
  return <>
    <section className="admin-panel"><h2>Chờ duyệt <span>{pending.length}</span></h2>
      {pending.length === 0 ? <p className="empty-state">Chưa có tài khoản nào đang chờ.</p> :
        pending.map(user => <div className="approval-row" key={user.id}>
          <div><strong>{user.display_name}</strong><p>{user.email}</p><small>Đăng ký {new Date(user.created_at).toLocaleString('vi-VN')}</small></div>
          <div className="approval-actions"><select aria-label={`Vai trò cho ${user.display_name}`} value={roles[user.id] ?? 'SALES'} onChange={event => setRoles(current => ({ ...current, [user.id]: event.target.value }))}>
            <option value="SALES">Sales</option><option value="LEADER">Leader</option><option value="ADMIN">Admin</option>
          </select><button disabled={busy === user.id} onClick={() => decide(user.id, 'APPROVE')}>Duyệt</button><button className="secondary" disabled={busy === user.id} onClick={() => decide(user.id, 'REJECT')}>Từ chối</button></div>
        </div>)}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
    <section className="admin-panel"><h2>Đã xử lý</h2>
      {reviewed.map(user => <div className="approval-row reviewed" key={user.id}><div><strong>{user.display_name}</strong><p>{user.email}</p></div><span className={`status-pill ${user.status.toLowerCase()}`}>{user.status === 'ACTIVE' ? user.role : 'Từ chối'}</span></div>)}
    </section>
  </>;
}
