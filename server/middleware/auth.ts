// ============================================================
// requireUser — Hono auth gate (Bearer-only)
// ============================================================
// CONTRACT (consumed by route handlers, e.g. Task C2):
//   - On success: RETURNS { user, db } where `db` is RLS-scoped to the user.
//   - On failure (missing/empty/malformed header, or invalid/expired token):
//     THROWS HTTPException(401). Hono converts a thrown HTTPException into a
//     401 response automatically, so callers can simply `await requireUser(c)`.
// ============================================================

import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { User } from '@supabase/supabase-js'
import { getAuthedDb } from '@/lib/supabase/authed'

export async function requireUser(
  c: Context,
): Promise<{ user: User; db: any }> {
  const authHeader = c.req.header('authorization')
  const { user, db } = await getAuthedDb(authHeader)
  if (!user) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  return { user, db }
}
