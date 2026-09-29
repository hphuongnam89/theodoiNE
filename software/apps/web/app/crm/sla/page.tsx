import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getSlaMetrics } from '@/lib/sla-service';
import { STAGE_LABELS, type LeadStage } from '@/lib/crm-shared';

export const dynamic = 'force-dynamic';

export default async function SlaMonitoringPage() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');

  const salesId = user.role === 'SALES' ? user.id : undefined;
  const metrics = getSlaMetrics(salesId);

  const complianceColor = metrics.complianceRate >= 90
    ? '#2e7d32'
    : metrics.complianceRate >= 75
    ? '#b26a00'
    : '#d32f2f';

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <p className="breadcrumb">CRM / Giám sát vận hành</p>
          <h1>Giám sát SLA chăm sóc & Cảnh báo vi phạm</h1>
          <p>
            Theo dõi cam kết thời gian phản hồi (SLA) đối với lead mới, tương tác duy trì và lịch hẹn follow-up.
            {user.role === 'SALES' ? ' (Hiển thị phạm vi của bạn)' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link href="/crm/leads">Xem danh sách Lead</Link>
          <Link href="/">← Dashboard</Link>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="cards" style={{ marginBottom: '20px' }}>
        <article className="metric">
          <span>Tỷ lệ tuân thủ SLA</span>
          <strong style={{ color: complianceColor }}>{metrics.complianceRate}%</strong>
          <small>{metrics.compliantLeads} / {metrics.totalActiveLeads} lead đúng hạn</small>
        </article>
        <article className="metric">
          <span>Lead vi phạm SLA</span>
          <strong style={{ color: metrics.breachedLeads > 0 ? '#d32f2f' : '#2e7d32' }}>
            {metrics.breachedLeads}
          </strong>
          <small>Cần liên hệ hoặc cập nhật ngay</small>
        </article>
        <article className="metric">
          <span>Lead mới chưa liên hệ (&gt;24h)</span>
          <strong style={{ color: metrics.breachesByType.newUntouched > 0 ? '#d32f2f' : 'inherit' }}>
            {metrics.breachesByType.newUntouched}
          </strong>
          <small>Chưa có cuộc gọi/tin nhắn đầu tiên</small>
        </article>
        <article className="metric">
          <span>Lịch hẹn quá hạn</span>
          <strong style={{ color: metrics.breachesByType.overdueFollowup > 0 ? '#d32f2f' : 'inherit' }}>
            {metrics.breachesByType.overdueFollowup}
          </strong>
          <small>Đã qua thời điểm cam kết</small>
        </article>
      </section>

      {/* Sales Compliance Ranking (Admin & Leader) */}
      {user.role !== 'SALES' && metrics.salesRanking.length > 0 && (
        <section className="admin-panel" style={{ marginBottom: '24px' }}>
          <h2>Bảng theo dõi tuân thủ SLA theo chuyên viên</h2>
          <p style={{ fontSize: '13px', color: '#5f6368', marginBottom: '14px' }}>
            Đánh giá kỷ luật tư vấn và tốc độ chăm sóc khách hàng của từng nhân sự tuyển sinh.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tư vấn viên (Sales)</th>
                  <th>Lead đang phụ trách</th>
                  <th>Số lead vi phạm SLA</th>
                  <th>Tỷ lệ tuân thủ (%)</th>
                  <th>Đánh giá vận hành</th>
                </tr>
              </thead>
              <tbody>
                {metrics.salesRanking.map(sales => {
                  const rateColor = sales.complianceRate >= 90 ? '#2e7d32' : sales.complianceRate >= 75 ? '#b26a00' : '#d32f2f';
                  const rateLabel = sales.complianceRate >= 90 ? 'Tốt' : sales.complianceRate >= 75 ? 'Cần cải thiện' : 'Vi phạm nghiêm trọng';
                  return (
                    <tr key={sales.salesId}>
                      <td><strong>{sales.salesName}</strong></td>
                      <td>{sales.activeCount} lead</td>
                      <td>
                        <strong style={{ color: sales.breachedCount > 0 ? '#d32f2f' : '#2e7d32' }}>
                          {sales.breachedCount}
                        </strong>
                      </td>
                      <td>
                        <strong style={{ color: rateColor, fontSize: '14px' }}>
                          {sales.complianceRate}%
                        </strong>
                      </td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            background: sales.complianceRate >= 90 ? '#e6f4ea' : sales.complianceRate >= 75 ? '#fff8e1' : '#ffebee',
                            color: rateColor,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          {rateLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SLA Breach Details List */}
      <section className="admin-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>
            Danh sách Lead đang vi phạm SLA <span>{metrics.breachList.length}</span>
          </h2>
        </div>

        {metrics.breachList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#2e7d32', background: '#e8f5e9', borderRadius: '8px' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '16px' }}>🎉 Không có vi phạm SLA nào!</p>
            <small>Toàn bộ lead mới đã được liên hệ đúng hạn và không có lịch hẹn nào bị quá hạn.</small>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mức độ</th>
                  <th>Học viên (Lead)</th>
                  <th>Phụ trách</th>
                  <th>Giai đoạn</th>
                  <th>Nội dung vi phạm SLA</th>
                  <th>Thời gian trễ</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {metrics.breachList.map(item => (
                  <tr key={`${item.leadId}-${item.breachType}`}>
                    <td>
                      <span
                        className="chip"
                        style={{
                          background: item.severity === 'HIGH' ? '#ffebee' : '#fff8e1',
                          color: item.severity === 'HIGH' ? '#c62828' : '#b26a00',
                          fontWeight: 700,
                          fontSize: '11px',
                          padding: '3px 6px',
                        }}
                      >
                        {item.severity === 'HIGH' ? '🔴 KHẨN' : '🟡 CẢNH BÁO'}
                      </span>
                    </td>
                    <td>
                      <Link href={`/crm/leads/${item.leadId}`} style={{ fontWeight: 600, color: '#1a73e8', textDecoration: 'none' }}>
                        {item.fullName}
                      </Link>
                      {item.phone && <div style={{ fontSize: '11px', color: '#5f6368' }}>{item.phone}</div>}
                    </td>
                    <td>
                      <span>{item.salesName}</span>
                    </td>
                    <td>
                      <span className="chip" style={{ fontSize: '11px' }}>
                        {STAGE_LABELS[item.stage as LeadStage] ?? item.stage}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: '#d32f2f', fontSize: '13px' }}>{item.breachTitle}</strong>
                      <div style={{ fontSize: '11px', color: '#5f6368', marginTop: '2px' }}>
                        {item.breachDescription}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: '#c62828' }}>
                        {item.hoursOverdue >= 24
                          ? `${Math.floor(item.hoursOverdue / 24)} ngày ${item.hoursOverdue % 24}h`
                          : `${item.hoursOverdue} giờ`}
                      </strong>
                    </td>
                    <td>
                      <Link
                        href={`/crm/leads/${item.leadId}`}
                        className="auth-button"
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          background: '#1967d2',
                          textDecoration: 'none',
                          display: 'inline-block',
                        }}
                      >
                        📞 Xử lý ngay
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
