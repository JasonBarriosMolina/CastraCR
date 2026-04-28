'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth';
import type { UserRole } from '@castrar-cr/types';

export interface AuthState {
  email: string | null;
  nombre: string | null;
  role: UserRole | null;
  roles: UserRole[];
  isSuperAdmin: boolean;
  isOrganizador: boolean;
  loading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({
    email: null,
    nombre: null,
    role: null,
    roles: [],
    isSuperAdmin: false,
    isOrganizador: false,
    loading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAuth() {
      try {
        const [user, session] = await Promise.all([
          getCurrentUser(),
          fetchAuthSession(),
        ]);

        const payload = session.tokens?.idToken?.payload ?? {};
        const groups = (payload['cognito:groups'] as string[] | undefined) ?? [];
        const nombre = (payload['name'] as string | undefined) ?? null;
        const roles = groups as UserRole[];
        const role = roles[0] ?? null;

        if (!cancelled) {
          setState({
            email: user.signInDetails?.loginId ?? null,
            nombre,
            role,
            roles,
            isSuperAdmin: roles.includes('SuperAdmin'),
            isOrganizador: roles.includes('Organizador'),
            loading: false,
            isAuthenticated: true,
          });
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, isAuthenticated: false }));
        }
      }
    }

    void loadAuth();
    return () => { cancelled = true; };
  }, []);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    window.location.href = '/login';
  }, []);

  return { ...state, signOut };
}
