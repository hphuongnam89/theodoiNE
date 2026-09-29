'use client';

import { useState } from 'react';

export type OperationsData = {
  database: {
    path: string;
    size: number;
    modified: string;
    integrityOk: boolean;
    integrityDetails: string[];
    foreignKeysOk: boolean;
    fkErrorsCount: number;
  };
  backups: Array<{
    filename: string;
    size: number;
    createdAt: string;
  }>;
  readiness: {
    integrityOk: boolean;
    activeUsers: { admin: number; leader: number; sales: number; pending: number };
    importStats: { total: number; unassigned: number; duplicateGroups: number };
    crmStats: { leads: number; officialNe: number };
    pendingPayments: number;
    overdueFollowups: number;
  };
};

export default function OperationsClient({
  initialData,
  userRole,
}: {
  initialData: OperationsData;
  userRole: string;
}) {
  const [data, setData] = useState<OperationsData>(initialData);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const reloadStatus = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/demo/admin/operations');
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {}
    setBusy(false);
  };

  const handleCreateBackup = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/demo/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'backup' }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Lỗi khi tạo bản sao lưu.');

      setNotice({ message: result.message, type: 'success' });
      await reloadStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setNotice({ message: msg, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (filename: string) => {
    const confirmMsg = `CẢNH BÁO QUAN TRỌNG: Bạn có chắc chắn muốn khôi phục CSDL từ file:\n\n` +
      `${filename}\n\n` +
      `Thao tác này sẽ ghi đè toàn bộ dữ liệu hiện tại bằng nội dung của bản sao lưu.\n` +
      `Hệ thống sẽ tự động tạo một bản sao lưu dự phòng (pre-restore) trước khi thực hiện.\n\n` +
      `Nhập 'OK' trong hộp thoại kế tiếp nếu bạn muốn tiếp tục.`;

    if (!confirm(confirmMsg)) return;

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/demo/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', filename }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Lỗi khi khôi phục.');

      setNotice({ message: result.message, type: 'success' });
      await reloadStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setNotice({ message: msg, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Calculate cutover readiness score
  let score = 0;
  if (data.database.integrityOk) score += 25;
  if (data.database.foreignKeysOk) score += 15;
  if (data.readiness.activeUsers.admin > 0 && data.readiness.activeUsers.sales > 0) score += 20;
  if (data.readiness.pendingPayments === 0) score += 15; else score += 5;
  if (data.backups.length > 0) score += 15;
  if (data.readiness.importStats.duplicateGroups === 0) score += 10; else score += 5;

  return (
    <div>
      {notice && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: 600,
          background: notice.type === 'success' ? '#e8f5e9' : '#ffebee',
          color: notice.type === 'success' ? '#2e7d32' : '#c62828',
          border: `1px solid ${notice.type === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
        }}>
          {notice.message}
        </div>
      )}

      {/* Readiness Banner */}
      <section className="admin-panel" style={{ marginBottom: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Chỉ số sẵn sàng vận hành (Cutover Readiness Score)</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#748198' }}>
              Kiểm tra toàn diện tính toàn vẹn CSDL, cấu hình bảo mật, phân quyền tài khoản và tiến độ đối soát.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              fontSize: '28px',
              fontWeight: 800,
              color: score >= 85 ? '#2e7d32' : score >= 60 ? '#f57c00' : '#c62828',
            }}>
              {score}/100
            </div>
            <span className={`alert-badge ${score >= 85 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH'}`}>
              {score >= 85 ? 'Sẵn sàng Go-live' : score >= 60 ? 'Đang chuẩn bị' : 'Cần rà soát'}
            </span>
          </div>
        </div>

        {/* Readiness Checklist Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eef2f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>1. Toàn vẹn cơ sở dữ liệu:</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: data.database.integrityOk ? '#2e7d32' : '#c62828' }}>
                {data.database.integrityOk ? '✓ Hoàn hảo (OK)' : '✕ Lỗi toàn vẹn'}
              </span>
            </div>
            <small style={{ color: '#748198', display: 'block', marginTop: '4px' }}>
              Dung lượng: {Math.round(data.database.size / 1024)} KB · Khóa ngoại: {data.database.foreignKeysOk ? 'Hợp lệ' : `${data.database.fkErrorsCount} lỗi`}
            </small>
          </div>

          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eef2f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>2. Tài khoản phân quyền:</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#2e7d32' }}>
                {data.readiness.activeUsers.admin} Admin · {data.readiness.activeUsers.sales} Sales
              </span>
            </div>
            <small style={{ color: '#748198', display: 'block', marginTop: '4px' }}>
              {data.readiness.activeUsers.leader} Leader · {data.readiness.activeUsers.pending} tài khoản chờ duyệt
            </small>
          </div>

          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eef2f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>3. Học phí chờ duyệt:</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: data.readiness.pendingPayments > 0 ? '#f57c00' : '#2e7d32' }}>
                {data.readiness.pendingPayments === 0 ? '✓ Đã hoàn tất đối soát' : `${data.readiness.pendingPayments} khoản chờ duyệt`}
              </span>
            </div>
            <small style={{ color: '#748198', display: 'block', marginTop: '4px' }}>
              Tổng NE chính thức hiện hành: <b>{data.readiness.crmStats.officialNe} NE</b>
            </small>
          </div>

          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eef2f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>4. Dữ liệu nguồn & Trùng lặp:</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: data.readiness.importStats.duplicateGroups > 0 ? '#f57c00' : '#2e7d32' }}>
                {data.readiness.importStats.duplicateGroups} nhóm trùng còn chờ
              </span>
            </div>
            <small style={{ color: '#748198', display: 'block', marginTop: '4px' }}>
              {data.readiness.crmStats.leads} Lead CRM · {data.readiness.importStats.total} dòng Excel nguồn
            </small>
          </div>
        </div>
      </section>

      {/* Database Backup Section */}
      <section className="admin-panel next">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Quản lý sao lưu dữ liệu (Snapshot Backups)</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#748198' }}>
              Bản sao lưu lưu trữ an toàn tại thư mục hệ thống <code>data/backups/</code>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              disabled={busy}
              onClick={handleCreateBackup}
              style={{
                background: '#4169e1',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {busy ? 'Đang thực hiện…' : '💾 Tạo bản sao lưu tức thì'}
            </button>
            <button
              type="button"
              className="outline-button"
              disabled={busy}
              onClick={reloadStatus}
              style={{ fontSize: '12px', padding: '8px 12px' }}
            >
              Làm mới
            </button>
          </div>
        </div>

        {data.backups.length === 0 ? (
          <p className="empty-state">Chưa có bản sao lưu nào. Hãy nhấn &quot;Tạo bản sao lưu tức thì&quot; trước khi chuyển giao vận hành.</p>
        ) : (
          <table className="breakdown-table">
            <thead>
              <tr>
                <th>Tên file sao lưu</th>
                <th style={{ textAlign: 'center' }}>Dung lượng</th>
                <th style={{ textAlign: 'center' }}>Thời gian tạo (VN)</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map(b => (
                <tr key={b.filename}>
                  <td>
                    <strong style={{ fontSize: '13px', color: '#17243a' }}>{b.filename}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>{Math.round(b.size / 1024)} KB</td>
                  <td style={{ textAlign: 'center', color: '#748198' }}>
                    {new Date(b.createdAt).toLocaleString('vi-VN')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {userRole === 'ADMIN' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRestore(b.filename)}
                        style={{
                          background: 'none',
                          border: '1px solid #dbe3ee',
                          color: '#d32f2f',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: busy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Khôi phục bản này
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#a0aec0' }}>Chỉ Admin</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
