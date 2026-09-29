import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb, getLeadScopeCondition, STAGE_LABELS, type LeadRow } from '@/lib/crm';
import { getBatchLeadScores, TIER_CONFIG, type LeadTier } from '@/lib/lead-scoring';
import { checkLeadSlaStatus } from '@/lib/sla-service';
import NewLeadForm from './new-lead-form';

export const dynamic = 'force-dynamic';

type Sales = { id: string; display_name: string };
type Ctv = { id: string; display_name: string; owner_user_id: string };

const FILTER_LABELS: Record<string, string> = {
  overdue: 'Việc follow-up quá hạn',
  missing_docs: 'Hồ sơ thiếu chứng từ',
  has_ne: 'Đạt NE chính thức',
  unassigned: 'Chưa có người phụ trách',
  sla_breach: 'Cảnh báo vi phạm SLA',
};

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    stage?: string;
    program?: string;
    source?: string;
    filter?: string;
    tier?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 60);
  const stage = (params.stage ?? '').trim();
  const program = (params.program ?? '').trim();
  const source = (params.source ?? '').trim();
  const filter = (params.filter ?? '').trim();
  const tier = (params.tier ?? '').trim();
  const PAGE_SIZE = 20;

  const db = getCrmDb();
  const sales = user.role === 'SALES'
    ? [{ id: user.id, display_name: user.display_name }]
    : db.prepare("SELECT id, display_name FROM demo_users WHERE role = 'SALES' AND status = 'ACTIVE' ORDER BY display_name").all() as Sales[];
  const ctv = (user.role === 'SALES'
    ? db.prepare('SELECT id, display_name, owner_user_id FROM demo_ctv WHERE is_active = 1 AND owner_user_id = ? ORDER BY display_name').all(user.id)
    : db.prepare('SELECT id, display_name, owner_user_id FROM demo_ctv WHERE is_active = 1 ORDER BY display_name').all()) as Ctv[];

  const programs = db.prepare("SELECT DISTINCT program FROM demo_leads WHERE program IS NOT NULL AND program <> '' ORDER BY program").all() as Array<{ program: string }>;
  const sources = db.prepare("SELECT DISTINCT source FROM demo_leads WHERE source IS NOT NULL AND source <> '' ORDER BY source").all() as Array<{ source: string }>;

  const scope = getLeadScopeCondition(user, 'l');
  const conditions = [scope.sql];
  const queryParams: (string | number)[] = [...scope.params];

  if (stage && stage in STAGE_LABELS) {
    conditions.push('l.stage = ?');
    queryParams.push(stage);
  }
  if (program) {
    conditions.push('l.program = ?');
    queryParams.push(program);
  }
  if (source) {
    conditions.push('l.source = ?');
    queryParams.push(source);
  }
  if (filter === 'overdue') {
    conditions.push("EXISTS (SELECT 1 FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < datetime('now'))");
  } else if (filter === 'missing_docs') {
    conditions.push(`(
      (l.stage = 'WAITING_DOCUMENTS' OR EXISTS (SELECT 1 FROM demo_ne_events ne WHERE ne.lead_id = l.id AND ne.delta = 1))
      AND (
        EXISTS (SELECT 1 FROM demo_lead_documents d WHERE d.lead_id = l.id AND d.status = 'MISSING')
        OR NOT EXISTS (SELECT 1 FROM demo_lead_documents d WHERE d.lead_id = l.id)
      )
    )`);
  } else if (filter === 'has_ne') {
    conditions.push("EXISTS (SELECT 1 FROM demo_ne_events ne WHERE ne.lead_id = l.id AND ne.delta = 1)");
  } else if (filter === 'unassigned') {
    conditions.push("l.owner_user_id IS NULL");
  } else if (filter === 'sla_breach') {
    // Lead vi phạm SLA: NEW chưa liên hệ sau 24h HOẶC follow-up quá hạn HOẶC chăm sóc bỏ quên > 5 ngày
    conditions.push(`(
      l.stage <> 'LOST' AND NOT EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND e.delta = 1)
      AND (
        (l.stage = 'NEW' AND NOT EXISTS (SELECT 1 FROM demo_lead_activities a WHERE a.lead_id = l.id) AND l.created_at < datetime('now', '-24 hours'))
        OR EXISTS (SELECT 1 FROM demo_followups f WHERE f.lead_id = l.id AND f.status = 'OPEN' AND f.due_at < datetime('now'))
        OR (
          l.stage IN ('CONTACTED', 'CONSULTING', 'WAITING_DOCUMENTS', 'WAITING_PAYMENT')
          AND NOT EXISTS (SELECT 1 FROM demo_lead_activities a WHERE a.lead_id = l.id AND a.occurred_at >= datetime('now', '-5 days'))
          AND l.created_at < datetime('now', '-5 days')
        )
      )
    )`);
  }

  if (q) {
    conditions.push(`(l.full_name LIKE ? ESCAPE '\\' OR l.phone_normalized LIKE ? ESCAPE '\\' OR l.contact_text LIKE ? ESCAPE '\\')`);
    const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
    queryParams.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
  }

  const where = conditions.join(' AND ');
  const totalCount = (db.prepare(`SELECT COUNT(*) AS n FROM demo_leads l WHERE ${where}`).get(...queryParams) as { n: number }).n;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;

  const leads = db.prepare(`
    SELECT l.*, u.display_name AS owner_name, c.display_name AS ctv_name,
      (SELECT COUNT(*) FROM demo_ne_events ne WHERE ne.lead_id = l.id AND ne.delta = 1) AS has_ne_event
    FROM demo_leads l
    JOIN demo_users u ON u.id = l.owner_user_id
    LEFT JOIN demo_ctv c ON c.id = l.ctv_id
    WHERE ${where}
    ORDER BY l.updated_at DESC LIMIT ? OFFSET ?
  `).all(...queryParams, PAGE_SIZE, offset) as Array<LeadRow & { owner_name: string; ctv_name: string | null; has_ne_event: number }>;

  const leadIds = leads.map(l => l.id);
  const scoresMap = getBatchLeadScores(leadIds, db);

  const buildQuery = (newParams: Record<string, string | number | undefined>) => {
    const current: Record<string, string> = {};
    if (q) current.q = q;
    if (stage) current.stage = stage;
    if (program) current.program = program;
    if (source) current.source = source;
    if (filter) current.filter = filter;
    if (tier) current.tier = tier;
    for (const [k, v] of Object.entries(newParams)) {
      if (v === undefined || v === '') {
        delete current[k];
      } else {
        current[k] = String(v);
      }
    }
    const qs = new URLSearchParams(current).toString();
    return qs ? `?${qs}` : '';
  };

  const exportUrl = `/api/demo/crm/export${buildQuery({ type: 'leads' })}`;
  const makeHref = (p: number) => `/crm/leads${buildQuery({ page: p })}`;

  const hasAnyFilter = Boolean(q || stage || program || source || filter || tier);

  return <main className="admin-page crm-page">
    <div className="admin-header">
      <div>
        <p className="breadcrumb">CRM / Lead</p>
        <h1>Quản lý lead hằng ngày</h1>
        <p>Tạo lead, lưu hoạt động, chấm điểm tiềm năng và theo dõi SLA phản hồi.</p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <a className="outline-button" href={exportUrl} download style={{ textDecoration: 'none', color: '#162a52', fontSize: '12px', fontWeight: 600 }}>
          📥 Xuất Excel/CSV
        </a>
        <Link href="/">← Dashboard</Link>
      </div>
    </div>
    <div className="crm-grid">
      <section className="admin-panel">
        <h2>Tạo lead</h2>
        <NewLeadForm role={user.role} sales={sales} ctv={ctv} />
      </section>
      <section className="admin-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>Lead đang quản lý <span>{totalCount}</span></h2>
        </div>

        <form className="lead-search" action="/crm/leads" method="get" style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input name="q" defaultValue={q} placeholder="Tìm tên, số điện thoại..." maxLength={60} style={{ flex: 1, minWidth: '150px' }} />
          <select name="stage" defaultValue={stage} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option value={k} key={k}>{v}</option>
            ))}
          </select>
          {programs.length > 0 && (
            <select name="program" defaultValue={program} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
              <option value="">Tất cả ngành</option>
              {programs.map(p => (
                <option value={p.program} key={p.program}>{p.program}</option>
              ))}
            </select>
          )}
          {sources.length > 0 && (
            <select name="source" defaultValue={source} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
              <option value="">Tất cả nguồn</option>
              {sources.map(s => (
                <option value={s.source} key={s.source}>{s.source}</option>
              ))}
            </select>
          )}
          <select name="tier" defaultValue={tier} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
            <option value="">Tất cả tiềm năng</option>
            <option value="HOT">🔥 Rất tiềm năng (HOT)</option>
            <option value="WARM">⚡ Đang theo sát (WARM)</option>
            <option value="COLD">❄️ Cần kích hoạt (COLD)</option>
          </select>
          <select name="filter" defaultValue={filter} style={{ border: '1px solid #dbe3ee', borderRadius: '8px', padding: '0 8px', fontSize: '13px', background: '#fff' }}>
            <option value="">Bộ lọc nghiệp vụ</option>
            {Object.entries(FILTER_LABELS).map(([k, v]) => (
              <option value={k} key={k}>{v}</option>
            ))}
          </select>
          <button type="submit">Tìm</button>
          {hasAnyFilter && <Link href="/crm/leads" style={{ fontSize: '12px', alignSelf: 'center', color: '#4169e1', textDecoration: 'none' }}>Đặt lại</Link>}
        </form>

        {hasAnyFilter && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#748198' }}>Đang lọc:</span>
            {stage && <span className="chip" style={{ background: '#eaf0ff', color: '#3155bf' }}>Trạng thái: {(STAGE_LABELS as Record<string, string>)[stage] ?? stage}</span>}
            {program && <span className="chip" style={{ background: '#f0f5ff', color: '#435d8c' }}>Ngành: {program}</span>}
            {source && <span className="chip" style={{ background: '#f5f0ff', color: '#6a3cbc' }}>Nguồn: {source}</span>}
            {tier && <span className="chip" style={{ background: TIER_CONFIG[tier as LeadTier]?.bg ?? '#eee', color: TIER_CONFIG[tier as LeadTier]?.color ?? '#333' }}>Tiềm năng: {tier}</span>}
            {filter && <span className="chip" style={{ background: '#fff1e2', color: '#b27423' }}>Lọc: {FILTER_LABELS[filter] ?? filter}</span>}
            <Link href="/crm/leads" style={{ fontSize: '11px', color: '#e04040', textDecoration: 'none', marginLeft: '4px' }}>✕ Xóa hết lọc</Link>
          </div>
        )}

        {leads.length === 0 && <p className="empty-state">Không tìm thấy lead nào phù hợp.</p>}
        {leads.map(lead => {
          const scoreInfo = scoresMap.get(lead.id);
          const slaBreaches = checkLeadSlaStatus(lead.id, db);
          return (
            <Link className="crm-lead-row" href={`/crm/leads/${lead.id}`} key={lead.id}>
              <div>
                <strong>
                  {lead.full_name}
                  {lead.has_ne_event > 0 && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#e1f5fe', color: '#0288d1', padding: '2px 6px', borderRadius: '10px', fontWeight: 600 }}>NE chính thức</span>}
                  {slaBreaches.length > 0 && (
                    <span
                      style={{ marginLeft: '6px', fontSize: '10px', background: '#ffebee', color: '#c62828', padding: '2px 6px', borderRadius: '10px', fontWeight: 700 }}
                      title={slaBreaches.map(b => b.breachTitle).join(', ')}
                    >
                      ⚠️ Trễ SLA ({slaBreaches.length})
                    </span>
                  )}
                </strong>
                <small>
                  {lead.phone_normalized ?? lead.contact_text ?? 'Chưa có liên hệ'}
                  {lead.program && ` · ${lead.program}`}
                  {lead.source && ` · Nguồn: ${lead.source}`}
                  {user.role !== 'SALES' && ` · Sales: ${lead.owner_name}`}
                  {lead.ctv_name && ` · CTV: ${lead.ctv_name}`}
                </small>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {scoreInfo && (
                  <span
                    className="chip"
                    style={{
                      background: scoreInfo.tierBg,
                      color: scoreInfo.tierColor,
                      fontWeight: 700,
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                    }}
                    title={`Điểm tiềm năng: ${scoreInfo.score}/100`}
                  >
                    {scoreInfo.tier === 'HOT' ? '🔥' : scoreInfo.tier === 'WARM' ? '⚡' : '❄️'} {scoreInfo.score}đ · {scoreInfo.tierLabel}
                  </span>
                )}
                <span className="status-pill" style={{ background: '#eaf0ff', color: '#3155bf' }}>{STAGE_LABELS[lead.stage]}</span>
              </div>
            </Link>
          );
        })}

        {totalPages > 1 && (
          <div className="pagination">
            {page > 1 && <Link href={makeHref(page - 1)}>← Trang trước</Link>}
            <span>Trang {page} / {totalPages}</span>
            {page < totalPages && <Link href={makeHref(page + 1)}>Trang sau →</Link>}
          </div>
        )}
      </section>
    </div>
  </main>;
}
