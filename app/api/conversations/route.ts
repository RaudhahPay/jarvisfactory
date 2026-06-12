// ============================================================
// ezclaude — list the signed-in user's conversations (history sidebar)
// ============================================================
// GET /api/conversations → [{ id, mode, title, app_id, updated_at }] newest first.
// RLS-scoped via getAuthedDb; a user only ever sees their own threads.
// ============================================================

import { getAuthedDb } from '@/lib/supabase/authed'

export const runtime = 'nodejs'

export async function GET() {
  const { user, db } = await getAuthedDb()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await db
    .from('conversations')
    .select('id, mode, title, app_id, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ conversations: data || [] })
}
