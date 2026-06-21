// ============================================================
// ezclaude — durable Code-section projects (v16)
// ============================================================
// CRUD for the v2 Code builder's projects, backed by the `code_projects` table
// (RLS-scoped per user). Owns the generated app SOURCE (app_files) so reopening a
// project on any device resumes via /api/code/run with no model call.
//   GET    /api/code/projects        → list (light: no app_files)
//   POST   /api/code/projects        → create { prompt, name? }
//   GET    /api/code/projects/:id    → one project incl. app_files
//   PATCH  /api/code/projects/:id    → update name/slug/starred/published/app_files
//   DELETE /api/code/projects/:id    → delete
// ============================================================

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';

const codeProjectsApp = new Hono();

const LIST_COLS = 'id, name, prompt, slug, published, published_url, starred, created_at, updated_at';
const FULL_COLS = `${LIST_COLS}, app_files`;

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}
function nameFromPrompt(prompt: string): string {
  const t = (prompt || '').trim().replace(/\s+/g, ' ');
  return t.length <= 40 ? (t || 'Untitled app') : t.slice(0, 40) + '…';
}

/** Find a slug not already used by this user. */
async function uniqueSlug(db: any, userId: string, seed: string): Promise<string> {
  const base = slugify(seed) || 'app';
  const { data } = await db.from('code_projects').select('slug').eq('user_id', userId);
  const taken = new Set((data || []).map((r: any) => r.slug).filter(Boolean));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base}-${i}`.slice(0, 63);
    if (!taken.has(cand)) return cand;
  }
  return `${base}-${Date.now().toString(36)}`;
}

codeProjectsApp.get('/api/code/projects', async (c) => {
  const { db } = await requireUser(c);
  const { data, error } = await db
    .from('code_projects').select(LIST_COLS).order('updated_at', { ascending: false }).limit(200);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ projects: data || [] });
});

codeProjectsApp.post('/api/code/projects', async (c) => {
  const { user, db } = await requireUser(c);
  let body: any = {};
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return c.json({ error: 'prompt required' }, 400);
  if (prompt.length > 5000) return c.json({ error: 'prompt too long' }, 400);

  const name = (typeof body?.name === 'string' && body.name.trim()) || nameFromPrompt(prompt);
  const slug = await uniqueSlug(db, user.id, name);

  const { data, error } = await db
    .from('code_projects')
    .insert({ user_id: user.id, name, prompt, slug })
    .select(FULL_COLS).single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ project: data }, 201);
});

codeProjectsApp.get('/api/code/projects/:id', async (c) => {
  const { db } = await requireUser(c);
  const { data, error } = await db
    .from('code_projects').select(FULL_COLS).eq('id', c.req.param('id')).maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: 'Not found' }, 404);
  return c.json({ project: data });
});

codeProjectsApp.patch('/api/code/projects/:id', async (c) => {
  const { db } = await requireUser(c);
  const id = c.req.param('id');
  let body: any = {};
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  // Allow-list the fields a client may patch.
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 200);
  if (typeof body.slug === 'string') patch.slug = slugify(body.slug);
  if (typeof body.starred === 'boolean') patch.starred = body.starred;
  if (typeof body.published === 'boolean') patch.published = body.published;
  if (typeof body.published_url === 'string') patch.published_url = body.published_url.slice(0, 500);
  if (Array.isArray(body.app_files)) {
    patch.app_files = body.app_files.filter((f: any) => typeof f?.path === 'string' && typeof f?.content === 'string');
  }
  if (Object.keys(patch).length === 0) return c.json({ error: 'no valid fields' }, 400);

  const { data, error } = await db
    .from('code_projects').update(patch).eq('id', id).select(FULL_COLS).maybeSingle();
  if (error) {
    if ((error.code === '23505') || /duplicate|unique/i.test(error.message || '')) {
      return c.json({ error: 'That URL is already taken' }, 409);
    }
    return c.json({ error: error.message }, 500);
  }
  if (!data) return c.json({ error: 'Not found' }, 404);
  return c.json({ project: data });
});

codeProjectsApp.delete('/api/code/projects/:id', async (c) => {
  const { db } = await requireUser(c);
  const { error } = await db.from('code_projects').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

export { codeProjectsApp };
