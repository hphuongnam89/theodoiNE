'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type Sales = { id: string; display_name: string };
type Ctv = { id: string; display_name: string; owner_user_id: string };

export default function NewLeadForm({ role, sales, ctv }: { role: string; sales: Sales[]; ctv: Ctv[] }) {
  const router = useRouter();
  const [owner, setOwner] = useState(sales[0]?.id ?? '');
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: data.get('name'), phone: data.get('phone'), contactText: data.get('contactText'),
      program: data.get('program'), source: data.get('source'),
      ownerUserId: role === 'SALES' ? undefined : data.get('ownerUserId'),
      ctvId: data.get('ctvId'), ackDuplicate: duplicate,
    };
    try {
      const response = await fetch('/api/demo/crm/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.status === 409 && result.duplicate) { setDuplicate(true); setError(result.error); return; }
      if (!response.ok) { setError(result.error ?? 'Không thể tạo lead.'); return; }
      router.push(`/crm/leads/${result.id}`);
      router.refresh();
    } catch { setError('Không thể kết nối.'); } finally { setBusy(false); }
  }
  return <form className="crm-form" onSubmit={submit}>
    <label>Họ tên<input name="name" required maxLength={120} /></label>
    <label>Điện thoại<input name="phone" inputMode="tel" placeholder="0xxxxxxxxx" onChange={() => setDuplicate(false)} /></label>
    <label>Liên hệ khác<input name="contactText" maxLength={300} placeholder="Facebook, Zalo hoặc email nếu chưa có số" /></label>
    <label>Ngành quan tâm<input name="program" maxLength={120} /></label>
    <label>Nguồn<select name="source" defaultValue="DIRECT"><option value="DIRECT">Sales tự tạo</option><option value="CTV">CTV</option><option value="WEB">Website / online</option><option value="PHONE">Cuộc gọi</option><option value="OTHER">Khác</option></select></label>
    {role !== 'SALES' && <label>Sales phụ trách<select name="ownerUserId" value={owner} onChange={event => setOwner(event.target.value)} required>
      <option value="">Chọn Sales</option>{sales.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
    </select></label>}
    <label>CTV giới thiệu<select name="ctvId" defaultValue=""><option value="">Không có CTV</option>
      {ctv.filter(item => role === 'SALES' || item.owner_user_id === owner).map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
    </select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {duplicate && <p className="form-hint">Hãy kiểm tra danh sách Excel/CRM trước khi lưu. Lần bấm tiếp theo sẽ ghi nhận lead mới riêng biệt.</p>}
    <button disabled={busy || (role !== 'SALES' && !owner)}>{busy ? 'Đang lưu…' : duplicate ? 'Lưu dù nghi trùng' : 'Tạo lead'}</button>
  </form>;
}
