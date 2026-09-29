import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { importStats } from '@/lib/import-data';
import { getCrmDb } from '@/lib/crm';
import AliasReview from './review';
import RosterReview from './roster-review';

export const dynamic = 'force-dynamic';

type Alias = { owner_key: string; source_name: string; rows: number; assigned: number; approved_sales_user_id: string | null };
type Sales = { id: string; display_name: string; email: string };
type Roster = { id: string; display_name: string; phones: string | null; active_ctv_id: string | null };

export default async function ImportPage() {
  const actor = await getSessionUser();
  if (!actor) redirect('/login');
  if (actor.status !== 'ACTIVE' || actor.role !== 'ADMIN') redirect('/');
  const db = getCrmDb();
  const stats = importStats();
  const aliases = db.prepare(`
    SELECT r.owner_key, MIN(r.owner_raw) AS source_name, COUNT(*) AS rows,
      SUM(CASE WHEN r.assigned_sales_user_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
      MAX(a.approved_sales_user_id) AS approved_sales_user_id
    FROM demo_import_records r LEFT JOIN demo_owner_alias_approvals a ON a.owner_key = r.owner_key
    WHERE r.owner_key IS NOT NULL AND r.owner_key <> ''
    GROUP BY r.owner_key ORDER BY rows DESC, source_name
  `).all() as Alias[];
  const sales = db.prepare("SELECT id, display_name, email FROM demo_users WHERE role = 'SALES' AND status = 'ACTIVE' ORDER BY display_name").all() as Sales[];
  const ctvCount = (db.prepare('SELECT COUNT(*) AS n FROM demo_ctv_roster_draft').get() as { n: number }).n;
  const roster = db.prepare(`SELECT r.id, r.display_name,
      group_concat(p.phone_normalized, '|') AS phones, c.id AS active_ctv_id
    FROM demo_ctv_roster_draft r
    LEFT JOIN demo_ctv_phones p ON p.ctv_id = r.id
    LEFT JOIN demo_ctv c ON c.origin_roster_id = r.id
    GROUP BY r.id ORDER BY r.display_name`).all() as Roster[];
  return <main className="admin-page">
    <div className="admin-header"><div><p className="breadcrumb">Quản trị / Import</p><h1>Duyệt dữ liệu Excel</h1>
      <p>Phê duyệt người phụ trách trước khi hồ sơ hiện với Sales.</p></div><Link href="/">← Dashboard</Link></div>
    <section className="cards import-cards"><article className="metric"><span>Đã nhập</span><strong>{stats?.total ?? 0}</strong><small>8 sheet nguồn</small></article>
      <article className="metric"><span>Chưa gán sales</span><strong>{stats?.unassigned ?? 0}</strong><small>Không hiện với Sales</small></article>
      <article className="metric"><span>NE lịch sử</span><strong>{stats?.history ?? 0}</strong><small>Chưa xác minh học phí</small></article>
      <article className="metric"><span>CTV trong roster</span><strong>{ctvCount}</strong><small>Danh sách dự thảo</small></article></section>
    <div className="info-banner" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span className="banner-icon" style={{ background: '#4169e1' }}>⧉</span>
        <span><b>Hàng chờ xử lý trùng lặp:</b> Phát hiện các số điện thoại xuất hiện nhiều lần giữa các sheet Excel cần đối chiếu và kích hoạt vào CRM.</span>
      </div>
      <Link href="/admin/import/duplicates" className="auth-button-link narrow" style={{ whiteSpace: 'nowrap' }}>
        Mở hàng chờ trùng lặp →
      </Link>
    </div>
    <section className="admin-panel next"><h2>Ánh xạ tên sales trong Excel</h2>
      <p className="review-note">Chọn tài khoản Sales đã được duyệt cho từng tên nguồn. Hệ thống sẽ gán các dòng có cùng tên chuẩn hóa và giữ lịch sử phê duyệt. Dòng thiếu tên sales vẫn chờ xử lý riêng.</p>
      <AliasReview aliases={aliases} sales={sales} />
    </section>
    <section className="admin-panel next"><h2>Duyệt roster CTV</h2><p className="review-note">Chọn Sales quản lý trước khi đưa CTV từ roster Excel vào danh sách vận hành. Dữ liệu lead có tên CTV khác roster vẫn cần đối chiếu riêng.</p>
      <RosterReview roster={roster} sales={sales} />
    </section>
  </main>;
}
