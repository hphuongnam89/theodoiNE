import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthedRequest, CurrentUser } from './auth';
import { Roles } from './roles';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUser(request: AuthedRequest): CurrentUser {
  if (!request.currentUser) throw new Error('Global auth guard was not applied');
  return request.currentUser;
}

@Controller('ctv')
export class CtvController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get()
  async list(@Req() request: AuthedRequest): Promise<unknown> {
    const user = requireUser(request);
    const isSales = user.role === 'SALES';
    const where = isSales ? 'WHERE c.current_owner_sales_id = $1 AND c.is_active = true' : 'WHERE c.is_active = true';
    const values = isSales ? [user.id] : [];

    const result = await this.db.query(
      `SELECT c.id, c.display_name, c.phone_normalized, c.category,
              c.current_owner_sales_id, u.display_name AS owner_sales_name,
              c.created_at
       FROM ctv c
       JOIN app_users u ON u.id = c.current_owner_sales_id
       ${where}
       ORDER BY c.display_name`,
      values,
    );
    return { items: result.rows };
  }

  @Post()
  async create(@Req() request: AuthedRequest, @Body() body: Record<string, unknown>): Promise<unknown> {
    const user = requireUser(request);
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : null;
    const ownerId = typeof body?.ownerSalesId === 'string' && user.role !== 'SALES' ? body.ownerSalesId : user.id;

    if (!displayName || displayName.length > 150) {
      throw new BadRequestException('Display name is required and must not exceed 150 characters');
    }

    const ctvId = randomUUID();
    const now = new Date().toISOString();

    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO ctv (id, display_name, phone_normalized, category, current_owner_sales_id, is_active, created_at)
         VALUES ($1, $2, $3, 'CTV', $4, true, $5)`,
        [ctvId, displayName, phone, ownerId, now],
      );
      await client.query(
        `INSERT INTO ctv_sales_assignments (id, ctv_id, sales_id, effective_from, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), ctvId, ownerId, now, user.id, now],
      );
      await client.query('COMMIT');
      return { id: ctvId, ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  @Patch(':id/transfer')
  @Roles('ADMIN', 'LEADER')
  async transfer(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    if (!UUID_RE.test(id)) throw new BadRequestException('Invalid CTV ID');
    const user = requireUser(request);
    const nextOwnerId = typeof body?.ownerSalesId === 'string' ? body.ownerSalesId : '';
    if (!UUID_RE.test(nextOwnerId)) throw new BadRequestException('Valid ownerSalesId is required');

    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');
      const ctvRes = await client.query('SELECT * FROM ctv WHERE id = $1 FOR UPDATE', [id]);
      const ctv = ctvRes.rows[0];
      if (!ctv) throw new NotFoundException('CTV not found');

      if (ctv.current_owner_sales_id === nextOwnerId) {
        await client.query('COMMIT');
        return { ok: true, unchanged: true };
      }

      const now = new Date().toISOString();
      await client.query(
        `UPDATE ctv_sales_assignments
         SET effective_to = $1
         WHERE ctv_id = $2 AND effective_to IS NULL`,
        [now, id],
      );
      await client.query(
        `UPDATE ctv SET current_owner_sales_id = $1 WHERE id = $2`,
        [nextOwnerId, id],
      );
      await client.query(
        `INSERT INTO ctv_sales_assignments (id, ctv_id, sales_id, effective_from, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), id, nextOwnerId, now, user.id, now],
      );

      await client.query(
        `INSERT INTO audit_events (id, actor_user_id, entity_type, entity_id, action, before_data, after_data, occurred_at)
         VALUES ($1, $2, 'ctv', $3, 'TRANSFER', $4, $5, $6)`,
        [
          randomUUID(), user.id, id,
          JSON.stringify({ ownerId: ctv.current_owner_sales_id }),
          JSON.stringify({ ownerId: nextOwnerId }),
          now,
        ],
      );

      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
