// ============================================================
// JARVISFACTORY v2 — authed Supabase access for server routes
// ============================================================
// IDENTITY SOURCE: a Bearer token (client-supplied). We validate it server-side
// via `supabase.auth.getUser(token)` (never trust the client beyond the verified
// token), then return the verified user PLUS a `db` client that forwards that same
// token explicitly, so RLS resolves to the user. Every server route that
// reads/writes the user's RLS-protected rows should use `db` for data ops.
//
// (Previously this read identity from the cookie session via @supabase/ssr +
// next/headers. That cookie path is removed — Hono routes carry a Bearer token.)
// ============================================================

import { createClient as createSb } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

export interface AuthedContext {
  user: User | null
  db: any // RLS-scoped to the user (token forwarded); token-less anon client if no user
}

// NOTE: Task D1 finalizes the rename to the server-side env names. Until then we
// read the new names with a fallback to the legacy NEXT_PUBLIC_* names so nothing
// breaks before D1.
function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!
}
function supabasePublishableKey(): string {
  return (process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!
}

function parseBearer(authHeader?: string | null): string | null {
  if (!authHeader) return null
  const h = authHeader.trim()
  if (!h.toLowerCase().startsWith('bearer ')) return null
  const token = h.slice(7).trim()
  return token || null
}

export async function getAuthedDb(
  authHeader?: string | null,
): Promise<AuthedContext> {
  const url = supabaseUrl()
  const key = supabasePublishableKey()

  const token = parseBearer(authHeader)
  if (!token) {
    // No usable token: token-less anon client, no user.
    const anon = createSb(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return { user: null, db: anon }
  }

  // Validate identity against Supabase Auth using the supplied token.
  const auth = createSb(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await auth.auth.getUser(token)
  if (error || !data?.user) {
    const anon = createSb(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return { user: null, db: anon }
  }

  // RLS-scoped client: forward the verified token on every data query.
  const db = createSb(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  return { user: data.user, db }
}
