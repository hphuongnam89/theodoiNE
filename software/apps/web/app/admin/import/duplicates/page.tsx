import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import DuplicateQueueClient, { type DuplicateGroup, type DuplicateRecord } from './duplicate-queue-client';

export const dynamic = 'force-dynamic';

type SalesUser = { id: string; display_name: string; email: string };

export default async function AdminImportDuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  if (!['ADMIN', 'LEADER'].includes(user.role)) redirect('/');

  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 60);
  const status = (params.status ?? 'unresolved').trim();
  const PAGE_SIZE = 15;

  const db = getCrmDb();

  // Sales list for assignment
  const salesList = db.prepare(`
    SELECT id, display_name, email FROM demo_users
    WHERE role = 'SALES' AND status = 'ACTIVE'
    ORDER BY display_name
  `).all() as SalesUser[];

  // Global counts for metrics
  const totalDupGroupsCount = (db.prepare(`
    SELECT COUNT(*) as n FROM (
      SELECT p.phone_normalized FROM demo_import_phones p
      JOIN demo_import_records r ON r.id = p.record_id
      GROUP BY p.phone_normalized HAVING COUNT(DISTINCT r.id) > 1
    )
  `).get() as { n: number }).n;

  const totalRecordsInDup = (db.prepare(`
    SELECT COUNT(*) as n FROM demo_import_records r
    WHERE EXISTS (
      SELECT 1 FROM demo_import_phones p1
      WHERE p1.record_id = r.id AND EXISTS (
        SELECT 1 FROM demo_import_phones p2
        WHERE p2.phone_normalized = p1.phone_normalized AND p2.record_id <> r.id
      )
    )
  `).get() as { n: number }).n;

  const crmMatchedGroupsCount = (db.prepare(`
    SELECT COUNT(DISTINCT p.phone_normalized) as n
    FROM demo_import_phones p
    JOIN demo_leads l ON l.phone_normalized = p.phone_normalized
  `).get() as { n: number }).n;

  // Filter conditions for the queue
  const conditions: string[] = ['total_records > 1'];
  const queryParams: (string | number)[] = [];

  if (q) {
    conditions.push(`(p.phone_normalized LIKE ? OR GROUP_CONCAT(r.full_name) LIKE ?)`);
    const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
    queryParams.push(`%${escaped}%`, `%${escaped}%`);
  }

  if (status === 'unresolved') {
    conditions.push(`(
      COUNT(DISTINCT l.id) = 0
      AND COUNT(DISTINCT CASE WHEN r.flags LIKE '%SKIPPED_DUPLICATE%' THEN r.id END) < COUNT(DISTINCT r.id)
    )`);
  } else if (status === 'activated') {
    conditions.push(`COUNT(DISTINCT l.id) > 0`);
  } else if (status === 'skipped') {
    conditions.push(`COUNT(DISTINCT CASE WHEN r.flags LIKE '%SKIPPED_DUPLICATE%' THEN r.id END) = COUNT(DISTINCT r.id)`);
  }

  const havingClause = conditions.join(' AND ');

  const totalMatchingGroups = (db.prepare(`
    SELECT COUNT(*) as n FROM (
      SELECT p.phone_normalized,
             COUNT(DISTINCT r.id) as total_records
      FROM demo_import_phones p
      JOIN demo_import_records r ON r.id = p.record_id
      LEFT JOIN demo_leads l ON l.phone_normalized = p.phone_normalized
      GROUP BY p.phone_normalized
      HAVING ${havingClause}
    )
  `).get(...queryParams) as { n: number }).n;

  const totalPages = Math.max(1, Math.ceil(totalMatchingGroups / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch groups
  const groupRows = db.prepare(`
    SELECT
      p.phone_normalized,
      COUNT(DISTINCT r.id) as total_records,
      COUNT(DISTINCT CASE WHEN r.flags LIKE '%SKIPPED_DUPLICATE%' THEN r.id END) as skipped_records,
      COUNT(DISTINCT l.id) as crm_lead_count,
      l.id as crm_lead_id,
      l.full_name as crm_lead_name,
      l.stage as crm_lead_stage,
      u.display_name as crm_lead_owner
    FROM demo_import_phones p
    JOIN demo_import_records r ON r.id = p.record_id
    LEFT JOIN demo_leads l ON l.phone_normalized = p.phone_normalized
    LEFT JOIN demo_users u ON u.id = l.owner_user_id
    GROUP BY p.phone_normalized
    HAVING ${havingClause}
    ORDER BY (COUNT(DISTINCT l.id) = 0) DESC, total_records DESC, p.phone_normalized
    LIMIT ? OFFSET ?
  `).all(...queryParams, PAGE_SIZE, offset) as Array<{
    phone_normalized: string;
    total_records: number;
    skipped_records: number;
    crm_lead_count: number;
    crm_lead_id: string | null;
    crm_lead_name: string | null;
    crm_lead_stage: string | null;
    crm_lead_owner: string | null;
  }>;

  // For each group, fetch all its records
  const groups: DuplicateGroup[] = [];
  for (const g of groupRows) {
    const records = db.prepare(`
      SELECT r.id, r.full_name, r.source_sheet, r.source_row, r.record_kind,
             r.program_raw, r.status_raw, r.owner_raw, r.ctv_raw, r.assigned_sales_user_id,
             r.flags, su.display_name as assigned_sales_name,
             (SELECT id FROM demo_leads dl WHERE dl.origin_import_record_id = r.id) as active_lead_id
      FROM demo_import_records r
      JOIN demo_import_phones p ON p.record_id = r.id
      LEFT JOIN demo_users su ON su.id = r.assigned_sales_user_id
      WHERE p.phone_normalized = ?
      ORDER BY r.source_sheet, r.source_row
    `).all(g.phone_normalized) as DuplicateRecord[];

    groups.push({
      ...g,
      records,
    });
  }

  const makeHref = (p: number) => `/admin/import/duplicates?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${encodeURIComponent(status)}` : ''}`;

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <p className="breadcrumb">Quản trị / Import / Hàng chờ trùng lặp</p>
          <h1>Hàng chờ xử lý trùng lặp và kích hoạt</h1>
          <p>
            Đối chiếu các số điện thoại xuất hiện nhiều lần giữa các sheet Excel hoặc đã có trong CRM.
            Chọn bản ghi chuẩn để kích hoạt vào CRM hoặc đánh dấu bỏ qua.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link className="outline-button" href="/admin/import" style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}>
            ← Duyệt Excel
          </Link>
          <Link href="/">← Dashboard</Link>
        </div>
      </div>

      <section className="cards import-cards" style={{ marginBottom: '20px' }}>
        <article className="metric">
          <span>Tổng nhóm trùng SĐT</span>
          <strong>{totalDupGroupsCount.toLocaleString('vi-VN')}</strong>
          <small>Xuất hiện ≥ 2 lần trong Excel</small>
        </article>
        <article className="metric">
          <span>Tổng dòng nguồn trùng</span>
          <strong>{totalRecordsInDup.toLocaleString('vi-VN')}</strong>
          <small>Dòng Excel liên quan</small>
        </article>
        <article className="metric">
          <span>Đã có trong CRM</span>
          <strong>{crmMatchedGroupsCount.toLocaleString('vi-VN')}</strong>
          <small>Đã kích hoạt vận hành</small>
        </article>
        <article className="metric">
          <span>Chưa xử lý (Lọc hiện tại)</span>
          <strong>{totalMatchingGroups.toLocaleString('vi-VN')}</strong>
          <small>Nhóm cần đối chiếu</small>
        </article>
      </section>

      <section className="admin-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0 }}>Danh sách nhóm trùng lặp ({totalMatchingGroups})</h2>
        </div>

        <form className="lead-search" action="/admin/import/duplicates" method="get" style={{ marginBottom: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo số điện thoại, tên học viên..."
            maxLength={60}
            style={{ flex: 1, minWidth: '180px' }}
          />
          <select
            name="status"
            defaultValue={status}
            style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}
          >
            <option value="unresolved">Chưa giải quyết (Ưu tiên)</option>
            <option value="activated">Đã kích hoạt CRM</option>
            <option value="skipped">Đã bỏ qua trùng</option>
            <option value="all">Tất cả nhóm</option>
          </select>
          <button type="submit">Tìm kiếm</button>
          {(q || status !== 'unresolved') && (
            <Link href="/admin/import/duplicates" style={{ fontSize: '12px', alignSelf: 'center', color: '#4169e1', textDecoration: 'none' }}>
              Đặt lại
            </Link>
          )}
        </form>

        <DuplicateQueueClient initialGroups={groups} salesList={salesList} />

        {totalPages > 1 && (
          <div className="pagination" style={{ marginTop: '20px' }}>
            {page > 1 && <Link href={makeHref(page - 1)}>← Trang trước</Link>}
            <span>Trang {page} / {totalPages}</span>
            {page < totalPages && <Link href={makeHref(page + 1)}>Trang sau →</Link>}
          </div>
        )}
      </section>
    </main>
  );
}
