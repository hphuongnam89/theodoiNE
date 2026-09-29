import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/demo-auth';
import { getCrmDb } from '@/lib/crm';
import {
  listCommissions,
  approveCommission,
  payCommission,
} from '@/lib/commissions';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? undefined;
  const ctvId = searchParams.get('ctvId') ?? undefined;
  const managerId = searchParams.get('managerId') ?? undefined;
  const q = searchParams.get('q') ?? undefined;
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(searchParams.get('pageSize') ?? '20', 10);

  const data = listCommissions(user, {
    status,
    ctvId,
    managerId,
    q,
    page,
    pageSize,
  });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Chỉ Admin và Leader mới có quyền duyệt chi hoặc ghi nhận thanh toán hoa hồng
  if (!['ADMIN', 'LEADER'].includes(user.role)) {
    return NextResponse.json({ error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, commissionId, note, paymentReference } = body;

    if (!commissionId || typeof commissionId !== 'string') {
      return NextResponse.json({ error: 'COMMISSION_ID_REQUIRED' }, { status: 400 });
    }

    const db = getCrmDb();

    if (action === 'APPROVE') {
      approveCommission(db, commissionId, user.id, note);
      return NextResponse.json({ ok: true, action: 'APPROVED' });
    }

    if (action === 'PAY') {
      if (!paymentReference || typeof paymentReference !== 'string' || !paymentReference.trim()) {
        return NextResponse.json({ error: 'PAYMENT_REFERENCE_REQUIRED' }, { status: 400 });
      }
      payCommission(db, commissionId, user.id, paymentReference.trim(), note);
      return NextResponse.json({ ok: true, action: 'PAID' });
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'INTERNAL_ERROR' }, { status: 400 });
  }
}
