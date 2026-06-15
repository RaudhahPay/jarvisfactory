import { getAccessToken } from '@/web/src/auth/session';
import { getSupabase } from '@/web/src/lib/supabase';

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  const token = await getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401) {
    await getSupabase().auth.signOut();
    window.location.href = '/auth';
  }

  return res;
}
