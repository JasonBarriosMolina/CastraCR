import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AmplifyProvider } from '@/components/AmplifyProvider';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CastraCR — Esterilización para todos',
  description: 'Plataforma de campañas de esterilización de mascotas en Costa Rica',
  keywords: ['esterilización', 'mascotas', 'Costa Rica', 'campaña', 'perros', 'gatos'],
};

export const viewport: Viewport = {
  themeColor: '#06b6d4',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans">
        <AmplifyProvider>
          {/* Desktop navbar — hidden on mobile */}
          <div className="hidden md:block">
            <Navbar />
          </div>

          {/* Main content */}
          <main className="pb-24 md:pb-8 md:max-w-5xl md:mx-auto md:px-4 md:py-6">
            {children}
          </main>

          {/* Footer — desktop only */}
          <footer className="hidden md:block border-t mt-8 py-6 text-center text-xs text-slate-400 bg-white">
            © {new Date().getFullYear()} CastraCR · Hecho con ❤️ para las mascotas de Costa Rica
          </footer>

          {/* Mobile bottom navigation */}
          <div className="md:hidden">
            <BottomNav />
          </div>
        </AmplifyProvider>
      </body>
    </html>
  );
}
