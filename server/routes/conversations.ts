// ============================================================
// ezclaude — conversation history routes (ported from Next.js)
// ============================================================
// GET /api/conversations       → list the signed-in user's threads (newest first)
// GET /api/conversations/:id    → load one thread { mode, app_id, messages }
// RLS-scoped via getAuthedDb; a user only ever sees their own threads.
// NOTE (B3): auth still flows through getAuthedDb (next/headers under the hood).
// Task C1/C2 rewrites this to requireUser(c). Tests mock getAuthedDb.
// ============================================================

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';

const conversationsApp = new Hono();

conversationsApp.get('/api/conversations', async (c) => {
  const { db } = await requireUser(c);

  const { data, error } = await db
    .from('conversations')
    .select('id, mode, title, app_id, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ conversations: data || [] });
});

conversationsApp.get('/api/conversations/:id', async (c) => {
  const id = c.req.param('id');
  const { user, db } = await requireUser(c);

  const { data: convo } = await db
    .from('conversations')
    .select('id, user_id, mode, app_id')
    .eq('id', id)
    .single();
  if (!convo) return c.json({ error: 'Not found' }, 404);
  if (convo.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);

  const { data: messages } = await db
    .from('messages')
    .select('role, content, meta, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  return c.json({ mode: convo.mode, app_id: convo.app_id, messages: messages || [] });
});

export { conversationsApp };
