'use client';

import { useState } from 'react';
import Link from 'next/link';

export type DuplicateRecord = {
  id: string;
  full_name: string;
  source_sheet: string;
  source_row: number;
  record_kind: string;
  program_raw: string | null;
  status_raw: string | null;
  owner_raw: string | null;
  ctv_raw: string | null;
  assigned_sales_user_id: string | null;
  assigned_sales_name: string | null;
  flags: string;
  active_lead_id: string | null;
};

export type DuplicateGroup = {
  phone_normalized: string;
  total_records: number;
  skipped_records: number;
  crm_lead_count: number;
  crm_lead_id: string | null;
  crm_lead_name: string | null;
  crm_lead_stage: string | null;
  crm_lead_owner: string | null;
  records: DuplicateRecord[];
};

type SalesUser = {
  id: string;
  display_name: string;
  email: string;
};

export default function DuplicateQueueClient({
  initialGroups,
  salesList,
}: {
  initialGroups: DuplicateGroup[];
  salesList: SalesUser[];
}) {
  const [groups, setGroups] = useState<DuplicateGroup[]>(initialGroups);
  const [selectedSales, setSelectedSales] = useState<Record<string, string>>({});
  const [skipOthersMap, setSkipOthersMap] = useState<Record<string, boolean>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const getChosenSales = (recordId: string, defaultSalesId: string | null) => {
    return selectedSales[recordId] ?? defaultSalesId ?? (salesList[0]?.id || '');
  };

  const handleAssignSales = async (recordId: string, salesUserId: string) => {
    setBusyAction(`assign-${recordId}`);
    setNotice(null);
    try {
      const res = await fetch('/api/demo/admin/import/duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_sales', recordId, salesUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi gán Sales.');

      const salesObj = salesList.find(s => s.id === salesUserId);
      setGroups(prev => prev.map(g => ({
        ...g,
        records: g.records.map(r => r.id === recordId ? {
          ...r,
          assigned_sales_user_id: salesUserId,
          assigned_sales_name: salesObj ? salesObj.display_name : r.assigned_sales_name,
        } : r),
      })));
      setNotice({ message: 'Đã gán Sales thành công.', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setNotice({ message: msg, type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSkipRecord = async (recordId: string, phone: string) => {
    setBusyAction(`skip-${recordId}`);
    setNotice(null);
    try {
      const res = await fetch('/api/demo/admin/import/duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip', recordId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi bỏ qua bản ghi.');

      setGroups(prev => prev.map(g => {
        if (g.phone_normalized !== phone) return g;
        return {
          ...g,
          skipped_records: g.skipped_records + 1,
          records: g.records.map(r => r.id === recordId ? {
            ...r,
            flags: r.flags.includes('SKIPPED_DUPLICATE') ? r.flags : `${r.flags}|SKIPPED_DUPLICATE`,
          } : r),
        };
      }));
      setNotice({ message: 'Đã đánh dấu bỏ qua bản ghi trùng.', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setNotice({ message: msg, type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSkipGroup = async (phone: string) => {
    if (!confirm(`Bạn có chắc muốn bỏ qua tất cả các dòng chưa kích hoạt trong nhóm ${phone}?`)) return;
    setBusyAction(`skipgroup-${phone}`);
    setNotice(null);
    try {
      const res = await fetch('/api/demo/admin/import/duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip_group', phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi bỏ qua nhóm.');

      setGroups(prev => prev.map(g => {
        if (g.phone_normalized !== phone) return g;
        return {
          ...g,
          skipped_records: g.records.filter(r => !r.active_lead_id).length,
          records: g.records.map(r => r.active_lead_id ? r : {
            ...r,
            flags: r.flags.includes('SKIPPED_DUPLICATE') ? r.flags : `${r.flags}|SKIPPED_DUPLICATE`,
          }),
        };
      }));
      setNotice({ message: data.message || 'Đã bỏ qua các bản ghi trong nhóm.', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setNotice({ message: msg, type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleActivate = async (record: DuplicateRecord, phone: string) => {
    const salesUserId = getChosenSales(record.id, record.assigned_sales_user_id);
    if (!salesUserId) {
      setNotice({ message: 'Vui lòng chọn Sales phụ trách trước khi kích hoạt.', type: 'error' });
      return;
    }
    const skipOtherInGroup = skipOthersMap[record.id] !== false; // default true
    setBusyAction(`activate-${record.id}`);
    setNotice(null);
    try {
      const res = await fetch('/api/demo/admin/import/duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'activate',
          recordId: record.id,
          phone,
          salesUserId,
          skipOtherInGroup,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi kích hoạt lead.');

      const salesObj = salesList.find(s => s.id === salesUserId);
      setGroups(prev => prev.map(g => {
        if (g.phone_normalized !== phone) return g;
        return {
          ...g,
          crm_lead_count: 1,
          crm_lead_id: data.leadId,
          crm_lead_name: record.full_name,
          crm_lead_stage: 'NEW',
          crm_lead_owner: salesObj ? salesObj.display_name : 'Sales',
          records: g.records.map(r => {
            if (r.id === record.id) {
              return {
                ...r,
                active_lead_id: data.leadId,
                assigned_sales_user_id: salesUserId,
                assigned_sales_name: salesObj ? salesObj.display_name : r.assigned_sales_name,
              };
            }
            if (skipOtherInGroup && !r.active_lead_id) {
              return {
                ...r,
                flags: r.flags.includes('SKIPPED_DUPLICATE') ? r.flags : `${r.flags}|SKIPPED_DUPLICATE`,
              };
            }
            return r;
          }),
        };
      }));
      setNotice({ message: 'Kích hoạt lead vào CRM thành công (Trạng thái: Mới tiếp nhận).', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi kết nối.';
      setNotice({ message: msg, type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div>
      {notice && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          fontWeight: 500,
          background: notice.type === 'success' ? '#e8f5e9' : '#ffebee',
          color: notice.type === 'success' ? '#2e7d32' : '#c62828',
          border: `1px solid ${notice.type === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
        }}>
          {notice.message}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="empty-state">Không có nhóm trùng lặp nào phù hợp điều kiện lọc.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {groups.map(g => {
            const hasCrmLead = Boolean(g.crm_lead_id || g.records.some(r => r.active_lead_id));
            const activeLeadId = g.crm_lead_id || g.records.find(r => r.active_lead_id)?.active_lead_id;
            const allResolved = g.records.every(r => r.active_lead_id || r.flags.includes('SKIPPED_DUPLICATE'));

            return (
              <article key={g.phone_normalized} style={{
                background: '#fff',
                border: allResolved ? '1px solid #dbe3ee' : '1px solid #c9d8fb',
                borderRadius: '12px',
                padding: '18px 20px',
                boxShadow: allResolved ? 'none' : '0 2px 8px rgba(65, 105, 225, 0.06)',
              }}>
                {/* Header Group */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', borderBottom: '1px solid #f0f3f8', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#162a52', letterSpacing: '0.02em' }}>
                      ☎ {g.phone_normalized}
                    </span>
                    <span className="chip" style={{ background: '#eaf0ff', color: '#2b52ba', fontWeight: 600 }}>
                      {g.total_records} dòng nguồn
                    </span>
                    {hasCrmLead ? (
                      <span className="chip" style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}>
                        ✓ Đã có trong CRM {activeLeadId ? `(${g.crm_lead_name ?? 'Lead'})` : ''}
                      </span>
                    ) : (
                      <span className="chip" style={{ background: '#fff3e0', color: '#e65100', fontWeight: 600 }}>
                        ○ Chưa kích hoạt CRM
                      </span>
                    )}
                    {allResolved && (
                      <span className="chip" style={{ background: '#f5f5f5', color: '#616161' }}>
                        ✓ Đã xử lý xong
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {activeLeadId && (
                      <Link href={`/crm/leads/${activeLeadId}`} style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#4169e1',
                        textDecoration: 'none',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        background: '#f0f5ff',
                      }}>
                        Mở Lead CRM →
                      </Link>
                    )}
                    {!allResolved && (
                      <button
                        type="button"
                        className="outline-button"
                        disabled={busyAction === `skipgroup-${g.phone_normalized}`}
                        onClick={() => handleSkipGroup(g.phone_normalized)}
                        style={{ fontSize: '11px', padding: '5px 10px', color: '#748198' }}
                      >
                        {busyAction === `skipgroup-${g.phone_normalized}` ? 'Đang bỏ qua…' : 'Bỏ qua các dòng còn lại'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Rows Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {g.records.map((r, idx) => {
                    const isActivated = Boolean(r.active_lead_id);
                    const isSkipped = r.flags.includes('SKIPPED_DUPLICATE');
                    const chosenSales = getChosenSales(r.id, r.assigned_sales_user_id);
                    const shouldSkipOthers = skipOthersMap[r.id] !== false;

                    return (
                      <div key={r.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: isActivated ? '#f4fbf6' : isSkipped ? '#f9fafb' : idx % 2 === 0 ? '#fbfcfe' : '#ffffff',
                        border: isActivated ? '1px solid #c8e6c9' : '1px solid #edf2f7',
                        opacity: isSkipped && !isActivated ? 0.6 : 1,
                      }}>
                        {/* Info Column */}
                        <div style={{ flex: '1 1 280px', minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '14px', color: '#17243a' }}>{r.full_name}</strong>
                            <span style={{ fontSize: '11px', color: '#748198' }}>
                              ({r.source_sheet} · dòng {r.source_row})
                            </span>
                            {r.record_kind === 'NE_HISTORY' && (
                              <span style={{ fontSize: '10px', background: '#fff1e2', color: '#b27423', padding: '1px 5px', borderRadius: '4px' }}>
                                NE lịch sử
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#5b6b84', marginTop: '4px' }}>
                            {r.program_raw ? <span>Ngành: <b>{r.program_raw}</b></span> : <span>Chưa rõ ngành</span>}
                            {r.status_raw && <span> · Trạng thái nguồn: <b>{r.status_raw}</b></span>}
                            {r.owner_raw && <span> · Sales nguồn: <b>{r.owner_raw}</b></span>}
                            {r.ctv_raw && <span> · CTV nguồn: <b>{r.ctv_raw}</b></span>}
                          </div>
                        </div>

                        {/* Sales Assignee */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#748198' }}>Sales:</span>
                          {isActivated ? (
                            <strong style={{ fontSize: '12px', color: '#162a52' }}>
                              {r.assigned_sales_name ?? 'Đã gán'}
                            </strong>
                          ) : (
                            <select
                              value={chosenSales}
                              disabled={isSkipped || busyAction !== null}
                              onChange={e => {
                                const val = e.target.value;
                                setSelectedSales(prev => ({ ...prev, [r.id]: val }));
                                if (r.assigned_sales_user_id !== val) {
                                  handleAssignSales(r.id, val);
                                }
                              }}
                              style={{
                                fontSize: '12px',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #dbe3ee',
                                background: '#fff',
                                maxWidth: '160px',
                              }}
                            >
                              {salesList.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.display_name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isActivated ? (
                            <span style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 600 }}>
                              ✓ Đã vào CRM
                            </span>
                          ) : isSkipped ? (
                            <span style={{ fontSize: '12px', color: '#8c9ba5' }}>
                              ✕ Đã bỏ qua trùng
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label style={{ fontSize: '11px', color: '#68778d', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={shouldSkipOthers}
                                  onChange={e => setSkipOthersMap(prev => ({ ...prev, [r.id]: e.target.checked }))}
                                />
                                Bỏ qua dòng khác
                              </label>
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => handleActivate(r, g.phone_normalized)}
                                style={{
                                  background: '#4169e1',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {busyAction === `activate-${r.id}` ? 'Đang kích hoạt…' : 'Kích hoạt vào CRM'}
                              </button>
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => handleSkipRecord(r.id, g.phone_normalized)}
                                style={{
                                  background: 'none',
                                  color: '#748198',
                                  border: '1px solid #dbe3ee',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                }}
                              >
                                {busyAction === `skip-${r.id}` ? '…' : 'Bỏ qua'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
