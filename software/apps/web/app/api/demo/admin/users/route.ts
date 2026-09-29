import { getDemoDb, getSessionUser } from '@/lib/demo-auth';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const actor = await getSessionUser();
  if (!actor || actor.status !== 'ACTIVE' || actor.role !== 'ADMIN') {
    return Response.json({ error: 'Không có quyền.' }, { status: 403 });
  }
  const items = getDemoDb().prepare(`
    SELECT id, email, display_name, role, status, created_at, approved_at
    FROM demo_users ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 200
  `).all();
  return Response.json({ items });
}
