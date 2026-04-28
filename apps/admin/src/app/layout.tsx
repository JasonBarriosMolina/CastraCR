import type { Metadata } from 'next';
import './globals.css';
import { AmplifyProvider } from '@/components/AmplifyProvider';
import { AdminShell } from '@/components/AdminShell';

export const metadata: Metadata = {
  title: 'CastraCR Admin',
  description: 'Panel de administración CastraCR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-50 flex">
        <AmplifyProvider>
          <AdminShell>{children}</AdminShell>
        </AmplifyProvider>
      </body>
    </html>
  );
}
