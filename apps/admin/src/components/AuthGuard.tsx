'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@castrar-cr/types';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({
  children,
  allowedRoles = ['SuperAdmin', 'Organizador'],
}: AuthGuardProps) {
  const { isAuthenticated, roles, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    const hasAccess = allowedRoles.some((r) => roles.includes(r));
    if (!hasAccess) {
      router.replace('/login?error=unauthorized');
    }
  }, [loading, isAuthenticated, roles, allowedRoles, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="space-y-3 w-48">
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const hasAccess = allowedRoles.some((r) => roles.includes(r));
  if (!hasAccess) return null;

  return <>{children}</>;
}
