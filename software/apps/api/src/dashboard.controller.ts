import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { Pool } from 'pg';
import { applicationScope } from './access';
import type { AuthedRequest } from './auth';

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get('summary')
  async summary(@Req() request: AuthedRequest): Promise<unknown> {
    const user = request.currentUser;
    if (!user) throw new Error('Global auth guard was not applied');
    const scope = applicationScope(user, '$1');
    const values = user.role === 'SALES' ? [user.id] : [];
    const applications = await this.db.query<{ total: string; open_leads: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE a.stage NOT IN ('NE', 'ENROLLED', 'LOST'))::text AS open_leads
       FROM applications a WHERE ${scope}`,
      values,
    );
    // Event snapshots preserve credit and visibility when a CTV changes owner.
    // Filtering via the current application owner would incorrectly move old KPI.
    const eventScope = user.role === 'SALES'
      ? '(e.credited_sales_id = $1 OR e.ctv_manager_at_ne_id = $1)'
      : 'TRUE';
    const ne = await this.db.query<{ net_ne: string }>(
      `SELECT COALESCE(SUM(e.delta), 0)::text AS net_ne
       FROM ne_events e
       WHERE ${eventScope}`,
      values,
    );
    return {
      scope: user.role === 'SALES' ? 'sales' : 'all',
      applicationsTotal: Number(applications.rows[0]?.total ?? 0),
      openLeads: Number(applications.rows[0]?.open_leads ?? 0),
      netNe: Number(ne.rows[0]?.net_ne ?? 0),
    };
  }
}
