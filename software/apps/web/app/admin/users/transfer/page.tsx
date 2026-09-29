import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import TransferClient, { type SalesWorkload } from './transfer-client';

export const dynamic = 'force-dynamic';

export default async function AdminTransferPage() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  if (!['ADMIN', 'LEADER'].includes(user.role)) redirect('/');

  const db = getCrmDb();

  const users = db.prepare(`
    SELECT id, display_name, email, role, status
    FROM demo_users
    WHERE role = 'SALES'
    ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, display_name
  `).all() as Array<{ id: string; display_name: string; email: string; role: string; status: string }>;

  const salesWorkloads: SalesWorkload[] = users.map(u => {
    const leadCount = (db.prepare('SELECT COUNT(*) as n FROM demo_leads WHERE owner_user_id = ?').get(u.id) as { n: number }).n;
    const ctvCount = (db.prepare('SELECT COUNT(*) as n FROM demo_ctv WHERE owner_user_id = ? AND is_active = 1').get(u.id) as { n: number }).n;
    const followupCount = (db.prepare("SELECT COUNT(*) as n FROM demo_followups WHERE assignee_id = ? AND status = 'OPEN'").get(u.id) as { n: number }).n;
    const importCount = (db.prepare('SELECT COUNT(*) as n FROM demo_import_records WHERE assigned_sales_user_id = ?').get(u.id) as { n: number }).n;

    return {
      ...u,
      leadCount,
      ctvCount,
      followupCount,
      importCount,
    };
  });

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <p className="breadcrumb">Quản trị / Nhân sự / Bàn giao</p>
          <h1>Bàn giao nhân sự & Chuyển giao danh mục</h1>
          <p>
            Chuyển giao danh sách Lead, Cộng tác viên và Lịch hẹn chăm sóc khi nhân sự nghỉ việc hoặc luân chuyển nhóm.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link className="outline-button" href="/admin/users" style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}>
            ← Danh sách tài khoản
          </Link>
          <Link href="/">← Dashboard</Link>
        </div>
      </div>

      <section className="admin-panel">
        <TransferClient salesList={salesWorkloads} />
      </section>
    </main>
  );
}
