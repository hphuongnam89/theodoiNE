import { randomUUID } from 'node:crypto';
import { getDemoDb, hashPassword, normalizeEmail, sameOrigin } from '@/lib/demo-auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = body.password;
  if (!email || !name || name.length > 120 || typeof password !== 'string' ||
      password.length < 10 || password.length > 128) {
    return Response.json({ error: 'Nhập tên, email hợp lệ và mật khẩu từ 10 đến 128 ký tự.' }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  try {
    getDemoDb().prepare(`
      INSERT INTO demo_users (id, email, display_name, password_hash, role, status, created_at)
      VALUES (?, ?, ?, ?, 'SALES', 'PENDING', ?)
    `).run(randomUUID(), email, name, passwordHash, new Date().toISOString());
  } catch {
    return Response.json({ error: 'Email này đã được đăng ký.' }, { status: 409 });
  }
  return Response.json({ status: 'PENDING' }, { status: 201 });
}
