import { getDemoDb } from './demo-auth';

export type ImportStats = { total: number; unassigned: number; history: number; with_phone: number };

export function importStats(salesId?: string): ImportStats | null {
  try {
    const scope = salesId ? 'WHERE assigned_sales_user_id = ?' : '';
    const args = salesId ? [salesId] : [];
    const row = getDemoDb().prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN assigned_sales_user_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN record_kind = 'NE_HISTORY' THEN 1 ELSE 0 END) AS history,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM demo_import_phones p WHERE p.record_id = r.id) THEN 1 ELSE 0 END) AS with_phone
      FROM demo_import_records r ${scope}
    `).get(...args) as Record<string, number | null>;
    return { total: row.total ?? 0, unassigned: row.unassigned ?? 0,
      history: row.history ?? 0, with_phone: row.with_phone ?? 0 };
  } catch {
    return null;
  }
}
