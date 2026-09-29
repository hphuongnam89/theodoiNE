import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AuthedRequest, CurrentUser } from './auth';

function requireUser(request: AuthedRequest): CurrentUser {
  if (!request.currentUser) throw new Error('Global auth guard was not applied');
  return request.currentUser;
}

@Controller('ne-events')
export class NeEventsController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get()
  async list(
    @Req() request: AuthedRequest,
    @Query('delta') rawDelta?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<unknown> {
    const user = requireUser(request);
    const limit = rawLimit ? Math.max(1, Math.min(200, Number(rawLimit) || 50)) : 50;

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (user.role === 'SALES') {
      values.push(user.id);
      conditions.push(`(e.credited_sales_id = $${values.length} OR e.ctv_manager_at_ne_id = $${values.length})`);
    }

    if (rawDelta === '1' || rawDelta === '-1') {
      values.push(Number(rawDelta));
      conditions.push(`e.delta = $${values.length}`);
    }

    values.push(limit);
    const limitIdx = `$${values.length}`;
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.db.query(
      `SELECT e.id, e.delta, e.kind, e.event_at, e.application_id,
              p.full_name AS student_name,
              pt.amount_vnd,
              u_credit.display_name AS credited_sales_name,
              c.display_name AS ctv_name,
              u_ctv_mgr.display_name AS ctv_manager_name
       FROM ne_events e
       JOIN applications a ON a.id = e.application_id
       JOIN people p ON p.id = a.person_id
       JOIN payment_transactions pt ON pt.id = e.payment_transaction_id
       JOIN app_users u_credit ON u_credit.id = e.credited_sales_id
       LEFT JOIN ctv c ON c.id = e.referrer_ctv_id
       LEFT JOIN app_users u_ctv_mgr ON u_ctv_mgr.id = e.ctv_manager_at_ne_id
       ${where}
       ORDER BY e.event_at DESC, e.created_at DESC
       LIMIT ${limitIdx}`,
      values,
    );

    return { items: result.rows, limit };
  }
}
