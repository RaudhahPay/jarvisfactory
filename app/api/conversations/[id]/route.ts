// ============================================================
// ezclaude — load one conversation's thread (history reload)
// ============================================================
// GET /api/conversations/:id → { mode, app_id, messages: [{ role, content, meta }] }.
// RLS-scoped; the conversation + its messages are filtered to the owner.
// ============================================================

import { NextRequest } from 'next/server'
import { getAuthedDb } from '@/lib/supabase/authed'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, db } = await getAuthedDb()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: convo } = await db.from('conversations').select('id, user_id, mode, app_id').eq('id', params.id).single()
  if (!convo) return Response.json({ error: 'Not found' }, { status: 404 })
  if (convo.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { data: messages } = await db
    .from('messages')
    .select('role, content, meta, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true })

  return Response.json({ mode: convo.mode, app_id: convo.app_id, messages: messages || [] })
}
