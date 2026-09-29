import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import OperationsClient, { type OperationsData } from './operations-client';

export const dynamic = 'force-dynamic';

export default async function AdminOperationsPage() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  if (!['ADMIN', 'LEADER'].includes(user.role)) redirect('/');

  const db = getCrmDb();
  const dbPath = path.join(process.cwd(), 'data', 'demo.sqlite');

  let dbSize = 0;
  let dbModified = '';
  try {
    const stat = fs.statSync(dbPath);
    dbSize = stat.size;
    dbModified = stat.mtime.toISOString();
  } catch {}

  // Integrity check
  let integrityOk = false;
  let integrityDetails: string[] = [];
  try {
    const res = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    integrityDetails = res.map(r => r.integrity_check);
    integrityOk = res.length === 1 && res[0].integrity_check === 'ok';
  } catch (e: unknown) {
    integrityDetails = [e instanceof Error ? e.message : 'Lỗi kiểm tra toàn vẹn'];
  }

  // Foreign keys check
  let fkOk = true;
  let fkErrorsCount = 0;
  try {
    const res = db.prepare('PRAGMA foreign_key_check').all();
    fkErrorsCount = res.length;
    fkOk = res.length === 0;
  } catch {}

  // List existing backups
  const backupsDir = path.join(process.cwd(), 'data', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
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

  const initialData: OperationsData = {
    database: {
      path: dbPath,
      size: dbSize,
      modified: dbModified,
      integrityOk,
      integrityDetails,
      foreignKeysOk: fkOk,
      fkErrorsCount,
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
  };

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <p className="breadcrumb">Quản trị / Vận hành & Cutover</p>
          <h1>Trung tâm kiểm tra vận hành & Sao lưu dữ liệu</h1>
          <p>
            Đảm bảo an toàn cơ sở dữ liệu, tạo bản sao lưu trước go-live và theo dõi các chỉ số sẵn sàng chuyển giao.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link href="/">← Dashboard</Link>
        </div>
      </div>

      <OperationsClient initialData={initialData} userRole={user.role} />
    </main>
  );
}
