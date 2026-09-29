import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import CtvActions from './ctv-actions';

export const dynamic = 'force-dynamic';

type Ctv = { id: string; display_name: string; phone_normalized: string | null; owner_user_id: string; owner_name: string };
type Sales = { id: string; display_name: string };

export default async function CtvPage() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const db = getCrmDb();
  const sales = user.role === 'SALES' ? [] : db.prepare("SELECT id, display_name FROM demo_users WHERE role = 'SALES' AND status = 'ACTIVE' ORDER BY display_name").all() as Sales[];
  const ctv = (user.role === 'SALES'
    ? db.prepare(`SELECT c.id, c.display_name, c.phone_normalized, c.owner_user_id, u.display_name AS owner_name
      FROM demo_ctv c JOIN demo_users u ON u.id = c.owner_user_id
      WHERE c.owner_user_id = ? AND c.is_active = 1 ORDER BY c.display_name`).all(user.id)
    : db.prepare(`SELECT c.id, c.display_name, c.phone_normalized, c.owner_user_id, u.display_name AS owner_name
      FROM demo_ctv c JOIN demo_users u ON u.id = c.owner_user_id
      WHERE c.is_active = 1 ORDER BY c.display_name`).all()) as Ctv[];
  return <main className="admin-page crm-page"><div className="admin-header"><div><p className="breadcrumb">CRM / CTV</p><h1>Cộng tác viên</h1>
    <p>Sales nhập lead thay CTV. Danh sách CTV từ Excel vẫn chờ Admin đối chiếu trước khi tạo hồ sơ chính thức.</p></div><Link href="/">← Dashboard</Link></div>
    <CtvActions role={user.role} sales={sales} ctv={ctv} />
  </main>;
}
