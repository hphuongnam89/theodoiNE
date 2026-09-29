import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getDemoDb, getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import ActivateImport from './activate';

export const dynamic = 'force-dynamic';

type ImportRow = { id: string; full_name: string; source_sheet: string; source_row: number;
  workbook: string; record_kind: string; status_raw: string | null; program_raw: string | null;
  owner_raw: string | null; ctv_raw: string | null; flags: string; candidate_group: string | null;
  assigned_sales_user_id: string | null; tuition_positive_unverified: number };

export default async function ImportedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const { id } = await params;
  const db = getDemoDb();
  const row = db.prepare('SELECT * FROM demo_import_records WHERE id = ?').get(id) as ImportRow | undefined;
  if (!row || (user.role === 'SALES' && row.assigned_sales_user_id !== user.id)) notFound();
  const phones = db.prepare('SELECT phone_normalized FROM demo_import_phones WHERE record_id = ? ORDER BY phone_normalized')
    .all(id) as Array<{ phone_normalized: string }>;
  const groupCount = row.candidate_group ? (db.prepare('SELECT COUNT(*) AS n FROM demo_import_records WHERE candidate_group = ?')
    .get(row.candidate_group) as { n: number }).n : 1;
  const activeLead = getCrmDb().prepare('SELECT id FROM demo_leads WHERE origin_import_record_id = ?').get(id) as { id: string } | undefined;
  return <main className="admin-page crm-page"><div className="admin-header"><div><p className="breadcrumb">Dữ liệu Excel / Chi tiết</p><h1>{row.full_name}</h1>
    <p>{row.record_kind === 'NE_HISTORY' ? 'NE lịch sử chưa xác minh' : 'Lead từ Excel'} · {row.source_sheet}, dòng {row.source_row}</p></div><Link href="/leads">← Danh sách Excel</Link></div>
    <section className="admin-panel import-detail"><h2>Thông tin đã chuẩn hóa</h2><dl>
      <dt>Điện thoại</dt><dd>{phones.map(item => item.phone_normalized).join(', ') || 'Chưa có số hợp lệ'}</dd>
      <dt>Ngành</dt><dd>{row.program_raw ?? 'Chưa rõ'}</dd>
      <dt>Trạng thái nguồn</dt><dd>{row.status_raw ?? 'Trống'}</dd>
      <dt>Sales trong file</dt><dd>{row.owner_raw ?? 'Trống'}</dd>
      <dt>CTV trong file</dt><dd>{row.ctv_raw ?? 'Không có'}</dd>
      <dt>Nhóm nghi trùng</dt><dd>{groupCount > 1 ? `${groupCount} dòng cùng nhóm ứng viên` : 'Không có nhóm nhiều dòng'}</dd>
      <dt>Cờ rà soát</dt><dd>{row.flags || 'Không có'}</dd>
      <dt>Nguồn gốc</dt><dd>{row.workbook} / {row.source_sheet} / dòng {row.source_row}</dd>
    </dl>
      {row.record_kind === 'NE_HISTORY' && <p className="info-banner">Excel có thể ghi học phí dương, nhưng chưa có giao dịch được xác nhận. Hồ sơ này không được tính NE/KPI.</p>}
      {activeLead ? <Link className="auth-button-link narrow" href={`/crm/leads/${activeLead.id}`}>Mở lead đang vận hành</Link>
        : row.record_kind === 'LEAD' && row.assigned_sales_user_id
          ? <ActivateImport id={row.id} phones={phones.map(item => item.phone_normalized)} />
          : <p className="empty-state">Cần Admin gán sales và xác minh dữ liệu trước khi đưa vào CRM.</p>}
    </section>
  </main>;
}
