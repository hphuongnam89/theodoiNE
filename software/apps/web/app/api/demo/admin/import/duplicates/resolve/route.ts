import { randomUUID } from 'node:crypto';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb } from '@/lib/crm';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE' || !['ADMIN', 'LEADER'].includes(user.role)) {
    return Response.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  let body: {
    action: 'activate' | 'skip' | 'skip_group' | 'assign_sales';
    recordId?: string;
    phone?: string;
    salesUserId?: string;
    skipOtherInGroup?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const db = getCrmDb();
  const now = new Date().toISOString();

  if (body.action === 'assign_sales') {
    if (!body.recordId || !body.salesUserId) {
      return Response.json({ error: 'Thiếu thông tin phân công.' }, { status: 400 });
    }
    const sales = db.prepare("SELECT id, display_name FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(body.salesUserId);
    if (!sales) return Response.json({ error: 'Tài khoản Sales không hợp lệ.' }, { status: 400 });

    db.prepare(`UPDATE demo_import_records SET assigned_sales_user_id = ?, assignment_source = 'ADMIN_DUP_QUEUE' WHERE id = ?`)
      .run(body.salesUserId, body.recordId);
    auditCrm(db, user.id, 'import_record', body.recordId, 'ASSIGN_SALES_FROM_DUP_QUEUE', null, { salesUserId: body.salesUserId });
    return Response.json({ success: true, message: 'Đã gán Sales phụ trách.' });
  }

  if (body.action === 'skip') {
    if (!body.recordId) return Response.json({ error: 'Thiếu mã bản ghi.' }, { status: 400 });
    const rec = db.prepare('SELECT id, flags FROM demo_import_records WHERE id = ?').get(body.recordId) as { id: string; flags: string } | undefined;
    if (!rec) return Response.json({ error: 'Không tìm thấy bản ghi.' }, { status: 404 });

    const newFlags = rec.flags.includes('SKIPPED_DUPLICATE') ? rec.flags : (rec.flags ? `${rec.flags}|SKIPPED_DUPLICATE` : 'SKIPPED_DUPLICATE');
    db.prepare('UPDATE demo_import_records SET flags = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
      .run(newFlags, now, user.id, body.recordId);
    auditCrm(db, user.id, 'import_record', body.recordId, 'SKIP_DUPLICATE', null, { flags: newFlags });
    return Response.json({ success: true, message: 'Đã đánh dấu bỏ qua bản ghi trùng.' });
  }

  if (body.action === 'skip_group') {
    if (!body.phone) return Response.json({ error: 'Thiếu số điện thoại nhóm.' }, { status: 400 });
    const records = db.prepare(`
      SELECT r.id, r.flags FROM demo_import_records r
      JOIN demo_import_phones p ON p.record_id = r.id
      WHERE p.phone_normalized = ? AND NOT EXISTS (SELECT 1 FROM demo_leads l WHERE l.origin_import_record_id = r.id)
    `).all(body.phone) as Array<{ id: string; flags: string }>;

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const rec of records) {
        const newFlags = rec.flags.includes('SKIPPED_DUPLICATE') ? rec.flags : (rec.flags ? `${rec.flags}|SKIPPED_DUPLICATE` : 'SKIPPED_DUPLICATE');
        db.prepare('UPDATE demo_import_records SET flags = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
          .run(newFlags, now, user.id, rec.id);
      }
      auditCrm(db, user.id, 'import_phone_group', body.phone, 'SKIP_GROUP_DUPLICATES', null, { count: records.length });
      db.exec('COMMIT');
      return Response.json({ success: true, message: `Đã bỏ qua ${records.length} bản ghi trong nhóm.` });
    } catch {
      db.exec('ROLLBACK');
      return Response.json({ error: 'Lỗi khi bỏ qua nhóm.' }, { status: 500 });
    }
  }

  if (body.action === 'activate') {
    if (!body.recordId) return Response.json({ error: 'Thiếu mã bản ghi.' }, { status: 400 });
    const rec = db.prepare(`
      SELECT id, full_name, program_raw, record_kind, assigned_sales_user_id, ctv_raw, ctv_key, status_raw, source_sheet, source_row
      FROM demo_import_records WHERE id = ?
    `).get(body.recordId) as Record<string, string | null> | undefined;

    if (!rec) return Response.json({ error: 'Không tìm thấy bản ghi import.' }, { status: 404 });

    const targetSalesId = body.salesUserId || rec.assigned_sales_user_id;
    if (!targetSalesId) {
      return Response.json({ error: 'Cần chỉ định Sales phụ trách trước khi kích hoạt.' }, { status: 400 });
    }

    const salesUser = db.prepare("SELECT id, display_name FROM demo_users WHERE id = ? AND role = 'SALES' AND status = 'ACTIVE'").get(targetSalesId);
    if (!salesUser) return Response.json({ error: 'Sales phụ trách chưa hợp lệ hoặc đã bị khóa.' }, { status: 400 });

    const phoneRows = db.prepare('SELECT phone_normalized FROM demo_import_phones WHERE record_id = ?').all(body.recordId) as Array<{ phone_normalized: string }>;
    const chosenPhone = body.phone || phoneRows[0]?.phone_normalized;
    if (!chosenPhone) return Response.json({ error: 'Bản ghi thiếu số điện thoại chuẩn hóa.' }, { status: 400 });

    db.exec('BEGIN IMMEDIATE');
    try {
      // Check if already active
      const existing = db.prepare('SELECT id FROM demo_leads WHERE origin_import_record_id = ?').get(body.recordId) as { id: string } | undefined;
      if (existing) {
        db.exec('ROLLBACK');
        return Response.json({ success: true, leadId: existing.id, message: 'Hồ sơ đã được kích hoạt trước đó.' });
      }

      // Check CTV match if available
      let ctvId: string | null = null;
      if (rec.ctv_raw && rec.ctv_key) {
        const ctvMatch = db.prepare('SELECT id FROM demo_ctv WHERE name_key = ? AND owner_user_id = ? AND is_active = 1 LIMIT 1')
          .get(rec.ctv_key, targetSalesId) as { id: string } | undefined;
        if (ctvMatch) ctvId = ctvMatch.id;
      }

      const leadId = randomUUID();
      db.prepare(`
        INSERT INTO demo_leads
        (id, full_name, phone_normalized, contact_text, program, source, stage,
         owner_user_id, ctv_id, origin_import_record_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'EXCEL_IMPORT', 'NEW', ?, ?, ?, ?, ?, ?)
      `).run(leadId, rec.full_name, chosenPhone, `Import từ ${rec.source_sheet ?? 'Excel'} (Dòng ${rec.source_row ?? ''})`, rec.program_raw,
             targetSalesId, ctvId, body.recordId, user.id, now, now);

      db.prepare(`INSERT INTO demo_lead_stage_events (id, lead_id, old_stage, new_stage, actor_id, occurred_at) VALUES (?, ?, NULL, 'NEW', ?, ?)`)
        .run(randomUUID(), leadId, user.id, now);

      db.prepare(`INSERT INTO demo_lead_owner_assignments (id, lead_id, sales_user_id, effective_from, changed_by) VALUES (?, ?, ?, ?, ?)`)
        .run(randomUUID(), leadId, targetSalesId, now, user.id);

      db.prepare('UPDATE demo_import_records SET assigned_sales_user_id = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
        .run(targetSalesId, now, user.id, body.recordId);

      // If requested, mark other records in the same phone group as skipped
      if (body.skipOtherInGroup && chosenPhone) {
        const others = db.prepare(`
          SELECT r.id, r.flags FROM demo_import_records r
          JOIN demo_import_phones p ON p.record_id = r.id
          WHERE p.phone_normalized = ? AND r.id <> ?
        `).all(chosenPhone, body.recordId) as Array<{ id: string; flags: string }>;

        for (const o of others) {
          const newFlags = o.flags.includes('SKIPPED_DUPLICATE') ? o.flags : (o.flags ? `${o.flags}|SKIPPED_DUPLICATE` : 'SKIPPED_DUPLICATE');
          db.prepare('UPDATE demo_import_records SET flags = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
            .run(newFlags, now, user.id, o.id);
        }
      }

      auditCrm(db, user.id, 'lead', leadId, 'ACTIVATE_FROM_DUP_QUEUE', null, {
        importRecordId: body.recordId,
        ownerId: targetSalesId,
        skippedOthers: body.skipOtherInGroup
      });

      db.exec('COMMIT');
      return Response.json({ success: true, leadId, message: 'Kích hoạt hồ sơ thành công vào CRM (Trạng thái: Mới tiếp nhận).' }, { status: 201 });
    } catch (e: unknown) {
      db.exec('ROLLBACK');
      const errMessage = e instanceof Error ? e.message : 'Lỗi server.';
      return Response.json({ error: 'Không thể kích hoạt hồ sơ: ' + errMessage }, { status: 500 });
    }
  }

  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
