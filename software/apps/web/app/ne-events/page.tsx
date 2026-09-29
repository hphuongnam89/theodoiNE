import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';

export const dynamic = 'force-dynamic';

export default async function NeEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; delta?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 60);
  const delta = (params.delta ?? '').trim();
  const PAGE_SIZE = 20;

  const db = getCrmDb();
  const conditions: string[] = ['1=1'];
  const queryParams: (string | number)[] = [];

  if (user.role === 'SALES') {
    conditions.push('(e.sales_user_id = ? OR e.ctv_manager_user_id = ?)');
    queryParams.push(user.id, user.id);
  }

  if (delta === '1' || delta === '-1') {
    conditions.push('e.delta = ?');
    queryParams.push(Number(delta));
  }

  if (q) {
    conditions.push(`(l.full_name LIKE ? ESCAPE '\\' OR p.reference_code LIKE ? ESCAPE '\\' OR c.display_name LIKE ? ESCAPE '\\')`);
    const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
    queryParams.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
  }

  const where = conditions.join(' AND ');
  const totalCount = (db.prepare(`
    SELECT COUNT(*) AS n
    FROM demo_ne_events e
    JOIN demo_leads l ON l.id = e.lead_id
    JOIN demo_payments p ON p.id = e.payment_id
    LEFT JOIN demo_ctv c ON c.id = e.ctv_id
    WHERE ${where}
  `).get(...queryParams) as { n: number }).n;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;

  const events = db.prepare(`
    SELECT e.id, e.delta, e.event_at, l.id AS lead_id, l.full_name,
           l.owner_user_id, p.amount_vnd, p.reference_code, c.display_name AS ctv_name,
           u.display_name AS credited_name
    FROM demo_ne_events e
    JOIN demo_leads l ON l.id = e.lead_id
    JOIN demo_payments p ON p.id = e.payment_id
    LEFT JOIN demo_ctv c ON c.id = e.ctv_id
    JOIN demo_users u ON u.id = COALESCE(e.ctv_manager_user_id, e.sales_user_id)
    WHERE ${where}
    ORDER BY e.event_at DESC, e.id DESC
    LIMIT ? OFFSET ?
  `).all(...queryParams, PAGE_SIZE, offset) as Array<{
    id: string; delta: number; event_at: string;
    lead_id: string; full_name: string; owner_user_id: string; amount_vnd: number; reference_code: string;
    ctv_name: string | null; credited_name: string;
  }>;

  const exportUrl = `/api/demo/crm/export?type=ne-events${q ? `&q=${encodeURIComponent(q)}` : ''}${delta ? `&delta=${encodeURIComponent(delta)}` : ''}`;
  const makeHref = (p: number) => `/ne-events?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}${delta ? `&delta=${encodeURIComponent(delta)}` : ''}`;

  return <main className="admin-page crm-page">
    <div className="admin-header">
      <div>
        <p className="breadcrumb">Dashboard / NE</p>
        <h1>Biến động NE</h1>
        <p>+1 khi xác nhận học phí dương; −1 khi hoàn hết số đã thu. Ghi theo thời điểm ngân hàng.</p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <a className="outline-button" href={exportUrl} download style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}>
          📥 Xuất báo cáo NE
        </a>
        <Link href="/">← Dashboard</Link>
      </div>
    </div>

    <section className="admin-panel" style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>Lịch sử NE chính thức <span>{totalCount}</span></h2>
      </div>

      <form className="lead-search" action="/ne-events" method="get" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input name="q" defaultValue={q} placeholder="Tên học viên, mã đối soát, CTV..." maxLength={60} style={{ flex: 1, minWidth: '160px' }} />
        <select name="delta" defaultValue={delta} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
          <option value="">Tất cả biến động</option>
          <option value="1">+1 NE (Thu mới)</option>
          <option value="-1">−1 NE (Hoàn toàn bộ)</option>
        </select>
        <button type="submit">Tìm</button>
        {(q || delta) && <Link href="/ne-events" style={{ fontSize: '12px', alignSelf: 'center', color: '#4169e1', textDecoration: 'none' }}>Đặt lại</Link>}
      </form>
    </section>

    <section className="admin-panel">
      {events.length === 0 && <p className="empty-state">Chưa có sự kiện NE nào phù hợp điều kiện lọc.</p>}
      {events.map(item => <div className="finance-row" key={item.id}>
        <div>
          <strong>
            <Link href={`/crm/leads/${item.lead_id}`}>{item.full_name}</Link>
            {' · '}{item.delta > 0 ? 'Ghi nhận' : 'Hoàn toàn bộ'}
          </strong>
          <small>{new Date(item.event_at).toLocaleString('vi-VN')} · {item.reference_code} · {item.amount_vnd.toLocaleString('vi-VN')} ₫</small>
          <small>Sales ghi nhận KPI: {item.credited_name}{item.ctv_name ? ` · CTV: ${item.ctv_name}` : ''}</small>
        </div>
        <b className={item.delta > 0 ? 'positive-ne' : 'negative-ne'}>{item.delta > 0 ? '+1' : '−1'} NE</b>
      </div>)}

      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 && <Link href={makeHref(page - 1)}>← Trang trước</Link>}
          <span>Trang {page} / {totalPages}</span>
          {page < totalPages && <Link href={makeHref(page + 1)}>Trang sau →</Link>}
        </div>
      )}
    </section>
  </main>;
}
