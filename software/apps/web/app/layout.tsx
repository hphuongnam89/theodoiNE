import type { Metadata } from 'next';
import './globals.css';
import './auth.css';

export const metadata: Metadata = {
  title: 'NBS — Quản lý tuyển sinh',
  description: 'Không gian quản lý khách hàng, NE và cộng tác viên',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
