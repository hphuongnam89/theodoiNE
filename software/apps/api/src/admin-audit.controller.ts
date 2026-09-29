import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import type { Pool } from 'pg';
import { Roles } from './roles';

@Roles('ADMIN')
@Controller('admin/audit')
export class AdminAuditController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get()
  async list(@Query('limit') rawLimit?: string): Promise<unknown> {
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer from 1 to 200');
    }
    const result = await this.db.query(
      `SELECT id, actor_user_id, entity_type, entity_id, action,
              before_data, after_data, occurred_at
       FROM audit_events ORDER BY occurred_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    return { items: result.rows, limit };
  }
}
