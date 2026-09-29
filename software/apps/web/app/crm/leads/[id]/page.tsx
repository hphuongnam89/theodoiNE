import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { canReadLead, getCrmDb, STAGE_LABELS, type LeadRow } from '@/lib/crm';
import { calculateLeadScore } from '@/lib/lead-scoring';
import { checkLeadSlaStatus } from '@/lib/sla-service';
import { COMMISSION_STATUS_LABELS } from '@/lib/commissions';
import LeadActions from './lead-actions';
import FinanceActions from './finance-actions';

export const dynamic = 'force-dynamic';

type Activity = { id: string; kind: string; note: string; occurred_at: string; actor_name: string };
type Followup = { id: string; due_at: string; note: string; status: string; completed_at: string | null };
type StageEvent = { id: string; old_stage: string | null; new_stage: string; reason: string | null; occurred_at: string };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const { id } = await params;
  const db = getCrmDb();
  const lead = db.prepare('SELECT * FROM demo_leads WHERE id = ?').get(id) as LeadRow | undefined;
  if (!lead || !canReadLead(user, lead)) notFound();

  const scoreInfo = calculateLeadScore(id, db);
  const slaBreaches = checkLeadSlaStatus(id, db);
  const commission = lead.ctv_id ? db.prepare(`
    SELECT c.*, p.name AS policy_name
    FROM demo_ctv_commissions c
    LEFT JOIN demo_commission_policies p ON c.policy_id = p.id
    WHERE c.lead_id = ?
    ORDER BY c.accrued_at DESC LIMIT 1
  `).get(id) as any : null;

  const activities = db.prepare(`SELECT a.id, a.kind, a.note, a.occurred_at, u.display_name AS actor_name
    FROM demo_lead_activities a JOIN demo_users u ON u.id = a.actor_id
    WHERE a.lead_id = ? ORDER BY a.occurred_at DESC LIMIT 100`).all(id) as Activity[];
  const followups = db.prepare(`SELECT id, due_at, note, status, completed_at
    FROM demo_followups WHERE lead_id = ? ORDER BY status ASC, due_at ASC LIMIT 100`).all(id) as Followup[];
  const stages = db.prepare(`SELECT id, old_stage, new_stage, reason, occurred_at
    FROM demo_lead_stage_events WHERE lead_id = ? ORDER BY occurred_at DESC LIMIT 30`).all(id) as StageEvent[];
  const payments = db.prepare(`SELECT id, kind, amount_vnd, bank_at, reference_code, status,
    review_reason, evidence_file_name, evidence_url
    FROM demo_payments WHERE lead_id = ? ORDER BY bank_at DESC, submitted_at DESC`).all(id) as Array<{
      id: string; kind: 'RECEIPT' | 'REFUND'; amount_vnd: number; bank_at: string;
      reference_code: string; status: string; review_reason: string | null;
      evidence_file_name?: string | null; evidence_url?: string | null;
    }>;
  const documents = db.prepare('SELECT document_type, status, note FROM demo_lead_documents WHERE lead_id = ?')
    .all(id) as Array<{ document_type: string; status: string; note: string | null }>;
  const owner = db.prepare('SELECT display_name FROM demo_users WHERE id = ?').get(lead.owner_user_id) as { display_name: string };
  const ctv = lead.ctv_id ? db.prepare('SELECT display_name FROM demo_ctv WHERE id = ?').get(lead.ctv_id) as { display_name: string } | undefined : undefined;
  const sales = user.role === 'SALES' ? [] : db.prepare("SELECT id, display_name FROM demo_users WHERE role = 'SALES' AND status = 'ACTIVE' ORDER BY display_name").all() as Array<{ id: string; display_name: string }>;
  return <main className="admin-page crm-page">
    <div className="admin-header"><div><p className="breadcrumb">CRM / Lead / Chi tiết</p><h1>{lead.full_name}</h1>
      <p>{lead.phone_normalized ?? lead.contact_text ?? 'Chưa có liên hệ'} · {STAGE_LABELS[lead.stage]}</p></div><Link href="/crm/leads">← Danh sách lead</Link></div>

    {/* SLA Warning Banner */}
    {slaBreaches.length > 0 && (
      <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <strong style={{ color: '#c62828', display: 'flex', alignItems: 'center', gap: '6px' }}>
          ⚠️ CẢNH BÁO VI PHẠM SLA TƯ VẤN ({slaBreaches.length})
        </strong>
        <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', fontSize: '13px', color: '#b71c1c' }}>
          {slaBreaches.map(b => (
            <li key={b.breachType}>
              <strong>{b.breachTitle}</strong>: {b.breachDescription}
            </li>
          ))}
        </ul>
      </div>
    )}

    <div className="crm-grid">
      <section className="admin-panel lead-overview">
        <h2>Thông tin chung</h2>
        <dl>
          <dt>Sales phụ trách</dt><dd>{owner.display_name}</dd>
          <dt>Ngành quan tâm</dt><dd>{lead.program ?? 'Chưa chọn'}</dd>
          <dt>Nguồn</dt><dd>{lead.source}</dd>
          <dt>CTV</dt><dd>{ctv?.display_name ?? 'Không có'}</dd>
          <dt>Ngày tạo</dt><dd>{new Date(lead.created_at).toLocaleString('vi-VN')}</dd>
          {lead.lost_reason && <><dt>Lý do Lost</dt><dd>{lead.lost_reason}</dd></>}
        </dl>

        {/* Lead Potential Score Card */}
        <div style={{ marginTop: '16px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#162a52' }}>Điểm tiềm năng (Lead Score)</span>
            <span
              className="chip"
              style={{
                background: scoreInfo.tierBg,
                color: scoreInfo.tierColor,
                fontWeight: 700,
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
              }}
            >
              {scoreInfo.tier === 'HOT' ? '🔥' : scoreInfo.tier === 'WARM' ? '⚡' : '❄️'} {scoreInfo.tierLabel}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${scoreInfo.score}%`,
                  height: '100%',
                  background: scoreInfo.tier === 'HOT' ? '#d32f2f' : scoreInfo.tier === 'WARM' ? '#f57c00' : '#757575',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <strong style={{ fontSize: '15px', color: '#162a52' }}>{scoreInfo.score}/100</strong>
          </div>

          {/* Score Factors Breakdown */}
          <div style={{ fontSize: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Yếu tố đánh giá:</span>
            <div style={{ display: 'grid', gap: '4px', marginTop: '6px' }}>
              {scoreInfo.factors.map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: f.achieved ? '#2e7d32' : '#64748b' }}>
                    {f.achieved ? '✓' : '○'} {f.label}
                  </span>
                  <span style={{ fontWeight: 600, color: f.points > 0 ? (f.achieved ? '#2e7d32' : '#94a3b8') : '#d32f2f' }}>
                    {f.points > 0 ? `+${f.points}` : f.points}đ
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTV Commission Status Card */}
        {lead.ctv_id && (
          <div style={{ marginTop: '14px', padding: '14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>Hoa hồng CTV giới thiệu</span>
              <Link href="/crm/commissions" style={{ fontSize: '11px', color: '#15803d', textDecoration: 'none', fontWeight: 600 }}>
                Quản lý chi trả →
              </Link>
            </div>
            {commission ? (
              <div style={{ fontSize: '12px' }}>
                <p style={{ margin: '0 0 4px 0', color: '#14532d' }}>
                  Mức hoa hồng: <strong style={{ fontSize: '14px' }}>{commission.amount_vnd.toLocaleString('vi-VN')} ₫</strong>
                  {commission.policy_name && ` (${commission.policy_name})`}
                </p>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span>Trạng thái:</span>
                  <span style={{ fontWeight: 700, color: commission.status === 'PAID' ? '#15803d' : commission.status === 'APPROVED' ? '#b45309' : '#1d4ed8' }}>
                    {COMMISSION_STATUS_LABELS[commission.status as keyof typeof COMMISSION_STATUS_LABELS] ?? commission.status}
                  </span>
                  {commission.payment_reference && (
                    <span style={{ color: '#64748b' }}>· Mã UNC: {commission.payment_reference}</span>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '12px', color: '#15803d' }}>
                Hoa hồng sẽ tự động ghi nhận khi học viên nộp học phí và được duyệt NE (+1 NE).
              </p>
            )}
          </div>
        )}

        <LeadActions lead={lead} role={user.role} sales={sales} followups={followups} />
      </section><section className="admin-panel"><h2>Lịch sử chăm sóc</h2>
      {activities.length === 0 && <p className="empty-state">Chưa có hoạt động.</p>}
      {activities.map(item => <article className="activity-row" key={item.id}><strong>{({ CALL: 'Cuộc gọi', MESSAGE: 'Tin nhắn', MEETING: 'Cuộc hẹn', NOTE: 'Ghi chú' } as Record<string,string>)[item.kind] ?? item.kind}</strong>
        <small>{item.actor_name} · {new Date(item.occurred_at).toLocaleString('vi-VN')}</small><p>{item.note}</p></article>)}
      <h2 className="history-heading">Lịch sử trạng thái</h2>
      {stages.map(item => <article className="stage-row" key={item.id}><span>{STAGE_LABELS[item.new_stage as keyof typeof STAGE_LABELS]}</span><small>{new Date(item.occurred_at).toLocaleString('vi-VN')}</small></article>)}
    </section></div>
    <FinanceActions leadId={id} role={user.role} payments={payments} documents={documents} />
  </main>;
}
