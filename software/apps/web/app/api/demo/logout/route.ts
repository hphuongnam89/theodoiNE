import { destroySession, sameOrigin } from '@/lib/demo-auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  await destroySession();
  return Response.redirect(new URL('/login', request.url), 303);
}
