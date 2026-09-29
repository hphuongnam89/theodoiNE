import { createSession, getDemoDb, normalizeEmail, sameOrigin, setSessionCookie, verifyPassword } from '@/lib/demo-auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!email || typeof password !== 'string' || password.length > 128) {
    return Response.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
  }
  const db = getDemoDb();
  const attempt = db.prepare('SELECT failed_count, locked_until FROM demo_auth_attempts WHERE email = ?').get(email) as
    { failed_count: number; locked_until: string | null } | undefined;
  if (attempt?.locked_until && attempt.locked_until > new Date().toISOString()) {
    return Response.json({ error: 'Thử lại sau 15 phút.' }, { status: 429 });
  }
  const user = db.prepare('SELECT id, password_hash, status FROM demo_users WHERE email = ?').get(email) as
    { id: string; password_hash: string; status: string } | undefined;
  const valid = user && await verifyPassword(password, user.password_hash);
  if (!valid) {
    const count = (attempt?.failed_count ?? 0) + 1;
    const lock = count >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    db.prepare(`INSERT INTO demo_auth_attempts (email, failed_count, locked_until) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET failed_count = excluded.failed_count, locked_until = excluded.locked_until`)
      .run(email, count >= 5 ? 0 : count, lock);
    return Response.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
  }
  db.prepare('DELETE FROM demo_auth_attempts WHERE email = ?').run(email);
  if (user.status === 'PENDING') {
    return Response.json({ error: 'Tài khoản đang chờ Admin duyệt.', status: 'PENDING' }, { status: 403 });
  }
  if (user.status !== 'ACTIVE') {
    return Response.json({ error: 'Tài khoản chưa được phép đăng nhập.' }, { status: 403 });
  }
  const token = createSession(user.id);
  await setSessionCookie(token);
  return Response.json({ ok: true });
}
