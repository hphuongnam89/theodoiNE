import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import FinanceReview from './review';

export const dynamic = 'force-dynamic';

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; kind?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 60);
  const status = (params.status ?? '').trim();
  const kind = (params.kind ?? '').trim();
  const PAGE_SIZE = 20;

  const db = getCrmDb();
  const conditions: string[] = ['1=1'];
  const queryParams: (string | number)[] = [];

  if (user.role === 'SALES') {
    conditions.push(`(
      l.owner_user_id = ?
      OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?)
      OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND (e.sales_user_id = ? OR e.ctv_manager_user_id = ?))
    )`);
    queryParams.push(user.id, user.id, user.id, user.id);
  }

  if (status && ['PENDING', 'CONFIRMED', 'REJECTED'].includes(status)) {
    conditions.push('p.status = ?');
    queryParams.push(status);
  }
  if (kind && ['RECEIPT', 'REFUND'].includes(kind)) {
    conditions.push('p.kind = ?');
    queryParams.push(kind);
  }
  if (q) {
    conditions.push(`(p.reference_code LIKE ? ESCAPE '\\' OR l.full_name LIKE ? ESCAPE '\\' OR l.phone_normalized LIKE ? ESCAPE '\\')`);
    const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
    queryParams.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
  }

  const where = conditions.join(' AND ');
  const totalCount = (db.prepare(`
    SELECT COUNT(*) AS n
    FROM demo_payments p
    JOIN demo_leads l ON l.id = p.lead_id
    WHERE ${where}
  `).get(...queryParams) as { n: number }).n;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;

  const payments = db.prepare(`
    SELECT p.id, p.kind, p.amount_vnd, p.bank_at, p.reference_code, p.status,
           p.review_reason, p.evidence_file_name, p.evidence_url,
           l.id AS lead_id, l.full_name, u.display_name AS owner_name
    FROM demo_payments p
    JOIN demo_leads l ON l.id = p.lead_id
    JOIN demo_users u ON u.id = l.owner_user_id
    WHERE ${where}
    ORDER BY CASE p.status WHEN 'PENDING' THEN 0 ELSE 1 END, p.bank_at DESC, p.submitted_at DESC
    LIMIT ? OFFSET ?
  `).all(...queryParams, PAGE_SIZE, offset) as Array<{
    id: string; kind: string; amount_vnd: number; bank_at: string; reference_code: string;
    status: string; review_reason: string | null; evidence_file_name: string | null; evidence_url: string | null;
    lead_id: string; full_name: string; owner_name: string;
  }>;

  const exportUrl = `/api/demo/crm/export?type=finance${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${encodeURIComponent(status)}` : ''}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`;
  const makeHref = (p: number) => `/finance?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${encodeURIComponent(status)}` : ''}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`;

  return <main className="admin-page crm-page">
    <div className="admin-header">
      <div>
        <p className="breadcrumb">CRM / Đối soát</p>
        <h1>Giao dịch học phí</h1>
        <p>Admin và Leader duyệt theo chứng từ ngân hàng. NE phát sinh tại ngày tiền vào.</p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <a className="outline-button" href={exportUrl} download style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}>
          📥 Xuất báo cáo giao dịch
        </a>
        <Link href="/">← Dashboard</Link>
      </div>
    </div>

    <section className="admin-panel" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>Danh sách đối soát <span>{totalCount}</span></h2>
      </div>

      <form className="lead-search" action="/finance" method="get" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input name="q" defaultValue={q} placeholder="Mã đối soát, tên lead, SĐT..." maxLength={60} style={{ flex: 1, minWidth: '150px' }} />
        <select name="status" defaultValue={status} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="CONFIRMED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
        <select name="kind" defaultValue={kind} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
          <option value="">Thu & Hoàn</option>
          <option value="RECEIPT">Thu học phí</option>
          <option value="REFUND">Hoàn học phí</option>
        </select>
        <button type="submit">Tìm</button>
        {(q || status || kind) && <Link href="/finance" style={{ fontSize: '12px', alignSelf: 'center', color: '#4169e1', textDecoration: 'none' }}>Đặt lại</Link>}
      </form>
    </section>

    <FinanceReview payments={payments} canReview={user.role !== 'SALES'} />

    {totalPages > 1 && (
      <div className="pagination">
        {page > 1 && <Link href={makeHref(page - 1)}>← Trang trước</Link>}
        <span>Trang {page} / {totalPages}</span>
        {page < totalPages && <Link href={makeHref(page + 1)}>Trang sau →</Link>}
      </div>
    )}
  </main>;
}
