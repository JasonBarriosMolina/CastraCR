'use client';

import { useEffect } from 'react';
import '@/lib/amplify';

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Amplify is configured on import; this component ensures it runs client-side
  }, []);

  return <>{children}</>;
}
