import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb, getLeadScopeCondition, STAGE_LABELS } from '@/lib/crm';

export const runtime = 'nodejs';

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsv).join(',') + '\r\n';
}

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') {
    return new Response('Chưa đăng nhập.', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'leads';
  const q = (searchParams.get('q') || '').trim();
  const db = getCrmDb();

  let csvContent = '\uFEFF'; // UTF-8 BOM for Microsoft Excel
  let filename = `bao-cao-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

  if (type === 'leads') {
    const stage = searchParams.get('stage') || '';
    const program = searchParams.get('program') || '';
    const source = searchParams.get('source') || '';
    const filter = searchParams.get('filter') || '';
    const scope = getLeadScopeCondition(user, 'l');
    const conditions = [scope.sql];
    const params = [...scope.params];

    if (stage && stage in STAGE_LABELS) {
      conditions.push('l.stage = ?');
      params.push(stage);
    }
    if (program) {
      conditions.push('l.program = ?');
      params.push(program);
    }
    if (source) {
      conditions.push('l.source = ?');
      params.push(source);
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
    }
    if (q) {
      conditions.push(`(l.full_name LIKE ? ESCAPE '\\' OR l.phone_normalized LIKE ? ESCAPE '\\' OR l.contact_text LIKE ? ESCAPE '\\')`);
      const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
      params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
    }

    const where = conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT l.id, l.full_name, l.phone_normalized, l.contact_text, l.program, l.source,
             l.stage, l.lost_reason, u.display_name AS owner_name, c.display_name AS ctv_name,
             l.created_at, l.updated_at
      FROM demo_leads l
      JOIN demo_users u ON u.id = l.owner_user_id
      LEFT JOIN demo_ctv c ON c.id = l.ctv_id
      WHERE ${where}
      ORDER BY l.updated_at DESC
    `).all(...params) as Array<{
      id: string; full_name: string; phone_normalized: string | null; contact_text: string | null;
      program: string | null; source: string; stage: string; lost_reason: string | null;
      owner_name: string; ctv_name: string | null; created_at: string; updated_at: string;
    }>;

    csvContent += toCsvRow([
      'Mã Lead', 'Họ và tên', 'Số điện thoại', 'Thông tin liên hệ khác', 'Ngành quan tâm',
      'Nguồn', 'Trạng thái', 'Lý do không tiếp tục', 'Sales phụ trách', 'CTV giới thiệu',
      'Ngày tạo (Giờ VN)', 'Cập nhật cuối (Giờ VN)'
    ]);

    for (const r of rows) {
      csvContent += toCsvRow([
        r.id,
        r.full_name,
        r.phone_normalized ?? '',
        r.contact_text ?? '',
        r.program ?? '',
        r.source,
        STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] ?? r.stage,
        r.lost_reason ?? '',
        r.owner_name,
        r.ctv_name ?? '',
        new Date(r.created_at).toLocaleString('vi-VN'),
        new Date(r.updated_at).toLocaleString('vi-VN'),
      ]);
    }
  } else if (type === 'finance') {
    const status = searchParams.get('status') || '';
    const kind = searchParams.get('kind') || '';
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (user.role === 'SALES') {
      conditions.push(`(
        l.owner_user_id = ?
        OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?)
        OR EXISTS (SELECT 1 FROM demo_ne_events e WHERE e.lead_id = l.id AND (e.sales_user_id = ? OR e.ctv_manager_user_id = ?))
      )`);
      params.push(user.id, user.id, user.id, user.id);
    }
    if (status && ['PENDING', 'CONFIRMED', 'REJECTED'].includes(status)) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (kind && ['RECEIPT', 'REFUND'].includes(kind)) {
      conditions.push('p.kind = ?');
      params.push(kind);
    }
    if (q) {
      conditions.push(`(p.reference_code LIKE ? ESCAPE '\\' OR l.full_name LIKE ? ESCAPE '\\' OR l.phone_normalized LIKE ? ESCAPE '\\')`);
      const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
      params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
    }

    const where = conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT p.id, p.reference_code, l.full_name, l.phone_normalized, p.kind, p.amount_vnd,
             p.bank_at, p.status, p.note, p.review_reason, p.evidence_file_name,
             u_sub.display_name AS submitted_name, p.submitted_at,
             u_rev.display_name AS reviewed_name, p.reviewed_at,
             u_owner.display_name AS owner_name
      FROM demo_payments p
      JOIN demo_leads l ON l.id = p.lead_id
      JOIN demo_users u_owner ON u_owner.id = l.owner_user_id
      JOIN demo_users u_sub ON u_sub.id = p.submitted_by
      LEFT JOIN demo_users u_rev ON u_rev.id = p.reviewed_by
      WHERE ${where}
      ORDER BY p.bank_at DESC, p.submitted_at DESC
    `).all(...params) as Array<{
      id: string; reference_code: string; full_name: string; phone_normalized: string | null;
      kind: string; amount_vnd: number; bank_at: string; status: string; note: string | null;
      review_reason: string | null; evidence_file_name: string | null;
      submitted_name: string; submitted_at: string; reviewed_name: string | null;
      reviewed_at: string | null; owner_name: string;
    }>;

    csvContent += toCsvRow([
      'Mã giao dịch', 'Mã đối soát ngân hàng', 'Họ tên học viên', 'Số điện thoại', 'Loại giao dịch',
      'Số tiền (VND)', 'Thời điểm ngân hàng', 'Trạng thái', 'Sales phụ trách', 'Ghi chú',
      'Chứng từ đính kèm', 'Người gửi', 'Thời điểm gửi', 'Người duyệt', 'Thời điểm duyệt', 'Lý do từ chối'
    ]);

    for (const r of rows) {
      csvContent += toCsvRow([
        r.id,
        r.reference_code,
        r.full_name,
        r.phone_normalized ?? '',
        r.kind === 'RECEIPT' ? 'Thu học phí' : 'Hoàn học phí',
        r.amount_vnd,
        new Date(r.bank_at).toLocaleString('vi-VN'),
        r.status === 'CONFIRMED' ? 'Đã duyệt' : r.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt',
        r.owner_name,
        r.note ?? '',
        r.evidence_file_name ?? 'Không có',
        r.submitted_name,
        new Date(r.submitted_at).toLocaleString('vi-VN'),
        r.reviewed_name ?? '',
        r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('vi-VN') : '',
        r.review_reason ?? '',
      ]);
    }
  } else if (type === 'ne-events') {
    const delta = searchParams.get('delta');
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (user.role === 'SALES') {
      conditions.push('(e.sales_user_id = ? OR e.ctv_manager_user_id = ?)');
      params.push(user.id, user.id);
    }
    if (delta === '1' || delta === '-1') {
      conditions.push('e.delta = ?');
      params.push(Number(delta));
    }
    if (q) {
      conditions.push(`(l.full_name LIKE ? ESCAPE '\\' OR p.reference_code LIKE ? ESCAPE '\\' OR c.display_name LIKE ? ESCAPE '\\')`);
      const escaped = q.replace(/[\\%_]/g, char => `\\${char}`);
      params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
    }

    const where = conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT e.id, e.delta, e.event_at, l.full_name, l.phone_normalized,
             p.reference_code, p.amount_vnd,
             u_credit.display_name AS credited_name,
             c.display_name AS ctv_name,
             u_ctv_mgr.display_name AS ctv_manager_name,
             e.created_at
      FROM demo_ne_events e
      JOIN demo_leads l ON l.id = e.lead_id
      JOIN demo_payments p ON p.id = e.payment_id
      JOIN demo_users u_credit ON u_credit.id = COALESCE(e.ctv_manager_user_id, e.sales_user_id)
      LEFT JOIN demo_ctv c ON c.id = e.ctv_id
      LEFT JOIN demo_users u_ctv_mgr ON u_ctv_mgr.id = e.ctv_manager_user_id
      WHERE ${where}
      ORDER BY e.event_at DESC, e.id DESC
    `).all(...params) as Array<{
      id: string; delta: number; event_at: string; full_name: string; phone_normalized: string | null;
      reference_code: string; amount_vnd: number; credited_name: string; ctv_name: string | null;
      ctv_manager_name: string | null; created_at: string;
    }>;

    csvContent += toCsvRow([
      'Mã sự kiện', 'Biến động NE', 'Loại biến động', 'Thời điểm ngân hàng',
      'Họ tên học viên', 'Số điện thoại', 'Mã đối soát ngân hàng', 'Số tiền (VND)',
      'Sales được tính KPI', 'Cộng tác viên', 'Quản lý CTV thời điểm NE', 'Thời điểm ghi nhận'
    ]);

    for (const r of rows) {
      csvContent += toCsvRow([
        r.id,
        r.delta > 0 ? '+1' : '-1',
        r.delta > 0 ? 'Ghi nhận NE mới' : 'Hoàn tiền - Trừ NE',
        new Date(r.event_at).toLocaleString('vi-VN'),
        r.full_name,
        r.phone_normalized ?? '',
        r.reference_code,
        r.amount_vnd,
        r.credited_name,
        r.ctv_name ?? '',
        r.ctv_manager_name ?? '',
        new Date(r.created_at).toLocaleString('vi-VN'),
      ]);
    }
  }

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
