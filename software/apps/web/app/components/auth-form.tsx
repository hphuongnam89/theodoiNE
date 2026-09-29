'use client';

import { FormEvent, useState } from 'react';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const payload = mode === 'register'
      ? { name: data.get('name'), email: data.get('email'), password: data.get('password') }
      : { email: data.get('email'), password: data.get('password') };
    try {
      const response = await fetch(`/api/demo/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.status === 'PENDING') { window.location.assign('/pending'); return; }
        setError(result.error ?? 'Không thể xử lý yêu cầu.');
        return;
      }
      window.location.assign(mode === 'register' ? '/pending' : '/');
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === 'register' && <label>Họ tên<input name="name" autoComplete="name" maxLength={120} required /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 10 : undefined} maxLength={128} required /></label>
      {mode === 'register' && <p className="form-hint">Tối thiểu 10 ký tự. Admin sẽ duyệt trước khi tài khoản được đăng nhập.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : mode === 'register' ? 'Gửi đăng ký' : 'Đăng nhập'}</button>
    </form>
  );
}
