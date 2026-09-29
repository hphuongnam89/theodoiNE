import 'server-only';
import { getCrmDb } from './crm';

export function financeStats(salesId?: string) {
  const db = getCrmDb();
  const scope = salesId ? 'WHERE COALESCE(e.ctv_manager_user_id, e.sales_user_id) = ?' : '';
  const events = db.prepare(`SELECT COALESCE(SUM(e.delta),0) AS official_ne,
    COALESCE(SUM(CASE WHEN date(e.event_at, '+7 hours') = date('now', '+7 hours') THEN e.delta ELSE 0 END),0) AS today_ne
    FROM demo_ne_events e ${scope}`).get(...(salesId ? [salesId] : [])) as { official_ne: number; today_ne: number };
  const leadScope = salesId ? 'AND (l.owner_user_id = ? OR EXISTS (SELECT 1 FROM demo_ctv c WHERE c.id = l.ctv_id AND c.owner_user_id = ?))' : '';
  const leadParams = salesId ? [salesId, salesId] : [];
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM demo_payments p JOIN demo_leads l ON l.id = p.lead_id
    WHERE p.status = 'PENDING' ${leadScope}`)
    .get(...leadParams) as { n: number };
  const missingDocs = db.prepare(`SELECT COUNT(*) AS n FROM demo_leads l
    WHERE l.stage = 'WAITING_DOCUMENTS' ${leadScope}`)
    .get(...leadParams) as { n: number };
  const daily = db.prepare(`SELECT date(e.event_at, '+7 hours') AS day, SUM(e.delta) AS ne,
    SUM(CASE WHEN e.delta = 1 THEN 1 ELSE 0 END) AS gained,
    SUM(CASE WHEN e.delta = -1 THEN 1 ELSE 0 END) AS reversed
    FROM demo_ne_events e ${scope} GROUP BY day ORDER BY day DESC LIMIT 14`)
    .all(...(salesId ? [salesId] : [])) as Array<{ day: string; ne: number; gained: number; reversed: number }>;
  const monthly = db.prepare(`SELECT strftime('%Y-%m', e.event_at, '+7 hours') AS month,
    SUM(e.delta) AS ne, SUM(CASE WHEN e.delta = 1 THEN 1 ELSE 0 END) AS gained,
    SUM(CASE WHEN e.delta = -1 THEN 1 ELSE 0 END) AS reversed
    FROM demo_ne_events e ${scope} GROUP BY month ORDER BY month DESC LIMIT 12`)
    .all(...(salesId ? [salesId] : [])) as Array<{ month: string; ne: number; gained: number; reversed: number }>;
  const bySales = salesId ? [] : db.prepare(`SELECT u.display_name AS name, SUM(e.delta) AS ne,
    SUM(CASE WHEN e.delta = 1 THEN 1 ELSE 0 END) AS gained,
    SUM(CASE WHEN e.delta = -1 THEN 1 ELSE 0 END) AS reversed
    FROM demo_ne_events e JOIN demo_users u ON u.id = COALESCE(e.ctv_manager_user_id, e.sales_user_id)
    GROUP BY u.id ORDER BY ne DESC, name LIMIT 30`).all() as Array<{
      name: string; ne: number; gained: number; reversed: number }>;
  return { officialNe: events.official_ne, todayNe: events.today_ne, pendingPayments: pending.n,
    missingDocs: missingDocs.n, daily, monthly, bySales };
}
