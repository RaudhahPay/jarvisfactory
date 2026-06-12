import { supabase } from '@/web/src/lib/supabase';

/**
 * Returns the current Supabase session's `access_token`, or `undefined` when
 * there is no active session. Used by `apiFetch` (Task A3) to attach the
 * `Authorization: Bearer <jwt>` header on API calls.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
