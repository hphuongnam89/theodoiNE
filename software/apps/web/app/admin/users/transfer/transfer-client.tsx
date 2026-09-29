'use client';

import { useState } from 'react';
import Link from 'next/link';

export type SalesWorkload = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  leadCount: number;
  ctvCount: number;
  followupCount: number;
  importCount: number;
};

export default function TransferClient({
  salesList,
}: {
  salesList: SalesWorkload[];
}) {
  const [fromSalesId, setFromSalesId] = useState<string>(salesList[0]?.id || '');
  const [toSalesId, setToSalesId] = useState<string>(salesList[1]?.id || '');
  const [transferCtvs, setTransferCtvs] = useState(true);
  const [transferLeads, setTransferLeads] = useState(true);
  const [transferFollowups, setTransferFollowups] = useState(true);
  const [transferImports, setTransferImports] = useState(true);
  const [deactivateOldSales, setDeactivateOldSales] = useState(false);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fromSales = salesList.find(s => s.id === fromSalesId);
  const toSales = salesList.find(s => s.id === toSalesId);

  const handleTransfer = async () => {
    if (!fromSalesId || !toSalesId) {
      setResult({ message: 'Vui lòng chọn đầy đủ Sales chuyển đi và Sales tiếp nhận.', type: 'error' });
      return;
    }
    if (fromSalesId === toSalesId) {
      setResult({ message: 'Sales chuyển đi và Sales tiếp nhận không thể trùng nhau.', type: 'error' });
      return;
    }

    const confirmMsg = `XÁC NHẬN BÀN GIAO NHÂN SỰ:\n\n` +
      `Từ: ${fromSales?.display_name}\n` +
      `Sang: ${toSales?.display_name}\n\n` +
      `Nội dung bàn giao:\n` +
      `- ${transferLeads ? `Có (${fromSales?.leadCount ?? 0} lead)` : 'Không'}\n` +
      `- ${transferCtvs ? `Có (${fromSales?.ctvCount ?? 0} CTV)` : 'Không'}\n` +
      `- ${transferFollowups ? `Có (${fromSales?.followupCount ?? 0} việc follow-up)` : 'Không'}\n` +
      `- ${transferImports ? `Có (${fromSales?.importCount ?? 0} dòng Excel)` : 'Không'}\n` +
      `- Khóa tài khoản sau bàn giao: ${deactivateOldSales ? 'CÓ (Khóa tài khoản)' : 'KHÔNG'}\n\n` +
      `Lưu ý: Mọi NE lịch sử đã chốt vẫn bảo toàn cho Sales cũ theo luật nghiệp vụ.\n\n` +
      `Bạn có chắc chắn muốn thực hiện?`;

    if (!confirm(confirmMsg)) return;

    setBusy(true);
    setResult(null);

    try {
      const res = await fetch('/api/demo/admin/users/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromSalesId,
          toSalesId,
          transferCtvs,
          transferLeads,
          transferOpenFollowups: transferFollowups,
          transferImportRecords: transferImports,
          deactivateOldSales,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi bàn giao nhân sự.');

      setResult({ message: data.message, type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setResult({ message: msg, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px' }}>
      {result && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: 600,
          background: result.type === 'success' ? '#e8f5e9' : '#ffebee',
          color: result.type === 'success' ? '#2e7d32' : '#c62828',
          border: `1px solid ${result.type === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
        }}>
          {result.message}
        </div>
      )}

      <div className="info-banner" style={{ marginBottom: '22px' }}>
        <span className="banner-icon">i</span>
        <span>
          <b>Quy tắc bất biến:</b> Lịch sử NE đã được ghi nhận trước thời điểm bàn giao vẫn thuộc về Sales cũ (theo snapshot attribution).
          Nếu sau này có hoàn tiền cho giao dịch cũ, −1 NE vẫn trừ vào chỉ số của Sales cũ tại ngày hoàn.
          Các lead và CTV được bàn giao sẽ tiếp tục mang lại NE mới cho Sales tiếp nhận.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Source Sales */}
        <div style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: '10px', padding: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#17243a', marginBottom: '8px' }}>
            1. Nhân sự chuyển đi (Nghỉ việc / Đổi nhóm)
          </label>
          <select
            value={fromSalesId}
            onChange={e => setFromSalesId(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #c9d4e3', fontSize: '13px', background: '#fff' }}
          >
            {salesList.map(s => (
              <option key={s.id} value={s.id}>
                {s.display_name} ({s.email}) {s.status !== 'ACTIVE' ? `[${s.status}]` : ''}
              </option>
            ))}
          </select>

          {fromSales && (
            <div style={{ marginTop: '14px', background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, color: '#4169e1', marginBottom: '6px' }}>Khối lượng phụ trách hiện tại:</div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#5b6b84', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><b>{fromSales.leadCount}</b> Lead CRM đang quản lý</li>
                <li><b>{fromSales.ctvCount}</b> Cộng tác viên phụ trách</li>
                <li><b>{fromSales.followupCount}</b> Lịch hẹn follow-up đang mở</li>
                <li><b>{fromSales.importCount}</b> Dòng Excel nguồn đã gán</li>
              </ul>
            </div>
          )}
        </div>

        {/* Target Sales */}
        <div style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: '10px', padding: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#17243a', marginBottom: '8px' }}>
            2. Nhân sự tiếp nhận bàn giao
          </label>
          <select
            value={toSalesId}
            onChange={e => setToSalesId(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #c9d4e3', fontSize: '13px', background: '#fff' }}
          >
            {salesList.filter(s => s.id !== fromSalesId && s.status === 'ACTIVE').map(s => (
              <option key={s.id} value={s.id}>
                {s.display_name} ({s.email})
              </option>
            ))}
          </select>

          {toSales && (
            <div style={{ marginTop: '14px', background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, color: '#2e7d32', marginBottom: '6px' }}>Khối lượng hiện có của người nhận:</div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#5b6b84', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><b>{toSales.leadCount}</b> Lead CRM hiện tại</li>
                <li><b>{toSales.ctvCount}</b> Cộng tác viên hiện tại</li>
                <li><b>{toSales.followupCount}</b> Lịch hẹn follow-up hiện tại</li>
                <li><b>{toSales.importCount}</b> Dòng Excel hiện tại</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Scope Options */}
      <div style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: '10px', padding: '18px', marginBottom: '22px' }}>
        <h3 style={{ fontSize: '14px', margin: '0 0 12px', color: '#17243a' }}>3. Nội dung bàn giao</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={transferLeads} onChange={e => setTransferLeads(e.target.checked)} />
            <span>Chuyển giao toàn bộ <b>Lead CRM</b> (Cập nhật lịch sử sở hữu và hiệu lực)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={transferCtvs} onChange={e => setTransferCtvs(e.target.checked)} />
            <span>Chuyển giao toàn bộ <b>Cộng tác viên (CTV)</b> do nhân sự quản lý</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={transferFollowups} onChange={e => setTransferFollowups(e.target.checked)} />
            <span>Chuyển giao các <b>Lịch hẹn follow-up</b> đang mở sang người tiếp nhận</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={transferImports} onChange={e => setTransferImports(e.target.checked)} />
            <span>Chuyển giao các <b>Dòng Excel nguồn</b> đã gán chưa kích hoạt</span>
          </label>

          <div style={{ borderTop: '1px solid #f0f3f8', margin: '6px 0', paddingTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#c62828' }}>
              <input type="checkbox" checked={deactivateOldSales} onChange={e => setDeactivateOldSales(e.target.checked)} />
              <span><b>Khóa tài khoản nhân sự cũ</b> (Đăng xuất phiên làm việc, chuyển trạng thái REJECTED)</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          type="button"
          disabled={busy || !fromSalesId || !toSalesId || fromSalesId === toSalesId}
          onClick={handleTransfer}
          style={{
            background: '#4169e1',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Đang thực hiện bàn giao…' : 'Xác nhận bàn giao nhân sự'}
        </button>
        <Link href="/admin/users" style={{ fontSize: '13px', color: '#748198', textDecoration: 'none' }}>
          ← Quay lại danh sách tài khoản
        </Link>
      </div>
    </div>
  );
}
