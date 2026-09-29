import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthForm from '@/app/components/auth-form';
import { getSessionUser } from '@/lib/demo-auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user?.status === 'ACTIVE') redirect('/');
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand">NBS <span>CRM tuyển sinh</span></div>
    <h1>Đăng nhập demo</h1>
    <p>Dùng email và mật khẩu đã đăng ký. Tài khoản cần được Admin duyệt.</p>
    <AuthForm mode="login" />
    <p className="auth-switch">Chưa có tài khoản? <Link href="/register">Đăng ký</Link></p>
  </section></main>;
}
