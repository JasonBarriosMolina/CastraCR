'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface NavItem {
  href: string;
  label: string;
  superAdminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/campanas', label: '📋 Campañas' },
  { href: '/checkin', label: '📱 Check-in QR' },
  { href: '/vets', label: '🩺 Veterinarios' },
  { href: '/orgs', label: '🏠 Organizaciones', superAdminOnly: true },
  { href: '/usuarios', label: '👥 Usuarios', superAdminOnly: true },
];

const roleLabel: Record<string, string> = {
  SuperAdmin: 'Super Admin',
  Organizador: 'Organizador',
  Veterinario: 'Veterinario',
  Dueno: 'Dueño',
};

const roleBadgeColor: Record<string, string> = {
  SuperAdmin: 'bg-brand-100 text-brand-700',
  Organizador: 'bg-blue-100 text-blue-700',
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { email, nombre, role, isSuperAdmin, signOut } = useAuth();

  const visibleItems = navItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin,
  );

  const sidebarContent = (
    <aside className="w-56 h-full bg-white border-r flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐾</span>
          <h1 className="text-base font-bold text-brand-700">CastraCR</h1>
        </div>
        {/* Close button — solo visible en móvil */}
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Cerrar menú"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* User info */}
      {email && (
        <div className="px-4 py-3 border-b bg-gray-50">
          <p className="text-xs font-medium text-gray-800 truncate">
            {nombre ?? email}
          </p>
          <p className="text-xs text-gray-500 truncate">{email}</p>
          {role && (
            <span
              className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
                roleBadgeColor[role] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {roleLabel[role] ?? role}
            </span>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/campanas' && pathname.startsWith(item.href + '/')) ||
            (item.href === '/campanas' && (pathname === '/campanas' || pathname.startsWith('/campanas/')));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-4 border-t">
        <button
          onClick={signOut}
          className="w-full text-sm text-gray-500 hover:text-red-600 text-left transition-colors"
        >
          🚪 Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — siempre visible */}
      <div className="hidden md:flex shrink-0 min-h-screen">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onClose}
          />
          {/* Drawer */}
          <div className="relative z-50 flex h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
