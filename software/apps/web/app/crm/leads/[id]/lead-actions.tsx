'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STAGE_LABELS, type LeadStage } from '@/lib/crm-shared';

type LeadRow = { id: string; stage: LeadStage; lost_reason: string | null; owner_user_id: string };

type Followup = { id: string; due_at: string; note: string; status: string; completed_at: string | null };

export default function LeadActions({ lead, role, sales, followups }: {
  lead: LeadRow; role: string; sales: Array<{ id: string; display_name: string }>; followups: Followup[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<LeadStage>(lead.stage);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string, payload: object) {
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Không thể lưu.'); return false; }
      router.refresh();
      return true;
    } catch { setError('Không thể kết nối.'); return false; } finally { setBusy(false); }
  }
  async function updateStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await send(`/api/demo/crm/leads/${lead.id}`, 'PATCH', {
      stage: data.get('stage'), reason: data.get('reason'),
      ownerUserId: role === 'SALES' ? undefined : data.get('ownerUserId'),
    });
  }
  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await send(`/api/demo/crm/leads/${lead.id}/activities`, 'POST', { kind: data.get('kind'), note: data.get('note') })) form.reset();
  }
  async function addFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawDate = String(data.get('dueAt') || '');
    const date = new Date(rawDate);
    if (isNaN(date.getTime())) {
      setError('Thời điểm hẹn liên hệ lại không hợp lệ.');
      return;
    }
    if (await send(`/api/demo/crm/leads/${lead.id}/followups`, 'POST', { dueAt: date.toISOString(), note: data.get('note') })) form.reset();
  }
  return <div className="lead-actions">
    {error && <p className="form-error" role="alert">{error}</p>}
    <form className="crm-form" onSubmit={updateStage}><h3>Cập nhật trạng thái</h3>
      <label>Trạng thái<select name="stage" value={stage} onChange={event => setStage(event.target.value as LeadStage)}>
        {(Object.entries(STAGE_LABELS) as Array<[LeadStage,string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      {stage === 'LOST' && <label>Lý do<input name="reason" maxLength={300} defaultValue={lead.lost_reason ?? ''} required /></label>}
      {role !== 'SALES' && <label>Sales phụ trách<select name="ownerUserId" defaultValue={lead.owner_user_id}>{sales.map(item => <option value={item.id} key={item.id}>{item.display_name}</option>)}</select></label>}
      <button disabled={busy}>Lưu thay đổi</button>
    </form>
    <form className="crm-form" onSubmit={addActivity}><h3>Ghi hoạt động</h3>
      <label>Loại<select name="kind"><option value="CALL">Cuộc gọi</option><option value="MESSAGE">Tin nhắn</option><option value="MEETING">Cuộc hẹn</option><option value="NOTE">Ghi chú</option></select></label>
      <label>Nội dung<textarea name="note" required maxLength={1000} rows={3} /></label><button disabled={busy}>Lưu hoạt động</button>
    </form>
    <form className="crm-form" onSubmit={addFollowup}><h3>Hẹn liên hệ lại</h3>
      <label>Thời điểm<input name="dueAt" type="datetime-local" required /></label>
      <label>Nội dung<input name="note" maxLength={300} required /></label><button disabled={busy}>Tạo lịch hẹn</button>
    </form>
    <div className="followup-list"><h3>Việc cần làm</h3>{followups.length === 0 && <p className="empty-state">Chưa có lịch hẹn.</p>}
      {followups.map(item => <div className="followup-row" key={item.id}><div><strong>{item.note}</strong><small>{new Date(item.due_at).toLocaleString('vi-VN')} · {item.status === 'DONE' ? 'Đã hoàn tất' : 'Đang mở'}</small></div>
        {item.status === 'OPEN' && <button disabled={busy} onClick={() => send(`/api/demo/crm/followups/${item.id}`, 'PATCH', {})}>Hoàn tất</button>}</div>)}
    </div>
  </div>;
}
