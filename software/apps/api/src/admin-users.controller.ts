import {
  BadRequestException, Body, ConflictException, Controller, Get, Inject,
  NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AppRole, AuthedRequest } from './auth';
import { Roles } from './roles';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_FIELDS = `id, email, display_name, role, identity_subject, is_active, created_at`;

type UserRow = {
  id: string; email: string; display_name: string; role: AppRole;
  identity_subject: string | null; is_active: boolean; created_at: Date;
};
type UserInput = Partial<{
  email: string; displayName: string; role: AppRole;
  identitySubject: string; isActive: boolean;
}>;

function parseInput(body: unknown, creating: boolean): UserInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('JSON object required');
  }
  const input = body as Record<string, unknown>;
  const allowed = ['email', 'displayName', 'role', 'identitySubject', 'isActive'];
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !allowed.includes(key))) {
    throw new BadRequestException('Unknown or empty user fields');
  }
  if (creating && ['email', 'displayName', 'role', 'identitySubject'].some(key => !(key in input))) {
    throw new BadRequestException('email, displayName, role and identitySubject are required');
  }
  const result: UserInput = {};
  if ('email' in input) {
    if (typeof input.email !== 'string' || input.email.length > 254 || !EMAIL_RE.test(input.email.trim())) {
      throw new BadRequestException('Invalid email');
    }
    result.email = input.email.trim().toLowerCase();
  }
  if ('displayName' in input) {
    if (typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 120) {
      throw new BadRequestException('Invalid displayName');
    }
    result.displayName = input.displayName.trim();
  }
  if ('role' in input) {
    if (input.role !== 'ADMIN' && input.role !== 'LEADER' && input.role !== 'SALES') {
      throw new BadRequestException('Invalid role');
    }
    result.role = input.role;
  }
  if ('identitySubject' in input) {
    if (typeof input.identitySubject !== 'string' || !input.identitySubject.trim() || input.identitySubject.length > 255) {
      throw new BadRequestException('Invalid identitySubject');
    }
    result.identitySubject = input.identitySubject.trim();
  }
  if ('isActive' in input) {
    if (typeof input.isActive !== 'boolean') throw new BadRequestException('Invalid isActive');
    result.isActive = input.isActive;
  }
  return result;
}

function requireActor(request: AuthedRequest): string {
  if (!request.currentUser) throw new Error('Global auth guard was not applied');
  return request.currentUser.id;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function recordAudit(
  client: PoolClient, actorId: string, entityId: string,
  action: string, before: UserRow | null, after: UserRow,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
       (id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
     VALUES ($1, $2, 'app_user', $3, $4, $5::jsonb, $6::jsonb)`,
    [randomUUID(), actorId, entityId, action, JSON.stringify(before), JSON.stringify(after)],
  );
}

@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get()
  async list(@Query('limit') rawLimit?: string): Promise<unknown> {
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer from 1 to 200');
    }
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_FIELDS} FROM app_users ORDER BY created_at DESC, id LIMIT $1`, [limit],
    );
    return { items: result.rows, limit };
  }

  @Post()
  async create(@Req() request: AuthedRequest, @Body() body: unknown): Promise<UserRow> {
    const actorId = requireActor(request);
    const input = parseInput(body, true);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      const result = await client.query<UserRow>(
        `INSERT INTO app_users (id, email, display_name, role, identity_subject, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${USER_FIELDS}`,
        [id, input.email, input.displayName, input.role, input.identitySubject, input.isActive ?? true],
      );
      const user = result.rows[0];
      await recordAudit(client, actorId, id, 'CREATE', null, user);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException('Email or identity subject already exists');
      throw error;
    } finally {
      client.release();
    }
  }

  @Patch(':id')
  async update(
    @Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown,
  ): Promise<UserRow> {
    if (!UUID_RE.test(id)) throw new BadRequestException('Invalid user ID');
    const actorId = requireActor(request);
    const input = parseInput(body, false);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Serialize administrator role changes so two requests cannot remove the last admin.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('ne_crm_admin_users'))");
      const existing = await client.query<UserRow>(
        `SELECT ${USER_FIELDS} FROM app_users WHERE id = $1 FOR UPDATE`, [id],
      );
      const before = existing.rows[0];
      if (!before) throw new NotFoundException('User not found');
      if (id === actorId && (
        (input.role !== undefined && input.role !== 'ADMIN') ||
        input.isActive === false ||
        input.identitySubject !== undefined
      )) {
        throw new BadRequestException('Cannot remove your own administrator access');
      }
      if (before.role === 'ADMIN' && before.is_active &&
          (input.role !== undefined && input.role !== 'ADMIN' || input.isActive === false)) {
        const count = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM app_users WHERE role = 'ADMIN' AND is_active = true`,
        );
        if (Number(count.rows[0].count) <= 1) {
          throw new BadRequestException('At least one active administrator is required');
        }
      }
      const result = await client.query<UserRow>(
        `UPDATE app_users SET
           email = COALESCE($2, email),
           display_name = COALESCE($3, display_name),
           role = COALESCE($4, role),
           identity_subject = COALESCE($5, identity_subject),
           is_active = COALESCE($6, is_active)
         WHERE id = $1 RETURNING ${USER_FIELDS}`,
        [id, input.email ?? null, input.displayName ?? null, input.role ?? null,
          input.identitySubject ?? null, input.isActive ?? null],
      );
      const after = result.rows[0];
      await recordAudit(client, actorId, id, 'UPDATE', before, after);
      await client.query('COMMIT');
      return after;
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException('Email or identity subject already exists');
      throw error;
    } finally {
      client.release();
    }
  }
}
