import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { applicationScope } from './access';
import type { AuthedRequest, CurrentUser } from './auth';
import { Roles } from './roles';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUser(request: AuthedRequest): CurrentUser {
  if (!request.currentUser) throw new Error('Global auth guard was not applied');
  return request.currentUser;
}

@Controller('payments')
export class PaymentsController {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  @Get()
  async list(
    @Req() request: AuthedRequest,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<unknown> {
    const user = requireUser(request);
    const limit = rawLimit ? Math.max(1, Math.min(100, Number(rawLimit) || 50)) : 50;
    const isSales = user.role === 'SALES';

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (isSales) {
      values.push(user.id);
      const userIdx = `$${values.length}`;
      conditions.push(applicationScope(user, userIdx, 'a'));
    }

    if (status && ['PENDING', 'CONFIRMED', 'REJECTED'].includes(status)) {
      values.push(status);
      conditions.push(`p.status = $${values.length}`);
    }

    if (kind && ['TUITION_RECEIPT', 'TUITION_REFUND', 'APPLICATION_FEE', 'DEPOSIT'].includes(kind)) {
      values.push(kind);
      conditions.push(`p.kind = $${values.length}`);
    }

    values.push(limit);
    const limitIdx = `$${values.length}`;

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT p.id, p.application_id, p.kind, p.amount_vnd, p.bank_at, p.status,
              p.evidence_storage_key, p.created_at, p.confirmed_at,
              pp.full_name AS student_name,
              u_rec.display_name AS recorded_by_name,
              u_conf.display_name AS confirmed_by_name
       FROM payment_transactions p
       JOIN applications a ON a.id = p.application_id
       JOIN people pp ON pp.id = a.person_id
       JOIN app_users u_rec ON u_rec.id = p.recorded_by
       LEFT JOIN app_users u_conf ON u_conf.id = p.confirmed_by
       ${where}
       ORDER BY CASE p.status WHEN 'PENDING' THEN 0 ELSE 1 END, p.bank_at DESC
       LIMIT ${limitIdx}`,
      values,
    );

    return { items: result.rows, limit };
  }

  @Post(':id/review')
  @Roles('ADMIN', 'LEADER')
  async review(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    if (!UUID_RE.test(id)) throw new BadRequestException('Invalid payment ID');
    const user = requireUser(request);

    const decision = body?.decision;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (decision !== 'CONFIRMED' && decision !== 'REJECTED') {
      throw new BadRequestException('Decision must be CONFIRMED or REJECTED');
    }
    if (decision === 'REJECTED' && !reason) {
      throw new BadRequestException('Reason is required when rejecting payment');
    }

    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      const paymentRes = await client.query(
        'SELECT * FROM payment_transactions WHERE id = $1 FOR UPDATE',
        [id],
      );
      const payment = paymentRes.rows[0];
      if (!payment) throw new NotFoundException('Payment transaction not found');
      if (payment.status !== 'PENDING') {
        throw new ConflictException('Payment is not pending review');
      }

      const now = new Date().toISOString();
      if (decision === 'REJECTED') {
        await client.query(
          `UPDATE payment_transactions
           SET status = 'REJECTED', confirmed_by = $1, confirmed_at = $2
           WHERE id = $3`,
          [user.id, now, id],
        );
        await client.query('COMMIT');
        return { ok: true, status: 'REJECTED' };
      }

      // If CONFIRMED: validate refund limits if it's a refund
      if (payment.kind === 'TUITION_REFUND') {
        if (!payment.original_receipt_id) {
          throw new BadRequestException('Refund must reference an original receipt');
        }
        const originalRes = await client.query(
          `SELECT amount_vnd FROM payment_transactions WHERE id = $1 AND status = 'CONFIRMED'`,
          [payment.original_receipt_id],
        );
        const original = originalRes.rows[0];
        if (!original) throw new ConflictException('Original confirmed receipt not found');

        const priorRefundsRes = await client.query(
          `SELECT COALESCE(SUM(amount_vnd), 0) AS total_refunded
           FROM payment_transactions
           WHERE original_receipt_id = $1 AND status = 'CONFIRMED'`,
          [payment.original_receipt_id],
        );
        const priorRefunded = Number(priorRefundsRes.rows[0].total_refunded);
        if (priorRefunded + Number(payment.amount_vnd) > Number(original.amount_vnd)) {
          throw new ConflictException('Total refund exceeds original receipt amount');
        }
      }

      // Mark CONFIRMED
      await client.query(
        `UPDATE payment_transactions
         SET status = 'CONFIRMED', confirmed_by = $1, confirmed_at = $2
         WHERE id = $3`,
        [user.id, now, id],
      );

      // Re-project NE events for this application
      const confirmedRowsRes = await client.query(
        `SELECT * FROM payment_transactions
         WHERE application_id = $1 AND status = 'CONFIRMED' AND kind IN ('TUITION_RECEIPT', 'TUITION_REFUND')
         ORDER BY bank_at, CASE kind WHEN 'TUITION_RECEIPT' THEN 0 ELSE 1 END, created_at, id`,
        [payment.application_id],
      );

      const appRes = await client.query(
        'SELECT * FROM applications WHERE id = $1',
        [payment.application_id],
      );
      const app = appRes.rows[0];

      let balance = 0;
      let activeCredit: { salesId: string; ctvManagerId: string | null } | null = null;
      const eventsToCreate: Array<{
        paymentId: string; delta: number; kind: string; eventAt: string;
        salesId: string; ctvManagerId: string | null;
      }> = [];

      for (const row of confirmedRowsRes.rows) {
        const previous = balance;
        const amt = Number(row.amount_vnd);
        balance += row.kind === 'TUITION_RECEIPT' ? amt : -amt;
        if (balance < 0) {
          throw new ConflictException('Chronological balance becomes negative on refund date');
        }

        if (previous === 0 && balance > 0) {
          // Determine sales owner and CTV manager at bank_at
          const ownerRes = await client.query(
            `SELECT new_sales_id FROM application_owner_events
             WHERE application_id = $1 AND changed_at <= $2
             ORDER BY changed_at DESC LIMIT 1`,
            [app.id, row.bank_at],
          );
          const salesId = ownerRes.rows[0]?.new_sales_id ?? app.sales_owner_id;

          let ctvManagerId: string | null = null;
          if (app.referrer_ctv_id) {
            const ctvRes = await client.query(
              `SELECT sales_id FROM ctv_sales_assignments
               WHERE ctv_id = $1 AND effective_from <= $2 AND (effective_to IS NULL OR effective_to > $2)
               ORDER BY effective_from DESC LIMIT 1`,
              [app.referrer_ctv_id, row.bank_at],
            );
            ctvManagerId = ctvRes.rows[0]?.sales_id ?? null;
          }

          activeCredit = { salesId, ctvManagerId };
          eventsToCreate.push({
            paymentId: row.id,
            delta: 1,
            kind: 'RECOGNIZED',
            eventAt: row.bank_at,
            salesId,
            ctvManagerId,
          });
        }

        if (previous > 0 && balance === 0) {
          if (!activeCredit) throw new Error('Missing active credit for reversal');
          eventsToCreate.push({
            paymentId: row.id,
            delta: -1,
            kind: 'REVERSED',
            eventAt: row.bank_at,
            salesId: activeCredit.salesId,
            ctvManagerId: activeCredit.ctvManagerId,
          });
          activeCredit = null;
        }
      }

      // Rebuild ne_events for this application
      await client.query('DELETE FROM ne_events WHERE application_id = $1', [payment.application_id]);
      for (const ev of eventsToCreate) {
        await client.query(
          `INSERT INTO ne_events
            (id, application_id, payment_transaction_id, kind, delta, event_at,
             credited_sales_id, referrer_ctv_id, ctv_manager_at_ne_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            randomUUID(), payment.application_id, ev.paymentId, ev.kind, ev.delta, ev.eventAt,
            ev.salesId, app.referrer_ctv_id, ev.ctvManagerId, now,
          ],
        );
      }

      // Audit event
      await client.query(
        `INSERT INTO audit_events (id, actor_user_id, entity_type, entity_id, action, before_data, after_data, occurred_at)
         VALUES ($1, $2, 'payment', $3, 'CONFIRMED', $4, $5, $6)`,
        [
          randomUUID(), user.id, id,
          JSON.stringify({ status: 'PENDING' }),
          JSON.stringify({ status: 'CONFIRMED', eventsCount: eventsToCreate.length }),
          now,
        ],
      );

      await client.query('COMMIT');
      return { ok: true, status: 'CONFIRMED', eventsCreated: eventsToCreate.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
