import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDemoDb, getSessionUser } from '@/lib/demo-auth';

export const dynamic = 'force-dynamic';

type Row = { id: string; full_name: string; source_key: string; source_sheet: string;
  source_row: number; record_kind: string; program_raw: string | null; status_raw: string | null;
  owner_raw: string | null; ctv_raw: string | null; flags: string; phones: string | null };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 60);
  const sales = user.role === 'SALES';
  const conditions = [sales ? 'r.assigned_sales_user_id = ?' : '1=1'];
  const values: Array<string | number> = sales ? [user.id] : [];
  if (q) {
    conditions.push(`(r.full_name LIKE ? ESCAPE '\\' OR EXISTS
      (SELECT 1 FROM demo_import_phones search_phone WHERE search_phone.record_id = r.id AND search_phone.phone_normalized LIKE ? ESCAPE '\\'))`);
    const escaped = q.replace(/[\\%_]/g, character => `\\${character}`);
    values.push(`%${escaped}%`, `%${escaped}%`);
  }
  const where = conditions.join(' AND ');
  const db = getDemoDb();
  let rows: Row[] = [];
  let total = 0;
  try {
    total = (db.prepare(`SELECT COUNT(*) AS n FROM demo_import_records r WHERE ${where}`).get(...values) as { n: number }).n;
    rows = db.prepare(`
      SELECT r.id, r.full_name, r.source_key, r.source_sheet, r.source_row, r.record_kind,
        r.program_raw, r.status_raw, r.owner_raw, r.ctv_raw, r.flags,
        (SELECT group_concat(p.phone_normalized, ', ') FROM demo_import_phones p WHERE p.record_id = r.id) AS phones
      FROM demo_import_records r WHERE ${where}
      ORDER BY r.source_key, r.source_row LIMIT 50 OFFSET ?
    `).all(...values, (page - 1) * 50) as Row[];
  } catch {
    // A new demo without an import displays an empty list.
  }
  const makeHref = (next: number) => `/leads?page=${next}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  return <main className="admin-page leads-page">
    <div className="admin-header"><div><p className="breadcrumb">CRM / Dữ liệu Excel</p><h1>Danh sách lead và NE lịch sử</h1>
      <p>{sales ? 'Chỉ hiện hồ sơ đã được Admin gán cho bạn.' : 'Dữ liệu chuẩn hóa từ hai workbook, chưa phải NE đã xác nhận.'}</p></div><Link href="/">← Dashboard</Link></div>
    <section className="admin-panel"><form className="lead-search" action="/leads" method="get"><input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc số điện thoại" maxLength={60} /><button>Tìm kiếm</button></form>
      <p className="list-count">{total.toLocaleString('vi-VN')} dòng trong phạm vi của bạn</p>
      <div className="lead-list">{rows.map(row => <article key={row.id} className="lead-row">
        <div><strong><Link href={`/leads/${row.id}`}>{row.full_name}</Link></strong><p>{row.phones ?? 'Chưa có số điện thoại chuẩn hóa'}</p><small>{row.source_sheet} · dòng {row.source_row} · {row.program_raw ?? 'Chưa rõ ngành'}</small></div>
        <div className="lead-meta"><span>{row.record_kind === 'NE_HISTORY' ? 'NE lịch sử chưa xác minh' : row.status_raw ?? 'Lead chưa rõ trạng thái'}</span><small>{row.owner_raw ? `Nguồn ghi: ${row.owner_raw}` : 'Chưa có người phụ trách trong nguồn'}{row.ctv_raw ? ` · CTV: ${row.ctv_raw}` : ''}</small></div>
      </article>)}</div>
      {rows.length === 0 && <p className="empty-state">Chưa có hồ sơ phù hợp. Hồ sơ từ Excel chỉ hiện cho Sales sau khi Admin duyệt phân công.</p>}
      <div className="pagination">{page > 1 && <Link href={makeHref(page - 1)}>← Trang trước</Link>}<span>Trang {page}</span>{page * 50 < total && <Link href={makeHref(page + 1)}>Trang sau →</Link>}</div>
    </section>
  </main>;
}
