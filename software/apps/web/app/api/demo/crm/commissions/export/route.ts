import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/demo-auth';
import { listCommissions, COMMISSION_STATUS_LABELS } from '@/lib/commissions';

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

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

  const data = listCommissions(user, {
    status,
    ctvId,
    managerId,
    q,
    page: 1,
    pageSize: 5000,
  });

  const headers = [
    'Mã hoa hồng',
    'Tên học viên',
    'Số điện thoại HV',
    'Ngành đào tạo',
    'Cộng tác viên (CTV)',
    'Số điện thoại CTV',
    'Sales quản lý CTV',
    'Chính sách áp dụng',
    'Số tiền hoa hồng (VNĐ)',
    'Trạng thái',
    'Ngày phát sinh',
    'Ngày duyệt chi',
    'Mã chứng từ chi',
    'Ngày thanh toán',
    'Ghi chú',
  ];

  const rows = data.rows.map(r => [
    csvEscape(r.id),
    csvEscape(r.lead_name),
    csvEscape(r.lead_phone ? `'${r.lead_phone}` : ''),
    csvEscape(r.program ?? ''),
    csvEscape(r.ctv_name),
    csvEscape(r.ctv_phone ? `'${r.ctv_phone}` : ''),
    csvEscape(r.manager_name),
    csvEscape(r.policy_name ?? 'Tiêu chuẩn'),
    csvEscape(r.amount_vnd),
    csvEscape(COMMISSION_STATUS_LABELS[r.status] ?? r.status),
    csvEscape(r.accrued_at ? new Date(r.accrued_at).toLocaleString('vi-VN') : ''),
    csvEscape(r.approved_at ? new Date(r.approved_at).toLocaleString('vi-VN') : ''),
    csvEscape(r.payment_reference ?? ''),
    csvEscape(r.paid_at ? new Date(r.paid_at).toLocaleString('vi-VN') : ''),
    csvEscape(r.note ?? ''),
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bang-ke-hoa-hong-ctv-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
