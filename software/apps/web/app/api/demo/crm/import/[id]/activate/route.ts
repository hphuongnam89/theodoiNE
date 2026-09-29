import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb } from '@/lib/crm';

export const runtime = 'nodejs';

type ImportRow = { id: string; full_name: string; program_raw: string | null; record_kind: string;
  assigned_sales_user_id: string | null; ctv_raw: string | null; ctv_key: string | null;
  status_key: string | null };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return Response.json({ error: 'Cần đăng nhập.' }, { status: 401 });
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const db = getCrmDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`SELECT id, full_name, program_raw, record_kind,
      assigned_sales_user_id, ctv_raw, ctv_key, status_key FROM demo_import_records WHERE id = ?`).get(id) as ImportRow | undefined;
    if (!row || !row.assigned_sales_user_id || (user.role === 'SALES' && row.assigned_sales_user_id !== user.id)) {
      db.exec('ROLLBACK'); return Response.json({ error: 'Không tìm thấy hồ sơ đã gán.' }, { status: 404 });
    }
    if (row.record_kind !== 'LEAD') {
      db.exec('ROLLBACK'); return Response.json({ error: 'NE lịch sử cần xác minh thanh toán trước khi chuyển.' }, { status: 409 });
    }
    if (row.status_key && ['ne', 'lost', 'nb', 'convert'].includes(row.status_key)) {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Trạng thái nguồn cần người quản trị đối chiếu trước khi đưa vào luồng chăm sóc.' }, { status: 409 });
    }
    const existing = db.prepare('SELECT id FROM demo_leads WHERE origin_import_record_id = ?').get(id) as { id: string } | undefined;
    if (existing) { db.exec('ROLLBACK'); return Response.json({ id: existing.id, alreadyActive: true }); }
    const owner = db.prepare("SELECT id FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(row.assigned_sales_user_id);
    if (!owner) { db.exec('ROLLBACK'); return Response.json({ error: 'Sales phụ trách chưa hoạt động.' }, { status: 409 }); }
    const phones = db.prepare('SELECT phone_normalized FROM demo_import_phones WHERE record_id = ? ORDER BY phone_normalized')
      .all(id) as Array<{ phone_normalized: string }>;
    if (!phones.length) { db.exec('ROLLBACK'); return Response.json({ error: 'Hồ sơ thiếu điện thoại chuẩn hóa; cần bổ sung liên hệ trước.' }, { status: 409 }); }
    const chosenPhone = body.phone;
    if (typeof chosenPhone !== 'string' || !phones.some(item => item.phone_normalized === chosenPhone)) {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Hãy chọn số điện thoại từ hồ sơ nguồn.' }, { status: 400 });
    }
    let ctvId: string | null = null;
    if (row.ctv_raw) {
      const matches = db.prepare(`SELECT id FROM demo_ctv
        WHERE name_key = ? AND owner_user_id = ? AND is_active = 1 LIMIT 2`)
        .all(row.ctv_key, row.assigned_sales_user_id) as Array<{ id: string }>;
      if (matches.length !== 1) {
        db.exec('ROLLBACK');
        return Response.json({ error: 'CTV trong Excel chưa khớp một CTV đã được Sales quản lý. Hãy đối chiếu CTV trước.' }, { status: 409 });
      }
      ctvId = matches[0].id;
    }
    const otherImport = db.prepare(`SELECT 1 FROM demo_import_phones
      WHERE phone_normalized = ? AND record_id <> ? LIMIT 1`).get(chosenPhone, id);
    const live = db.prepare('SELECT 1 FROM demo_leads WHERE phone_normalized = ? LIMIT 1').get(chosenPhone);
    if ((otherImport || live) && body.ackDuplicate !== true) {
      db.exec('ROLLBACK');
      return Response.json({ duplicate: true, error: 'Số điện thoại xuất hiện ở dòng khác. Hãy kiểm tra nhóm trùng trước khi kích hoạt riêng.' }, { status: 409 });
    }
    const leadId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO demo_leads
      (id, full_name, phone_normalized, program, source, stage, owner_user_id, ctv_id,
       origin_import_record_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'EXCEL', 'NEW', ?, ?, ?, ?, ?, ?)`)
      .run(leadId, row.full_name, chosenPhone, row.program_raw, row.assigned_sales_user_id,
        ctvId, id, user.id, now, now);
    db.prepare(`INSERT INTO demo_lead_stage_events
      (id, lead_id, old_stage, new_stage, actor_id, occurred_at) VALUES (?, ?, NULL, 'NEW', ?, ?)`)
      .run(randomUUID(), leadId, user.id, now);
    db.prepare(`INSERT INTO demo_lead_owner_assignments
      (id, lead_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
      .run(randomUUID(), leadId, row.assigned_sales_user_id, now, user.id);
    auditCrm(db, user.id, 'lead', leadId, 'ACTIVATE_IMPORT', null, { importRecordId: id, ownerId: row.assigned_sales_user_id });
    db.exec('COMMIT');
    return Response.json({ id: leadId }, { status: 201 });
  } catch {
    db.exec('ROLLBACK');
    return Response.json({ error: 'Không thể kích hoạt lead Excel.' }, { status: 500 });
  }
}
