import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the authed db helper so the routes run without real Supabase auth.
const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: () => getAuthedDb(),
}));

// Build a chainable Supabase-query stub whose terminal call resolves to `result`.
// `terminal` names the final method that returns the awaited result.
function makeQuery(result: any, terminal: 'limit' | 'single' | 'order') {
  const q: any = {};
  for (const m of ['select', 'order', 'limit', 'eq', 'single']) {
    q[m] = vi.fn(() => q);
  }
  q[terminal] = vi.fn(() => Promise.resolve(result));
  return q;
}

let conversationsApp: typeof import('./conversations').conversationsApp;

beforeEach(async () => {
  vi.resetModules();
  getAuthedDb.mockReset();
  ({ conversationsApp } = await import('./conversations'));
});

describe('GET /api/conversations', () => {
  it('returns the user rows under conversations', async () => {
    const rows = [
      { id: 'c1', mode: 'build', title: 'A', app_id: null, updated_at: '2', created_at: '1' },
    ];
    const db = { from: vi.fn(() => makeQuery({ data: rows, error: null }, 'limit')) };
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });

    const res = await conversationsApp.request('/api/conversations');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: rows });
  });

  it('401 when no user', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await conversationsApp.request('/api/conversations');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/conversations/:id', () => {
  it('returns one thread for the owner', async () => {
    const convo = { id: 'c1', user_id: 'u1', mode: 'chat', app_id: 'a1' };
    const messages = [{ role: 'user', content: 'hi', meta: null, created_at: '1' }];
    const db = {
      from: vi.fn((table: string) =>
        table === 'conversations'
          ? makeQuery({ data: convo, error: null }, 'single')
          : makeQuery({ data: messages, error: null }, 'order')
      ),
    };
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });

    const res = await conversationsApp.request('/api/conversations/c1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'chat', app_id: 'a1', messages });
  });

  it('403 when the conversation belongs to another user', async () => {
    const convo = { id: 'c1', user_id: 'other', mode: 'chat', app_id: 'a1' };
    const db = { from: vi.fn(() => makeQuery({ data: convo, error: null }, 'single')) };
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });

    const res = await conversationsApp.request('/api/conversations/c1');
    expect(res.status).toBe(403);
  });
});
