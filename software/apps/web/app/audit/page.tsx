import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';

export const dynamic = 'force-dynamic';

const ACTION: Record<string, string> = {
  CREATE: 'Tạo mới', UPDATE: 'Cập nhật', TRANSFER: 'Bàn giao', ACTIVATE_IMPORT: 'Kích hoạt Excel',
  APPROVE_ROSTER: 'Duyệt CTV', SUBMIT: 'Gửi đối soát', CONFIRMED: 'Xác nhận học phí',
  REJECTED: 'Từ chối học phí', RECALCULATE_NE: 'Tính lại NE',
};

export default async function AuditPage() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  if (user.role === 'SALES') redirect('/');
  const db = getCrmDb();
  const rows = db.prepare(`SELECT a.id, a.entity_type, a.entity_id, a.action, a.occurred_at,
    a.before_json, a.after_json, u.display_name AS actor_name
    FROM demo_crm_audit a JOIN demo_users u ON u.id = a.actor_id
    ORDER BY a.occurred_at DESC LIMIT 300`).all() as Array<{ id: string; entity_type: string;
      entity_id: string; action: string; occurred_at: string; before_json: string | null;
      after_json: string | null; actor_name: string }>;
  return <main className="admin-page crm-page"><div className="admin-header"><div><p className="breadcrumb">Quản trị / Nhật ký</p>
    <h1>Biến động hệ thống</h1><p>Ghi nhận người thực hiện, thời điểm và thay đổi quan trọng.</p></div><Link href="/">← Dashboard</Link></div>
    <section className="admin-panel"><h2>{rows.length} thay đổi gần nhất</h2>
      {rows.length === 0 && <p className="empty-state">Chưa có thay đổi.</p>}
      {rows.map(row => <div className="finance-row" key={row.id}><div><strong>{ACTION[row.action] ?? row.action} · {row.entity_type}</strong>
        <small>{row.actor_name} · {new Date(row.occurred_at).toLocaleString('vi-VN')} · ID: {row.entity_id}</small>
        {row.after_json && <small className="audit-detail">{row.after_json}</small>}</div></div>)}
    </section>
  </main>;
}
