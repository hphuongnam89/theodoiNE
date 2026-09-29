import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDemoDb, getSessionUser } from '@/lib/demo-auth';
import ApprovalList from './review-list';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.status !== 'ACTIVE' || user.role !== 'ADMIN') redirect('/');
  const users = getDemoDb().prepare(`
    SELECT id, email, display_name, role, status, created_at
    FROM demo_users ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 200
  `).all() as Array<{ id: string; email: string; display_name: string; role: string; status: string; created_at: string }>;
  return <main className="admin-page">
    <div className="admin-header">
      <div>
        <p className="breadcrumb">Quản trị / Tài khoản</p>
        <h1>Duyệt tài khoản</h1>
        <p>Chỉ Admin có thể cấp quyền truy cập bản demo.</p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <Link className="outline-button" href="/admin/users/transfer" style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}>
          ⇄ Bàn giao nhân sự
        </Link>
        <Link href="/">← Dashboard</Link>
      </div>
    </div>
    <ApprovalList users={users} />
  </main>;
}
