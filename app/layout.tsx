import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'เบิกเงินล่วงหน้า | VTA Service',
  description: 'ระบบเบิกเงินล่วงหน้าพนักงาน บริษัท วีทีเอ เซอร์วิส จำกัด',
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f5fe0' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
