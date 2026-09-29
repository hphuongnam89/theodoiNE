import fs from 'node:fs';
import path from 'node:path';
import { getSessionUser, sameOrigin } from '@/lib/demo-auth';
import { auditCrm, getCrmDb } from '@/lib/crm';

export const runtime = 'nodejs';

function getBackupsDir(): string {
  const dir = path.join(process.cwd(), 'data', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE' || !['ADMIN', 'LEADER'].includes(user.role)) {
    return Response.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  const db = getCrmDb();
  const dbPath = path.join(process.cwd(), 'data', 'demo.sqlite');

  let dbSize = 0;
  let dbModified = '';
  try {
    const stat = fs.statSync(dbPath);
    dbSize = stat.size;
    dbModified = stat.mtime.toISOString();
  } catch {}

  // Run integrity check
  let integrityOk = false;
  let integrityDetails: string[] = [];
  try {
    const res = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    integrityDetails = res.map(r => r.integrity_check);
    integrityOk = res.length === 1 && res[0].integrity_check === 'ok';
  } catch (e: unknown) {
    integrityDetails = [e instanceof Error ? e.message : 'Lỗi kiểm tra toàn vẹn'];
  }

  // Run foreign key check
  let fkOk = true;
  let fkErrors: unknown[] = [];
  try {
    const res = db.prepare('PRAGMA foreign_key_check').all();
    fkErrors = res;
    fkOk = res.length === 0;
  } catch {}

  // List existing backups
  const backupsDir = getBackupsDir();
  const backupFiles: Array<{ filename: string; size: number; createdAt: string }> = [];
  try {
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sqlite'));
    for (const f of files) {
      const fPath = path.join(backupsDir, f);
      const stat = fs.statSync(fPath);
      backupFiles.push({
        filename: f,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    }
    backupFiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {}

  // Cutover readiness metrics
  const activeUsers = {
    admin: (db.prepare("SELECT COUNT(*) as n FROM demo_users WHERE role = 'ADMIN' AND status = 'ACTIVE'").get() as { n: number }).n,
    leader: (db.prepare("SELECT COUNT(*) as n FROM demo_users WHERE role = 'LEADER' AND status = 'ACTIVE'").get() as { n: number }).n,
    sales: (db.prepare("SELECT COUNT(*) as n FROM demo_users WHERE role = 'SALES' AND status = 'ACTIVE'").get() as { n: number }).n,
    pending: (db.prepare("SELECT COUNT(*) as n FROM demo_users WHERE status = 'PENDING'").get() as { n: number }).n,
  };

  const importStats = {
    total: (db.prepare('SELECT COUNT(*) as n FROM demo_import_records').get() as { n: number }).n,
    unassigned: (db.prepare('SELECT COUNT(*) as n FROM demo_import_records WHERE assigned_sales_user_id IS NULL').get() as { n: number }).n,
    duplicateGroups: (db.prepare(`
      SELECT COUNT(*) as n FROM (
        SELECT p.phone_normalized FROM demo_import_phones p
        JOIN demo_import_records r ON r.id = p.record_id
        WHERE r.flags NOT LIKE '%SKIPPED_DUPLICATE%'
        GROUP BY p.phone_normalized HAVING COUNT(DISTINCT r.id) > 1
      )
    `).get() as { n: number }).n,
  };

  const crmStats = {
    leads: (db.prepare('SELECT COUNT(*) as n FROM demo_leads').get() as { n: number }).n,
    officialNe: (db.prepare('SELECT COALESCE(SUM(delta), 0) as n FROM demo_ne_events').get() as { n: number }).n,
  };

  const pendingPayments = (db.prepare("SELECT COUNT(*) as n FROM demo_payments WHERE status = 'PENDING'").get() as { n: number }).n;
  const overdueFollowups = (db.prepare("SELECT COUNT(*) as n FROM demo_followups WHERE status = 'OPEN' AND due_at < datetime('now')").get() as { n: number }).n;

  return Response.json({
    database: {
      path: dbPath,
      size: dbSize,
      modified: dbModified,
      integrityOk,
      integrityDetails,
      foreignKeysOk: fkOk,
      fkErrorsCount: fkErrors.length,
    },
    backups: backupFiles,
    readiness: {
      integrityOk,
      activeUsers,
      importStats,
      crmStats,
      pendingPayments,
      overdueFollowups,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE' || !['ADMIN', 'LEADER'].includes(user.role)) {
    return Response.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
  }

  let body: { action: 'backup' | 'restore'; filename?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const db = getCrmDb();
  const dbPath = path.join(process.cwd(), 'data', 'demo.sqlite');
  const backupsDir = getBackupsDir();
  const now = new Date();
  const timestampStr = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

  if (body.action === 'backup') {
    try {
      // Flush WAL changes
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

      const backupFilename = `demo-backup-${timestampStr}.sqlite`;
      const backupPath = path.join(backupsDir, backupFilename);
      fs.copyFileSync(dbPath, backupPath);

      const stat = fs.statSync(backupPath);
      auditCrm(db, user.id, 'database_backup', backupFilename, 'CREATE_BACKUP', null, { size: stat.size });

      return Response.json({
        success: true,
        message: `Đã sao lưu thành công: ${backupFilename} (${Math.round(stat.size / 1024)} KB).`,
        backup: {
          filename: backupFilename,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        },
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Lỗi sao lưu.';
      return Response.json({ error: 'Không thể tạo bản sao lưu: ' + err }, { status: 500 });
    }
  }

  if (body.action === 'restore') {
    if (user.role !== 'ADMIN') {
      return Response.json({ error: 'Chỉ Quản trị viên tối cao (Admin) mới có quyền khôi phục CSDL.' }, { status: 403 });
    }
    const filename = body.filename;
    if (!filename || typeof filename !== 'string' || !filename.endsWith('.sqlite')) {
      return Response.json({ error: 'Tên file sao lưu không hợp lệ.' }, { status: 400 });
    }
    // Prevent directory traversal
    const safeBase = path.basename(filename);
    const sourceBackup = path.join(backupsDir, safeBase);
    if (!fs.existsSync(sourceBackup)) {
      return Response.json({ error: 'Không tìm thấy file sao lưu được chọn.' }, { status: 404 });
    }

    try {
      // Flush WAL and create pre-restore safety snapshot
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const safetySnapshot = path.join(backupsDir, `demo-pre-restore-${timestampStr}.sqlite`);
      fs.copyFileSync(dbPath, safetySnapshot);

      // Restore
      fs.copyFileSync(sourceBackup, dbPath);
      // Delete any leftover WAL/SHM from previous state
      try { fs.unlinkSync(dbPath + '-wal'); } catch {}
      try { fs.unlinkSync(dbPath + '-shm'); } catch {}

      // Re-enable WAL mode
      db.exec('PRAGMA journal_mode = WAL');

      auditCrm(db, user.id, 'database_restore', safeBase, 'RESTORE_BACKUP', { preRestoreSnapshot: path.basename(safetySnapshot) }, { restoredFrom: safeBase });

      return Response.json({
        success: true,
        message: `Đã khôi phục cơ sở dữ liệu từ ${safeBase}. Bản sao lưu an toàn trước khôi phục: ${path.basename(safetySnapshot)}.`,
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Lỗi khôi phục.';
      return Response.json({ error: 'Không thể khôi phục CSDL: ' + err }, { status: 500 });
    }
  }

  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
