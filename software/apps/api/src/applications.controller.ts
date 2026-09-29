import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query, Req } from '@nestjs/common';
import type { Pool } from 'pg';
import { applicationScope } from './access';
import type { AuthedRequest, CurrentUser } from './auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUser(request: AuthedRequest): CurrentUser {
  if (!request.currentUser) throw new Error('Global auth guard was not applied');
  return request.currentUser;
}

@Controller('applications')
export class ApplicationsController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get()
  async list(@Req() request: AuthedRequest, @Query('limit') rawLimit?: string): Promise<unknown> {
    const user = requireUser(request);
    const parsed = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException('limit must be an integer from 1 to 100');
    }
    const isSales = user.role === 'SALES';
    const scope = applicationScope(user, '$1');
    const values = isSales ? [user.id, parsed] : [parsed];
    const limitParam = isSales ? '$2' : '$1';
    const result = await this.db.query(
      `SELECT a.id, a.stage, a.created_at, a.updated_at,
              p.full_name, pr.name AS program_name, i.name AS intake_name
       FROM applications a
       JOIN people p ON p.id = a.person_id
       LEFT JOIN programs pr ON pr.id = a.program_id
       LEFT JOIN intakes i ON i.id = a.intake_id
       WHERE ${scope}
       ORDER BY a.created_at DESC, a.id
       LIMIT ${limitParam}`,
      values,
    );
    return { items: result.rows, limit: parsed };
  }

  @Get(':id')
  async getOne(@Req() request: AuthedRequest, @Param('id') id: string): Promise<unknown> {
    if (!UUID_RE.test(id)) throw new BadRequestException('Invalid application ID');
    const user = requireUser(request);
    const isSales = user.role === 'SALES';
    const scope = applicationScope(user, '$2');
    const result = await this.db.query(
      `SELECT a.id, a.stage, a.created_at, a.updated_at,
              p.full_name, p.date_of_birth, pr.name AS program_name,
              i.name AS intake_name, src.name AS source_name,
              phone.phone_normalized AS primary_phone
       FROM applications a
       JOIN people p ON p.id = a.person_id
       LEFT JOIN programs pr ON pr.id = a.program_id
       LEFT JOIN intakes i ON i.id = a.intake_id
       LEFT JOIN lead_sources src ON src.id = a.source_id
       LEFT JOIN LATERAL (
         SELECT pp.phone_normalized FROM person_phones pp
         WHERE pp.person_id = p.id ORDER BY pp.is_primary DESC, pp.created_at LIMIT 1
       ) phone ON true
       WHERE a.id = $1 AND ${scope}`,
      isSales ? [id, user.id] : [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Application not found');
    return result.rows[0];
  }
}
