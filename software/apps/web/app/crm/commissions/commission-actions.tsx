'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CommissionItemActions({
  commissionId,
  status,
  leadName,
  ctvName,
  amountVnd,
  userRole,
}: {
  commissionId: string;
  status: string;
  leadName: string;
  ctvName: string;
  amountVnd: number;
  userRole: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManage = ['ADMIN', 'LEADER'].includes(userRole);
  if (!canManage) return null;

  async function handleApprove() {
    if (!confirm(`Xác nhận DUYỆT CHI khoản hoa hồng ${amountVnd.toLocaleString('vi-VN')} ₫ cho CTV ${ctvName} (Học viên: ${leadName})?`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/crm/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE', commissionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi duyệt');
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Thao tác thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!refCode.trim()) {
      setError('Vui lòng nhập mã chứng từ chuyển tiền / UNC ngân hàng');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/crm/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PAY',
          commissionId,
          paymentReference: refCode.trim(),
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi thanh toán');
      setShowPayModal(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Thao tác thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
      {status === 'ACCRUED' && (
        <button
          type="button"
          onClick={handleApprove}
          disabled={loading}
          className="auth-button"
          style={{ padding: '4px 8px', fontSize: '11px', background: '#2e7d32', width: 'auto' }}
        >
          {loading ? '...' : '✓ Duyệt chi'}
        </button>
      )}

      {status === 'APPROVED' && (
        <button
          type="button"
          onClick={() => setShowPayModal(true)}
          disabled={loading}
          className="auth-button"
          style={{ padding: '4px 8px', fontSize: '11px', background: '#1967d2', width: 'auto' }}
        >
          💰 Chi trả
        </button>
      )}

      {showPayModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '420px', width: '100%',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#162a52' }}>Xác nhận thanh toán hoa hồng</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#5f6368' }}>
              Số tiền: <strong style={{ color: '#2e7d32' }}>{amountVnd.toLocaleString('vi-VN')} ₫</strong> cho CTV <strong>{ctvName}</strong>
            </p>

            {error && (
              <div style={{ background: '#ffebee', color: '#c62828', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <form onSubmit={handlePay}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Mã chứng từ / UNC ngân hàng *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: UNC-2026-0929-01"
                  value={refCode}
                  onChange={e => setRefCode(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Ghi chú kế toán (tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Chuyển khoản qua VCB..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  disabled={loading}
                  className="outline-button"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-button"
                  style={{ padding: '6px 14px', fontSize: '12px', background: '#1967d2', width: 'auto' }}
                >
                  {loading ? 'Đang lưu...' : 'Xác nhận đã thanh toán'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function CreatePolicyButton({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [program, setProgram] = useState('');
  const [intake, setIntake] = useState('Khóa 2026');
  const [amount, setAmount] = useState('1500000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên chính sách');
      return;
    }
    const val = Number(amount);
    if (isNaN(val) || val < 0) {
      setError('Số tiền không hợp lệ');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/crm/commissions/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          program: program.trim() || undefined,
          intake_batch: intake.trim() || undefined,
          reward_amount_vnd: val,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tạo chính sách');
      setOpen(false);
      setName('');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Thao tác thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="outline-button"
        style={{ fontSize: '12px', fontWeight: 600, color: '#162a52' }}
      >
        ➕ Thêm chính sách hoa hồng
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '450px', width: '100%',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#162a52' }}>Tạo chính sách hoa hồng CTV mới</h3>
            {error && (
              <div style={{ background: '#ffebee', color: '#c62828', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Tên chính sách *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Thưởng tuyển sinh Công nghệ thông tin 2026"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Ngành đào tạo áp dụng (để trống nếu áp dụng tất cả)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Công nghệ thông tin"
                  value={program}
                  onChange={e => setProgram(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Đợt tuyển sinh
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Khóa 2026"
                  value={intake}
                  onChange={e => setIntake(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Mức thưởng hoa hồng mỗi NE (VNĐ) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="50000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="outline-button"
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-button"
                  style={{ padding: '6px 14px', fontSize: '12px', background: '#1967d2', width: 'auto' }}
                >
                  {loading ? 'Đang tạo...' : 'Lưu chính sách'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
