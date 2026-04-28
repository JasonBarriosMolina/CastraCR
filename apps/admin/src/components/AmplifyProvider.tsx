'use client';

import { useEffect } from 'react';
import '@/lib/amplify';

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {}, []);
  return <>{children}</>;
}
