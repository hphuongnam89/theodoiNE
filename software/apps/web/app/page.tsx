import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { importStats } from '@/lib/import-data';
import { crmStats, funnelStats, breakdownByProgram, breakdownBySource, operationalAlerts } from '@/lib/crm-stats';
import { financeStats } from '@/lib/finance-stats';
import { getCommissionSummary } from '@/lib/commissions';
import { getSlaMetrics } from '@/lib/sla-service';

export const dynamic = 'force-dynamic';

const kpi = [
  { month: 'T1', target: 16, reported: 15, staff: 8 },
  { month: 'T2', target: 16, reported: 11, staff: 8 },
  { month: 'T3', target: 20, reported: 37, staff: 23 },
  { month: 'T4', target: 20, reported: 20, staff: 17 },
  { month: 'T5', target: 35, reported: 9, staff: 6 },
  { month: 'T6', target: 59, reported: 31, staff: 39 },
  { month: 'T7', target: 70, reported: 48, staff: 63 },
  { month: 'T8', target: 95, reported: 37, staff: 81 },
  { month: 'T9', target: 95, reported: 12, staff: 42 },
];

const STEP_COLORS = ['#5c7cfa', '#4263eb', '#3b5bdb', '#364fc7', '#2e7d32'];

export default async function Home() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const roleName = { ADMIN: 'Admin', LEADER: 'Leader', SALES: 'Sales' }[user.role];

  const salesId = user.role === 'SALES' ? user.id : undefined;
  const stats = importStats(salesId);
  const crm = crmStats(salesId);
  const finance = financeStats(salesId);
  const funnel = funnelStats(salesId);
  const programs = breakdownByProgram(salesId);
  const sources = breakdownBySource(salesId);
  const alerts = operationalAlerts(salesId, user.role);
  const commissions = getCommissionSummary(salesId);
  const sla = getSlaMetrics(salesId);

  if (user.role === 'SALES') {
    return (
      <main className="admin-page sales-home">
        <div className="admin-header">
          <div>
            <p className="breadcrumb">Tổng quan / Tư vấn viên</p>
            <h1>Xin chào, {user.display_name}</h1>
            <p>Theo dõi tiến độ tuyển sinh, phễu chuyển đổi và việc cần xử lý trong phạm vi của bạn.</p>
          </div>
          <form action="/api/demo/logout" method="post">
            <button className="outline-button">Đăng xuất</button>
          </form>
        </div>

        {/* Sales KPI Cards */}
        <section className="cards">
          <article className="metric">
            <span>NE chính thức</span>
            <strong>{finance.officialNe}</strong>
            <small>Đã duyệt, trừ hoàn toàn bộ</small>
          </article>
          <article className="metric">
            <span>Biến động NE hôm nay</span>
            <strong>{finance.todayNe > 0 ? '+' : ''}{finance.todayNe}</strong>
            <small>Theo ngày tiền vào</small>
          </article>
          <article className="metric">
            <span>Lead mới tiếp nhận</span>
            <strong>{crm.newLeads}</strong>
            <small>Chưa chuyển trạng thái</small>
          </article>
          <article className="metric">
            <span>Lịch hẹn quá hạn</span>
            <strong style={{ color: crm.overdue > 0 ? '#d32f2f' : 'inherit' }}>{crm.overdue}</strong>
            <small>Cần liên hệ lại ngay</small>
          </article>
          <article className="metric">
            <span>Học phí chờ duyệt</span>
            <strong>{finance.pendingPayments}</strong>
            <small>Giao dịch trong lead của bạn</small>
          </article>
          <article className="metric">
            <span>Hoa hồng CTV quản lý</span>
            <strong style={{ color: '#1967d2' }}>{commissions.accrued.amount.toLocaleString('vi-VN')} ₫</strong>
            <small><a href="/crm/commissions">{commissions.accrued.count} khoản dự kiến</a></small>
          </article>
          <article className="metric">
            <span>Tuân thủ SLA của bạn</span>
            <strong style={{ color: sla.complianceRate >= 90 ? '#2e7d32' : sla.complianceRate >= 75 ? '#b26a00' : '#d32f2f' }}>
              {sla.complianceRate}%
            </strong>
            <small><a href="/crm/sla">{sla.breachedLeads} lead trễ hạn</a></small>
          </article>
          <article className="metric">
            <span>Hồ sơ Excel được giao</span>
            <strong>{stats?.total ?? 0}</strong>
            <small>Chưa tính NE chính thức</small>
          </article>
        </section>

        {/* Quick Links */}
        <section className="admin-panel next">
          <h2>Công việc hằng ngày</h2>
          <p>Tạo lead mới, ghi nhật ký tư vấn, theo dõi hoa hồng CTV và đối soát học phí.</p>
          <div className="quick-links">
            <a className="auth-button-link narrow" href="/crm/leads">Quản lý lead</a>
            <a className="auth-button-link narrow" href="/crm/ctv">Cộng tác viên</a>
            <a className="auth-button-link narrow" href="/crm/commissions">Hoa hồng CTV</a>
            <a className="auth-button-link narrow" href="/crm/sla">Giám sát SLA</a>
            <a className="auth-button-link narrow" href="/finance">Học phí</a>
            <a className="auth-button-link narrow" href="/ne-events">Biến động NE</a>
            <a className="auth-button-link narrow" href="/leads">Dữ liệu Excel được giao</a>
          </div>
        </section>

        {/* Conversion Funnel for Sales */}
        <section className="panel next">
          <div className="panel-title">
            <div>
              <h2>Phễu chuyển đổi của bạn</h2>
              <p>Tiến trình chuyển đổi học viên qua từng giai đoạn tuyển sinh. Nhấp vào từng bước để xem danh sách chi tiết.</p>
            </div>
            <a href="/crm/leads" style={{ fontSize: '12px', color: '#4169e1', textDecoration: 'none', fontWeight: 600 }}>
              Xem toàn bộ lead →
            </a>
          </div>

          <div className="funnel-container">
            {funnel.stages.map((st, i) => {
              const widthPct = funnel.totalLeads > 0 ? Math.max(12, Math.round((st.count / funnel.totalLeads) * 100)) : 100;
              return (
                <div className="funnel-step" key={st.key}>
                  <div className="funnel-label">{st.label}</div>
                  <div className="funnel-bar-outer">
                    <a
                      className="funnel-bar-inner"
                      href={st.href}
                      style={{
                        width: `${widthPct}%`,
                        background: STEP_COLORS[i % STEP_COLORS.length],
                      }}
                      title={`${st.label}: ${st.count} lead (Click để mở danh sách)`}
                    >
                      {st.count.toLocaleString('vi-VN')} lead
                    </a>
                  </div>
                  <div className="funnel-metrics">
                    {st.dropPercent > 0 && (
                      <span className="funnel-drop" title="Tỷ lệ rơi rớt so với bước trước">
                        −{st.dropPercent}%
                      </span>
                    )}
                    <span className="funnel-conv" title="Tỷ lệ chuyển đổi lũy kế">
                      {st.conversionPercent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', alignSelf: 'center' }}>Trạng thái hiện tại:</span>
            <a className="chip" href="/crm/leads?stage=NEW" style={{ textDecoration: 'none', background: '#eaf0ff', color: '#2b52ba' }}>
              Mới: {funnel.pipeline.NEW}
            </a>
            <a className="chip" href="/crm/leads?stage=CONTACTED" style={{ textDecoration: 'none', background: '#e8f0fe', color: '#1967d2' }}>
              Đã liên hệ: {funnel.pipeline.CONTACTED}
            </a>
            <a className="chip" href="/crm/leads?stage=CONSULTING" style={{ textDecoration: 'none', background: '#f3e8fd', color: '#681da8' }}>
              Đang tư vấn: {funnel.pipeline.CONSULTING}
            </a>
            <a className="chip" href="/crm/leads?stage=WAITING_DOCUMENTS" style={{ textDecoration: 'none', background: '#fef7e0', color: '#b06000' }}>
              Chờ hồ sơ: {funnel.pipeline.WAITING_DOCUMENTS}
            </a>
            <a className="chip" href="/crm/leads?stage=WAITING_PAYMENT" style={{ textDecoration: 'none', background: '#e6f4ea', color: '#137333' }}>
              Chờ học phí: {funnel.pipeline.WAITING_PAYMENT}
            </a>
            <a className="chip" href="/crm/leads?filter=has_ne" style={{ textDecoration: 'none', background: '#e8f5e9', color: '#2e7d32', fontWeight: 700 }}>
              Đạt NE: {funnel.pipeline.NE}
            </a>
            <a className="chip" href="/crm/leads?stage=LOST" style={{ textDecoration: 'none', background: '#f1f3f4', color: '#5f6368' }}>
              Không tiếp tục: {funnel.pipeline.LOST}
            </a>
          </div>
        </section>

        {/* Operational Alerts for Sales */}
        <section className="panel next">
          <div className="panel-title">
            <div>
              <h2>Trung tâm cảnh báo vận hành</h2>
              <p>Việc cần ưu tiên xử lý trong ngày.</p>
            </div>
          </div>
          <div className="alerts-grid">
            {alerts.map(item => (
              <div className={`alert-card ${item.urgency}`} key={item.id}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className={`alert-badge ${item.urgency}`}>
                      {item.urgency === 'HIGH' ? 'Ưu tiên cao' : item.urgency === 'MEDIUM' ? 'Cần xử lý' : 'Theo dõi'}
                    </span>
                    <strong style={{ fontSize: '18px', color: item.urgency === 'HIGH' ? '#c62828' : '#17243a' }}>
                      {item.count}
                    </strong>
                  </div>
                  <strong style={{ fontSize: '14px', color: '#17243a' }}>{item.title}</strong>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                    {item.detail}
                  </p>
                </div>
                <a className="alert-action-btn" href={item.href}>
                  {item.actionLabel} →
                </a>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span className="logo-mark">N</span><div>NBS<span>CRM tuyển sinh</span></div></div>
        <div className="nav-label">TỔNG QUAN</div>
        <div className="nav-item selected">▦ <span>Dashboard</span></div>
        <a className="nav-item" href="/crm/leads">◎ <span>Lead vận hành</span></a>
        <a className="nav-item" href="/crm/ctv">♧ <span>Cộng tác viên</span></a>
        <a className="nav-item" href="/crm/commissions">☆ <span>Hoa hồng CTV</span></a>
        <a className="nav-item" href="/crm/sla">⏱ <span>Giám sát SLA</span></a>
        <a className="nav-item" href="/leads">▤ <span>Dữ liệu Excel</span></a>
        <a className="nav-item" href="/finance">◉ <span>Đối soát học phí</span></a>
        <a className="nav-item" href="/ne-events">▤ <span>Biến động NE</span></a>
        <div className="nav-label second">QUẢN TRỊ</div>
        {user.role === 'ADMIN' && <a className="nav-item" href="/admin/users">♙ <span>Duyệt tài khoản</span></a>}
        {user.role === 'ADMIN' && <a className="nav-item" href="/admin/import">▥ <span>Duyệt dữ liệu Excel</span></a>}
        {['ADMIN', 'LEADER'].includes(user.role) && (
          <a className="nav-item" href="/admin/import/duplicates">⧉ <span>Hàng chờ trùng lặp</span></a>
        )}
        <a className="nav-item" href="/audit">◷ <span>Lịch sử thay đổi</span></a>
        {['ADMIN', 'LEADER'].includes(user.role) && (
          <a className="nav-item" href="/admin/operations">⚙ <span>Vận hành & Sao lưu</span></a>
        )}
        <div className="sidebar-bottom">Bản xem trước nội bộ</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Tổng quan / Đối soát dữ liệu</div>
            <h1>Dashboard tuyển sinh</h1>
            <p>Theo dõi dữ liệu NE, lead, phễu chuyển đổi và cộng tác viên tại một nơi.</p>
          </div>
          <div className="user-menu">
            <span>{user.display_name}<small>{roleName}</small></span>
            <form action="/api/demo/logout" method="post"><button type="submit">Đăng xuất</button></form>
          </div>
        </header>

        <div className="info-banner">
          <span className="banner-icon">i</span>
          <span>NE chính thức chỉ lấy từ giao dịch học phí đã được Admin/Leader duyệt. Dữ liệu Excel vẫn ở vùng chờ đối soát.</span>
        </div>

        {/* Top KPI Cards */}
        <section className="cards">
          <article className="metric">
            <span>NE chính thức</span>
            <strong>{finance.officialNe}</strong>
            <small>Thu đã duyệt trừ hoàn toàn bộ</small>
          </article>
          <article className="metric">
            <span>Biến động hôm nay</span>
            <strong>{finance.todayNe > 0 ? '+' : ''}{finance.todayNe}</strong>
            <small>Theo ngày tiền vào</small>
          </article>
          <article className="metric">
            <span>Giao dịch chờ duyệt</span>
            <strong style={{ color: finance.pendingPayments > 0 ? '#d32f2f' : 'inherit' }}>
              {finance.pendingPayments}
            </strong>
            <small><a href="/finance">Mở đối soát</a></small>
          </article>
          <article className="metric">
            <span>Lead chờ hồ sơ</span>
            <strong>{finance.missingDocs}</strong>
            <small><a href="/crm/leads?stage=WAITING_DOCUMENTS">Theo dõi hoàn thiện</a></small>
          </article>
          <article className="metric">
            <span>Hoa hồng CTV chờ duyệt</span>
            <strong style={{ color: commissions.accrued.count > 0 ? '#b06000' : 'inherit' }}>
              {commissions.accrued.amount.toLocaleString('vi-VN')} ₫
            </strong>
            <small><a href="/crm/commissions?status=ACCRUED">{commissions.accrued.count} khoản chờ chi</a></small>
          </article>
          <article className="metric">
            <span>Tuân thủ SLA</span>
            <strong style={{ color: sla.complianceRate >= 90 ? '#2e7d32' : sla.complianceRate >= 75 ? '#b26a00' : '#d32f2f' }}>
              {sla.complianceRate}%
            </strong>
            <small><a href="/crm/sla">{sla.breachedLeads} lead trễ hạn</a></small>
          </article>
        </section>

        {/* Phase 5: CONVERSION FUNNEL (Phễu chuyển đổi tuyển sinh) */}
        <section className="panel next">
          <div className="panel-title">
            <div>
              <h2>Phễu chuyển đổi tuyển sinh</h2>
              <p>Chuyển đổi qua từng giai đoạn từ Tiếp nhận → Liên hệ → Tư vấn → Hồ sơ/Học phí → Đạt NE chính thức. Nhấp để drill-down sang danh sách.</p>
            </div>
            <a href="/crm/leads" style={{ fontSize: '12px', color: '#4169e1', textDecoration: 'none', fontWeight: 600 }}>
              Xem toàn bộ lead ({funnel.totalLeads}) →
            </a>
          </div>

          <div className="funnel-container">
            {funnel.stages.map((st, i) => {
              const widthPct = funnel.totalLeads > 0 ? Math.max(10, Math.round((st.count / funnel.totalLeads) * 100)) : 100;
              return (
                <div className="funnel-step" key={st.key}>
                  <div className="funnel-label">{st.label}</div>
                  <div className="funnel-bar-outer">
                    <a
                      className="funnel-bar-inner"
                      href={st.href}
                      style={{
                        width: `${widthPct}%`,
                        background: STEP_COLORS[i % STEP_COLORS.length],
                      }}
                      title={`${st.label}: ${st.count} lead (Click để lọc danh sách)`}
                    >
                      {st.count.toLocaleString('vi-VN')} lead
                    </a>
                  </div>
                  <div className="funnel-metrics">
                    {st.dropPercent > 0 && (
                      <span className="funnel-drop" title="Tỷ lệ rơi rớt so với bước trước">
                        −{st.dropPercent}%
                      </span>
                    )}
                    <span className="funnel-conv" title="Tỷ lệ chuyển đổi tích lũy so với tổng lead">
                      {st.conversionPercent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', alignSelf: 'center' }}>Chi tiết trạng thái:</span>
            <a className="chip" href="/crm/leads?stage=NEW" style={{ textDecoration: 'none', background: '#eaf0ff', color: '#2b52ba' }}>
              Mới: {funnel.pipeline.NEW}
            </a>
            <a className="chip" href="/crm/leads?stage=CONTACTED" style={{ textDecoration: 'none', background: '#e8f0fe', color: '#1967d2' }}>
              Đã liên hệ: {funnel.pipeline.CONTACTED}
            </a>
            <a className="chip" href="/crm/leads?stage=CONSULTING" style={{ textDecoration: 'none', background: '#f3e8fd', color: '#681da8' }}>
              Đang tư vấn: {funnel.pipeline.CONSULTING}
            </a>
            <a className="chip" href="/crm/leads?stage=WAITING_DOCUMENTS" style={{ textDecoration: 'none', background: '#fef7e0', color: '#b06000' }}>
              Chờ hồ sơ: {funnel.pipeline.WAITING_DOCUMENTS}
            </a>
            <a className="chip" href="/crm/leads?stage=WAITING_PAYMENT" style={{ textDecoration: 'none', background: '#e6f4ea', color: '#137333' }}>
              Chờ học phí: {funnel.pipeline.WAITING_PAYMENT}
            </a>
            <a className="chip" href="/crm/leads?filter=has_ne" style={{ textDecoration: 'none', background: '#e8f5e9', color: '#2e7d32', fontWeight: 700 }}>
              Đạt NE chính thức: {funnel.pipeline.NE}
            </a>
            <a className="chip" href="/crm/leads?stage=LOST" style={{ textDecoration: 'none', background: '#f1f3f4', color: '#5f6368' }}>
              Không tiếp tục: {funnel.pipeline.LOST}
            </a>
          </div>
        </section>

        {/* Phase 5: Program & Source Breakdown */}
        <div className="grid-main">
          {/* Program Breakdown */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Phân tích theo Ngành học</h2>
                <p>Số lượng lead và tỷ lệ đạt NE theo từng chương trình đào tạo.</p>
              </div>
            </div>
            {programs.length === 0 ? (
              <p className="empty-state">Chưa có dữ liệu ngành học.</p>
            ) : (
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Ngành đào tạo</th>
                    <th style={{ textAlign: 'center' }}>Số Lead</th>
                    <th style={{ textAlign: 'center' }}>Đạt NE</th>
                    <th style={{ textAlign: 'right' }}>Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map(pr => (
                    <tr key={pr.program}>
                      <td>
                        <a href={pr.href} style={{ textDecoration: 'none', color: '#17243a', fontWeight: 600 }}>
                          {pr.program}
                        </a>
                        <div className="breakdown-bar-bg">
                          <div
                            className="breakdown-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.round((pr.leadCount / (funnel.totalLeads || 1)) * 100))}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{pr.leadCount}</td>
                      <td style={{ textAlign: 'center', color: '#2e7d32', fontWeight: 600 }}>{pr.neCount}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#4169e1' }}>{pr.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Source Breakdown */}
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Phân tích theo Kênh nguồn</h2>
                <p>Hiệu quả tuyển sinh theo từng kênh lead.</p>
              </div>
            </div>
            {sources.length === 0 ? (
              <p className="empty-state">Chưa có dữ liệu kênh nguồn.</p>
            ) : (
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Kênh nguồn</th>
                    <th style={{ textAlign: 'center' }}>Số Lead</th>
                    <th style={{ textAlign: 'center' }}>Đạt NE</th>
                    <th style={{ textAlign: 'right' }}>Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map(src => (
                    <tr key={src.source}>
                      <td>
                        <a href={src.href} style={{ textDecoration: 'none', color: '#17243a', fontWeight: 600 }}>
                          {src.label}
                        </a>
                        <div className="breakdown-bar-bg">
                          <div
                            className="breakdown-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.round((src.leadCount / (funnel.totalLeads || 1)) * 100))}%`,
                              background: '#87a6f4',
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{src.leadCount}</td>
                      <td style={{ textAlign: 'center', color: '#2e7d32', fontWeight: 600 }}>{src.neCount}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#4169e1' }}>{src.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Phase 5: Operational Alerts Center (Trung tâm cảnh báo vận hành) */}
        <section className="panel next">
          <div className="panel-title">
            <div>
              <h2>Trung tâm cảnh báo vận hành</h2>
              <p>Các nút thắt và công việc cần xử lý để không bỏ lỡ học viên và đảm bảo kỷ luật đối soát.</p>
            </div>
          </div>
          <div className="alerts-grid">
            {alerts.map(item => (
              <div className={`alert-card ${item.urgency}`} key={item.id}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className={`alert-badge ${item.urgency}`}>
                      {item.urgency === 'HIGH' ? 'Ưu tiên cao' : item.urgency === 'MEDIUM' ? 'Cần xử lý' : 'Theo dõi'}
                    </span>
                    <strong style={{ fontSize: '18px', color: item.urgency === 'HIGH' ? '#c62828' : '#17243a' }}>
                      {item.count.toLocaleString('vi-VN')}
                    </strong>
                  </div>
                  <strong style={{ fontSize: '14px', color: '#17243a' }}>{item.title}</strong>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                    {item.detail}
                  </p>
                </div>
                <a className="alert-action-btn" href={item.href}>
                  {item.actionLabel} →
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* NE History & Performance Over Time */}
        <section className="panel next">
          <div className="panel-title">
            <div>
              <h2>Biến động NE theo ngày</h2>
              <p>Ngày tiền vào/hoàn tài khoản, giờ Việt Nam.</p>
            </div>
            <a href="/ne-events">Xem từng NE →</a>
          </div>
          {finance.daily.length === 0 ? (
            <p className="empty-state">Chưa có giao dịch học phí được duyệt.</p>
          ) : (
            <div className="daily-list">
              {finance.daily.map(row => (
                <div className="daily-row" key={row.day}>
                  <strong>{row.day}</strong>
                  <span>+{row.gained} thu · −{row.reversed} hoàn</span>
                  <b>{row.ne > 0 ? '+' : ''}{row.ne} NE</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid-main">
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>NE chính thức theo tháng</h2>
                <p>Giao dịch đã duyệt; khoản hoàn hết tiền ghi số âm.</p>
              </div>
            </div>
            {finance.monthly.length === 0 ? (
              <p className="empty-state">Chưa có NE.</p>
            ) : (
              <div className="daily-list">
                {finance.monthly.map(row => (
                  <div className="daily-row" key={row.month}>
                    <strong>{row.month}</strong>
                    <span>+{row.gained} thu · −{row.reversed} hoàn</span>
                    <b>{row.ne > 0 ? '+' : ''}{row.ne}</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>NE theo Sales</h2>
                <p>Tính theo người quản lý CTV tại ngày NE.</p>
              </div>
            </div>
            {finance.bySales.length === 0 ? (
              <p className="empty-state">Chưa có NE.</p>
            ) : (
              <div className="daily-list">
                {finance.bySales.map(row => (
                  <div className="daily-row" key={row.name}>
                    <strong>{row.name}</strong>
                    <span>+{row.gained} · −{row.reversed}</span>
                    <b>{row.ne}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* CRM Metric summary */}
        <section className="cards">
          <article className="metric">
            <span>Lead vận hành</span>
            <strong>{crm.leads}</strong>
            <small>Tạo và chăm sóc trong CRM</small>
          </article>
          <article className="metric">
            <span>Lead mới</span>
            <strong>{crm.newLeads}</strong>
            <small>Chưa chuyển trạng thái</small>
          </article>
          <article className="metric">
            <span>Follow-up quá hạn</span>
            <strong>{crm.overdue}</strong>
            <small>Chưa hoàn tất</small>
          </article>
          <article className="metric">
            <span>Hoạt động 24 giờ</span>
            <strong>{crm.recentActivities}</strong>
            <small>Gọi, nhắn, hẹn, ghi chú</small>
          </article>
        </section>

        {/* Excel Staging metrics */}
        <section className="cards import-dashboard-cards">
          <article className="metric">
            <span>Dòng đã nhập từ Excel</span>
            <strong>{(stats?.total ?? 0).toLocaleString('vi-VN')}</strong>
            <small>Giữ nguồn file, sheet, dòng</small>
          </article>
          <article className="metric">
            <span>Chưa phân công sales</span>
            <strong>{(stats?.unassigned ?? 0).toLocaleString('vi-VN')}</strong>
            <small>Chờ duyệt tên người phụ trách</small>
          </article>
          <article className="metric">
            <span>NE lịch sử chưa xác minh</span>
            <strong>{(stats?.history ?? 0).toLocaleString('vi-VN')}</strong>
            <small>Không tính KPI chính thức</small>
          </article>
          <article className="metric">
            <span>Có điện thoại chuẩn hóa</span>
            <strong>{(stats?.with_phone ?? 0).toLocaleString('vi-VN')}</strong>
            <small>Số giữ dạng chuỗi, không mất số 0</small>
          </article>
        </section>

        {/* KPI Comparison */}
        <div className="grid-main">
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Đối soát KPI NE 2026</h2>
                <p>Cột tổng trong Excel và tổng theo sales chưa khớp.</p>
              </div>
              <span className="chip">Tháng 1–9</span>
            </div>
            <div className="kpi-summary">
              <div><span>Mục tiêu</span><strong>426</strong></div>
              <div><span>Cột tổng Excel</span><strong>220</strong></div>
              <div><span>Cộng theo sales</span><strong>287</strong></div>
            </div>
            <div className="chart" aria-label="Biểu đồ KPI từng tháng">
              {kpi.map(row => (
                <div className="chart-column" key={row.month}>
                  <div className="chart-bars">
                    <span className="bar target" style={{ height: `${row.target}%` }} title={`Mục tiêu: ${row.target}`} />
                    <span className="bar reported" style={{ height: `${row.reported}%` }} title={`Cột tổng: ${row.reported}`} />
                    <span className="bar staff" style={{ height: `${row.staff}%` }} title={`Cá nhân: ${row.staff}`} />
                  </div>
                  <span className="chart-month">{row.month}</span>
                </div>
              ))}
            </div>
            <div className="legend">
              <span><i className="swatch target" />Mục tiêu</span>
              <span><i className="swatch reported" />Tổng Excel</span>
              <span><i className="swatch staff" />Theo sales</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Quy tắc NE đã chốt</h2>
                <p>Nền tảng cho KPI của dashboard vận hành.</p>
              </div>
            </div>
            <div className="rule-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <span>01</span><strong>Học phí dương</strong>
                <p>Bất kỳ khoản học phí đã xác nhận nào, kể cả đóng một phần, tạo một NE.</p>
              </div>
              <div>
                <span>02</span><strong>Ngày tiền vào</strong>
                <p>NE và KPI ghi theo ngày tiền vào tài khoản.</p>
              </div>
              <div>
                <span>03</span><strong>Hoàn toàn bộ</strong>
                <p>Trừ một NE vào ngày hoàn tiền; giữ lịch sử biến động.</p>
              </div>
              <div>
                <span>04</span><strong>Quyền theo CTV</strong>
                <p>Sales mới chỉ xem NE của CTV phát sinh sau chuyển giao.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
