import Link from 'next/link';

export default function PendingPage() {
  return <main className="auth-page"><section className="auth-card pending-card">
    <div className="auth-brand">NBS <span>CRM tuyển sinh</span></div>
    <div className="pending-icon">✓</div>
    <h1>Đã gửi đăng ký</h1>
    <p>Tài khoản đang chờ Admin duyệt. Sau khi được duyệt, hãy quay lại đăng nhập bằng email và mật khẩu đã tạo.</p>
    <Link className="auth-button-link" href="/login">Quay lại đăng nhập</Link>
  </section></main>;
}
