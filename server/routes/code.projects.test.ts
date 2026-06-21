import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: (authHeader?: string | null) => getAuthedDb(authHeader),
}));

import { codeProjectsApp } from './code.projects';

// ── Tiny in-memory fake of the Supabase query builder for `code_projects`. ──
function makeFakeDb(userId: string) {
  const rows: any[] = [];
  let seq = 0;
  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    const filters: Record<string, any> = {};
    const b: any = {
      select() { return b; },
      order() { return b; },
      limit() { return Promise.resolve({ data: rows.slice(), error: null }); },
      insert(o: any) { op = 'insert'; payload = o; return b; },
      update(o: any) { op = 'update'; payload = o; return b; },
      delete() { op = 'delete'; return b; },
      eq(col: string, val: any) {
        filters[col] = val;
        // uniqueSlug awaits `.select('slug').eq('user_id', id)` directly.
        if (op === 'select' && col === 'user_id') {
          return Promise.resolve({ data: rows.filter((r) => r.user_id === val), error: null });
        }
        return b;
      },
      single() { return finish(); },
      maybeSingle() { return finish(); },
    };
    function finish() {
      if (op === 'insert') {
        const row = { id: `p${++seq}`, app_files: [], published: false, starred: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        rows.push(row);
        return Promise.resolve({ data: row, error: null });
      }
      if (op === 'update') {
        const row = rows.find((r) => r.id === filters.id);
        if (!row) return Promise.resolve({ data: null, error: null });
        Object.assign(row, payload);
        return Promise.resolve({ data: row, error: null });
      }
      const row = rows.find((r) => r.id === filters.id);
      return Promise.resolve({ data: row || null, error: null });
    }
    return b;
  }
  return { from: (t: string) => builder(t), _rows: rows, _userId: userId };
}

describe('code_projects CRUD', () => {
  beforeEach(() => getAuthedDb.mockReset());

  it('401 without a valid Bearer', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await codeProjectsApp.request('/api/code/projects');
    expect(res.status).toBe(401);
  });

  it('400 creating without a prompt', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: makeFakeDb('u1') });
    const res = await codeProjectsApp.request('/api/code/projects', {
      method: 'POST', headers: { authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('creates a project with a derived slug, then lists + fetches it', async () => {
    const db = makeFakeDb('u1');
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });

    const created = await codeProjectsApp.request('/api/code/projects', {
      method: 'POST', headers: { authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a pomodoro timer' }),
    });
    expect(created.status).toBe(201);
    const { project } = await created.json();
    expect(project.slug).toBe('a-pomodoro-timer');
    expect(project.user_id).toBe('u1');

    const list = await codeProjectsApp.request('/api/code/projects', { headers: { authorization: 'Bearer t' } });
    expect((await list.json()).projects).toHaveLength(1);

    const one = await codeProjectsApp.request(`/api/code/projects/${project.id}`, { headers: { authorization: 'Bearer t' } });
    expect((await one.json()).project.id).toBe(project.id);
  });

  it('patches app_files (persisting generated source)', async () => {
    const db = makeFakeDb('u1');
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });
    const created = await codeProjectsApp.request('/api/code/projects', {
      method: 'POST', headers: { authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'todo app' }),
    });
    const { project } = await created.json();

    const patched = await codeProjectsApp.request(`/api/code/projects/${project.id}`, {
      method: 'PATCH', headers: { authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_files: [{ path: 'src/App.jsx', content: 'x' }], starred: true }),
    });
    expect(patched.status).toBe(200);
    const out = (await patched.json()).project;
    expect(out.starred).toBe(true);
    expect(out.app_files[0].path).toBe('src/App.jsx');
  });
});
