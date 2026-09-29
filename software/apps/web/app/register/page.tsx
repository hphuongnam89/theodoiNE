import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthForm from '@/app/components/auth-form';
import { getSessionUser } from '@/lib/demo-auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user?.status === 'ACTIVE') redirect('/');
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand">NBS <span>CRM tuyển sinh</span></div>
    <h1>Đăng ký tài khoản</h1>
    <p>Sales đăng ký email để truy cập bản demo. Admin sẽ xét duyệt tài khoản.</p>
    <AuthForm mode="register" />
    <p className="auth-switch">Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>
  </section></main>;
}
