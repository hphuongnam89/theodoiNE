import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb, auditCrm } from '@/lib/crm';
import { listCommissionPolicies } from '@/lib/commissions';

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const db = getCrmDb();
  const policies = listCommissionPolicies(db);
  return NextResponse.json({ policies });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, program, intake_batch, reward_amount_vnd } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });
    }

    const amount = Number(reward_amount_vnd);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });
    }

    const db = getCrmDb();
    const policyId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO demo_commission_policies
        (id, name, program, intake_batch, reward_amount_vnd, is_active, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      policyId,
      name.trim(),
      program?.trim() || null,
      intake_batch?.trim() || null,
      amount,
      now,
      user.id
    );

    auditCrm(db, user.id, 'commission_policy', policyId, 'CREATE_POLICY', null, {
      name: name.trim(),
      reward_amount_vnd: amount,
      program: program?.trim() || null,
    });

    return NextResponse.json({ ok: true, policyId });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'INTERNAL_ERROR' }, { status: 400 });
  }
}
