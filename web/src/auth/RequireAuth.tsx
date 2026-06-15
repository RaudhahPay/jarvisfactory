import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getSupabase } from '@/web/src/lib/supabase';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'authed' | 'unauthed'>('loading');

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        setState(data.session ? 'authed' : 'unauthed');
      });
  }, []);

  if (state === 'loading') return null;
  if (state === 'unauthed') return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
