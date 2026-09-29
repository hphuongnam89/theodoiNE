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
    fromSalesId: string;
    toSalesId: string;
    transferCtvs?: boolean;
    transferLeads?: boolean;
    transferOpenFollowups?: boolean;
    transferImportRecords?: boolean;
    deactivateOldSales?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const { fromSalesId, toSalesId } = body;
  if (!fromSalesId || !toSalesId) {
    return Response.json({ error: 'Cần chọn Sales chuyển đi và Sales tiếp nhận.' }, { status: 400 });
  }
  if (fromSalesId === toSalesId) {
    return Response.json({ error: 'Sales chuyển đi và Sales tiếp nhận không thể là cùng một người.' }, { status: 400 });
  }

  const db = getCrmDb();

  const fromUser = db.prepare('SELECT id, display_name, email, role, status FROM demo_users WHERE id = ?').get(fromSalesId) as
    { id: string; display_name: string; email: string; role: string; status: string } | undefined;
  if (!fromUser) return Response.json({ error: 'Không tìm thấy tài khoản Sales chuyển đi.' }, { status: 404 });

  const toUser = db.prepare('SELECT id, display_name, email, role, status FROM demo_users WHERE id = ? AND status = \'ACTIVE\'').get(toSalesId) as
    { id: string; display_name: string; email: string; role: string; status: string } | undefined;
  if (!toUser) return Response.json({ error: 'Sales tiếp nhận không tồn tại hoặc đã bị khóa.' }, { status: 400 });

  const shouldTransferCtvs = body.transferCtvs !== false;
  const shouldTransferLeads = body.transferLeads !== false;
  const shouldTransferFollowups = body.transferOpenFollowups !== false;
  const shouldTransferImports = body.transferImportRecords !== false;
  const shouldDeactivate = body.deactivateOldSales === true;

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    let ctvsTransferred = 0;
    let leadsTransferred = 0;
    let followupsTransferred = 0;
    let importsTransferred = 0;

    // 1. Transfer CTVs first so subsequent lead checks match the new CTV owner
    if (shouldTransferCtvs) {
      const ctvs = db.prepare('SELECT id FROM demo_ctv WHERE owner_user_id = ? AND is_active = 1').all(fromSalesId) as Array<{ id: string }>;
      for (const c of ctvs) {
        db.prepare('UPDATE demo_ctv_assignments SET effective_to = ? WHERE ctv_id = ? AND effective_to IS NULL').run(now, c.id);
        db.prepare('UPDATE demo_ctv SET owner_user_id = ? WHERE id = ?').run(toSalesId, c.id);
        db.prepare(`
          INSERT INTO demo_ctv_assignments
          (id, ctv_id, sales_user_id, effective_from, changed_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), c.id, toSalesId, now, user.id);
        ctvsTransferred++;
      }
    }

    // 2. Transfer Leads
    if (shouldTransferLeads) {
      const leads = db.prepare('SELECT id, ctv_id FROM demo_leads WHERE owner_user_id = ?').all(fromSalesId) as Array<{ id: string; ctv_id: string | null }>;
      for (const l of leads) {
        db.prepare('UPDATE demo_lead_owner_assignments SET effective_to = ? WHERE lead_id = ? AND effective_to IS NULL').run(now, l.id);
        db.prepare('UPDATE demo_leads SET owner_user_id = ?, updated_at = ? WHERE id = ?').run(toSalesId, now, l.id);
        db.prepare(`
          INSERT INTO demo_lead_owner_assignments
          (id, lead_id, sales_user_id, effective_from, changed_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), l.id, toSalesId, now, user.id);
        leadsTransferred++;
      }
    }

    // 3. Transfer Open Follow-ups
    if (shouldTransferFollowups) {
      const res = db.prepare(`
        UPDATE demo_followups
        SET assignee_id = ?
        WHERE (assignee_id = ? OR lead_id IN (SELECT id FROM demo_leads WHERE owner_user_id = ?))
          AND status = 'OPEN'
      `).run(toSalesId, fromSalesId, toSalesId);
      followupsTransferred = Number(res.changes);
    }

    // 4. Transfer Import Records
    if (shouldTransferImports) {
      const res = db.prepare(`
        UPDATE demo_import_records
        SET assigned_sales_user_id = ?, assignment_source = 'HANDOFF_TRANSFER'
        WHERE assigned_sales_user_id = ?
      `).run(toSalesId, fromSalesId);
      importsTransferred = Number(res.changes);
    }

    // 5. Deactivate old Sales if requested
    if (shouldDeactivate) {
      db.prepare('UPDATE demo_users SET status = \'REJECTED\' WHERE id = ?').run(fromSalesId);
      db.prepare('DELETE FROM demo_sessions WHERE user_id = ?').run(fromSalesId);
    }

    // 6. Record audit log
    auditCrm(db, user.id, 'personnel_transfer', fromSalesId, 'PERSONNEL_HANDOFF', null, {
      fromSales: { id: fromSalesId, name: fromUser.display_name },
      toSales: { id: toSalesId, name: toUser.display_name },
      ctvsTransferred,
      leadsTransferred,
      followupsTransferred,
      importsTransferred,
      deactivatedOldSales: shouldDeactivate,
    });

    db.exec('COMMIT');

    return Response.json({
      success: true,
      message: `Bàn giao thành công: ${leadsTransferred} lead, ${ctvsTransferred} CTV, ${followupsTransferred} lịch hẹn, ${importsTransferred} dòng Excel sang ${toUser.display_name}.`,
      summary: {
        ctvsTransferred,
        leadsTransferred,
        followupsTransferred,
        importsTransferred,
        deactivatedOldSales: shouldDeactivate,
      },
    });
  } catch (e: unknown) {
    db.exec('ROLLBACK');
    const errMessage = e instanceof Error ? e.message : 'Lỗi hệ thống khi bàn giao.';
    return Response.json({ error: 'Không thể bàn giao nhân sự: ' + errMessage }, { status: 500 });
  }
}
