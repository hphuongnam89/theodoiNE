import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import {
  getCommissionSummary,
  listCommissions,
  listCommissionPolicies,
  COMMISSION_STATUS_LABELS,
  type CommissionStatus,
} from '@/lib/commissions';
import { CommissionItemActions, CreatePolicyButton } from './commission-actions';

export const dynamic = 'force-dynamic';

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    managerId?: string;
    ctvId?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const q = (params.q ?? '').trim();
  const status = (params.status ?? '').trim();
  const managerId = (params.managerId ?? '').trim();
  const ctvId = (params.ctvId ?? '').trim();

  const db = getCrmDb();
  const salesIdForSummary = user.role === 'SALES' ? user.id : undefined;
  const summary = getCommissionSummary(salesIdForSummary);
  const policies = listCommissionPolicies(db);

  const { rows, totalCount, totalPages } = listCommissions(user, {
    status: status || undefined,
    managerId: managerId || undefined,
    ctvId: ctvId || undefined,
    q: q || undefined,
    page,
    pageSize: 20,
  });

  const managers = user.role === 'SALES'
    ? [{ id: user.id, display_name: user.display_name }]
    : db.prepare("SELECT id, display_name FROM demo_users WHERE role IN ('SALES', 'LEADER') ORDER BY display_name").all() as Array<{ id: string; display_name: string }>;

  const exportUrl = `/api/demo/crm/commissions/export?${new URLSearchParams({
    ...(status ? { status } : {}),
    ...(managerId ? { managerId } : {}),
    ...(ctvId ? { ctvId } : {}),
    ...(q ? { q } : {}),
  }).toString()}`;

  const STATUS_BADGES: Record<CommissionStatus, { bg: string; color: string }> = {
    ACCRUED: { bg: '#e8f0fe', color: '#1967d2' },
    APPROVED: { bg: '#fef7e0', color: '#b06000' },
    PAID: { bg: '#e6f4ea', color: '#137333' },
    CANCELLED: { bg: '#f1f3f4', color: '#5f6368' },
  };

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <p className="breadcrumb">CRM / Cộng tác viên</p>
          <h1>Quản lý hoa hồng CTV</h1>
          <p>
            Theo dõi hoa hồng theo từng NE, duyệt quyết toán và xác nhận chi trả kế toán.
            {user.role === 'SALES' ? ' (Hiển thị các CTV do bạn quản lý)' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <CreatePolicyButton isAdmin={user.role === 'ADMIN'} />
          <a
            className="outline-button"
            href={exportUrl}
            download
            style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}
          >
            📥 Xuất bảng kê (CSV)
          </a>
          <Link href="/">← Dashboard</Link>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="cards" style={{ marginBottom: '20px' }}>
        <article className="metric">
          <span>Hoa hồng dự kiến</span>
          <strong style={{ color: '#1967d2' }}>{summary.accrued.amount.toLocaleString('vi-VN')} ₫</strong>
          <small>{summary.accrued.count} khoản phát sinh từ NE</small>
        </article>
        <article className="metric">
          <span>Đã duyệt chi</span>
          <strong style={{ color: '#b06000' }}>{summary.approved.amount.toLocaleString('vi-VN')} ₫</strong>
          <small>{summary.approved.count} khoản chờ chuyển tiền</small>
        </article>
        <article className="metric">
          <span>Đã thanh toán</span>
          <strong style={{ color: '#2e7d32' }}>{summary.paid.amount.toLocaleString('vi-VN')} ₫</strong>
          <small>{summary.paid.count} khoản đã có mã UNC</small>
        </article>
        <article className="metric">
          <span>Đã hủy (mất NE)</span>
          <strong style={{ color: '#5f6368' }}>{summary.cancelled.amount.toLocaleString('vi-VN')} ₫</strong>
          <small>{summary.cancelled.count} khoản do hoàn học phí</small>
        </article>
      </section>

      {/* Main Commission Table */}
      <section className="admin-panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>
            Danh sách quyết toán hoa hồng <span>{totalCount}</span>
          </h2>
        </div>

        {/* Filter Bar */}
        <form action="/crm/commissions" method="get" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm tên học viên, SĐT, CTV..."
            style={{ flex: 1, minWidth: '180px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dbe3ee', fontSize: '13px' }}
          />
          <select
            name="status"
            defaultValue={status}
            style={{ border: '1px solid #dbe3ee', borderRadius: '6px', padding: '0 10px', fontSize: '13px', background: '#fff' }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(COMMISSION_STATUS_LABELS).map(([k, v]) => (
              <option value={k} key={k}>{v}</option>
            ))}
          </select>
          {user.role !== 'SALES' && (
            <select
              name="managerId"
              defaultValue={managerId}
              style={{ border: '1px solid #dbe3ee', borderRadius: '6px', padding: '0 10px', fontSize: '13px', background: '#fff' }}
            >
              <option value="">Tất cả Sales quản lý</option>
              {managers.map(m => (
                <option value={m.id} key={m.id}>{m.display_name}</option>
              ))}
            </select>
          )}
          <button type="submit" className="outline-button" style={{ fontSize: '13px', padding: '0 16px' }}>
            Lọc
          </button>
          {(q || status || managerId || ctvId) && (
            <Link
              href="/crm/commissions"
              className="outline-button"
              style={{ fontSize: '13px', padding: '8px 12px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
            >
              ✕ Bỏ lọc
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5f6368', background: '#f8fafc', borderRadius: '8px' }}>
            <p style={{ margin: 0, fontWeight: 500 }}>Chưa có bản ghi hoa hồng nào phù hợp điều kiện lọc.</p>
            <small>Hoa hồng CTV sẽ tự động được ghi nhận khi Lead gắn CTV đạt NE chính thức (+1 NE).</small>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Học viên (Lead)</th>
                  <th>Cộng tác viên (CTV)</th>
                  <th>Sales quản lý</th>
                  <th>Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Thời điểm ghi nhận</th>
                  <th>Chứng từ thanh toán</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const badge = STATUS_BADGES[row.status] || { bg: '#eee', color: '#333' };
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/crm/leads/${row.lead_id}`} style={{ fontWeight: 600, color: '#1a73e8', textDecoration: 'none' }}>
                          {row.lead_name}
                        </Link>
                        {row.lead_phone && <div style={{ fontSize: '11px', color: '#5f6368' }}>{row.lead_phone}</div>}
                        {row.program && <div style={{ fontSize: '11px', color: '#162a52' }}>Ngành: {row.program}</div>}
                      </td>
                      <td>
                        <strong>{row.ctv_name}</strong>
                        {row.ctv_phone && <div style={{ fontSize: '11px', color: '#5f6368' }}>{row.ctv_phone}</div>}
                      </td>
                      <td>
                        <span>{row.manager_name}</span>
                      </td>
                      <td>
                        <strong style={{ color: '#2e7d32', fontSize: '14px' }}>
                          {row.amount_vnd.toLocaleString('vi-VN')} ₫
                        </strong>
                        {row.policy_name && (
                          <div style={{ fontSize: '10px', color: '#5f6368' }}>{row.policy_name}</div>
                        )}
                      </td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            background: badge.bg,
                            color: badge.color,
                            fontWeight: 600,
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          {COMMISSION_STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px' }}>
                          {new Date(row.accrued_at).toLocaleDateString('vi-VN')}
                        </div>
                        <div style={{ fontSize: '10px', color: '#5f6368' }}>
                          {new Date(row.accrued_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        {row.payment_reference ? (
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#137333', background: '#e6f4ea', padding: '2px 6px', borderRadius: '4px' }}>
                              {row.payment_reference}
                            </span>
                            {row.paid_at && (
                              <div style={{ fontSize: '10px', color: '#5f6368', marginTop: '2px' }}>
                                Ngày chi: {new Date(row.paid_at).toLocaleDateString('vi-VN')}
                              </div>
                            )}
                          </div>
                        ) : row.note ? (
                          <span style={{ fontSize: '11px', color: '#5f6368' }}>{row.note}</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#9aa0a6' }}>Chưa chi</span>
                        )}
                      </td>
                      <td>
                        <CommissionItemActions
                          commissionId={row.id}
                          status={row.status}
                          leadName={row.lead_name}
                          ctvName={row.ctv_name}
                          amountVnd={row.amount_vnd}
                          userRole={user.role}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <Link
                key={i + 1}
                href={`/crm/commissions?${new URLSearchParams({
                  ...(status ? { status } : {}),
                  ...(managerId ? { managerId } : {}),
                  ...(ctvId ? { ctvId } : {}),
                  ...(q ? { q } : {}),
                  page: String(i + 1),
                }).toString()}`}
                className="outline-button"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: page === i + 1 ? '#1967d2' : '#fff',
                  color: page === i + 1 ? '#fff' : '#162a52',
                  textDecoration: 'none',
                  fontWeight: page === i + 1 ? 700 : 400,
                }}
              >
                {i + 1}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Policies List Panel */}
      <section className="admin-panel">
        <h2 style={{ marginBottom: '8px' }}>Chính sách hoa hồng đang áp dụng</h2>
        <p style={{ fontSize: '13px', color: '#5f6368', marginBottom: '14px' }}>
          Hệ thống sẽ tự động đối chiếu ngành đào tạo của Lead khi phát sinh NE để áp dụng mức thưởng tương ứng.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tên chính sách</th>
                <th>Ngành áp dụng</th>
                <th>Đợt tuyển sinh</th>
                <th>Mức thưởng mỗi NE</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.program || 'Tất cả các ngành'}</td>
                  <td>{p.intake_batch || 'Tất cả các đợt'}</td>
                  <td>
                    <strong style={{ color: '#2e7d32' }}>
                      {p.reward_amount_vnd.toLocaleString('vi-VN')} ₫
                    </strong>
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', color: p.is_active ? '#2e7d32' : '#5f6368', fontWeight: 600 }}>
                      {p.is_active ? '● Đang hiệu lực' : '○ Tạm ngưng'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
