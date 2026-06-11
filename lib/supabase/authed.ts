// ============================================================
// JARVISFACTORY v2 — authed Supabase access for server routes
// ============================================================
// @supabase/ssr's server client validates the session (getUser) but does NOT reliably
// attach the user JWT to *data* queries here, so RLS sees 'anon' and hides the user's
// own rows. This helper returns the verified user PLUS a `db` client that forwards the
// user's token explicitly, so RLS resolves to them. Every server route that reads/writes
// the user's RLS-protected rows should use `db` (not the raw ssr client) for data ops.
// ============================================================

import { createClient as createSb } from '@supabase/supabase-js'
import { createClient as createSsr } from '@/utils/supabase/server'
import type { User } from '@supabase/supabase-js'

export interface AuthedContext {
  user: User | null
  db: any // RLS-scoped to the user (token forwarded); falls back to ssr if no token
  ssr: any // the @supabase/ssr client — use only for auth (getUser/getSession)
}

export async function getAuthedDb(): Promise<AuthedContext> {
  const ssr = await createSsr()
  const {
    data: { user },
  } = await ssr.auth.getUser()
  if (!user) return { user: null, db: ssr, ssr }

  const {
    data: { session },
  } = await ssr.auth.getSession()
  const accessToken = session?.access_token
  const db = accessToken
    ? createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      })
    : ssr

  return { user, db, ssr }
}
