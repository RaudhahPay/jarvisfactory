import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthedDb = vi.fn();

vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: (authHeader?: string | null) => getAuthedDb(authHeader),
}));

let githubOauthApp: typeof import('./github.oauth').githubOauthApp;

beforeEach(async () => {
  vi.resetModules();
  getAuthedDb.mockReset();
  process.env.GITHUB_OAUTH_CLIENT_ID = 'cid';
  process.env.GITHUB_OAUTH_CLIENT_SECRET = 'csecret';
  ({ githubOauthApp } = await import('./github.oauth'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function post(app: any, path: string, body: any, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/github/oauth/exchange', () => {
  it('401 when no Bearer (no user)', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await post(githubOauthApp, '/api/github/oauth/exchange', { code: 'abc' });
    expect(res.status).toBe(401);
  });

  it('200 { ok, username } on the happy path and upserts the connection', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const db = { from: vi.fn(() => ({ upsert })) };
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });

    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('login/oauth/access_token')) {
        return { json: async () => ({ access_token: 'ght', scope: 'public_repo' }) } as any;
      }
      return { json: async () => ({ id: 123, login: 'octocat' }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await post(githubOauthApp, '/api/github/oauth/exchange', { code: 'abc' }, {
      authorization: 'Bearer jwt',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, username: 'octocat' });

    expect(db.from).toHaveBeenCalledWith('user_github_connections');
    const [row, opts] = upsert.mock.calls[0];
    expect(row.user_id).toBe('u1');
    expect(row.github_user_id).toBe(123);
    expect(row.github_username).toBe('octocat');
    expect(opts).toEqual({ onConflict: 'user_id' });
  });

  it('400 when code missing', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await post(githubOauthApp, '/api/github/oauth/exchange', {}, {
      authorization: 'Bearer jwt',
    });
    expect(res.status).toBe(400);
  });

  it('500 server_not_configured when env unset', async () => {
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await post(githubOauthApp, '/api/github/oauth/exchange', { code: 'abc' }, {
      authorization: 'Bearer jwt',
    });
    expect(res.status).toBe(500);
  });
});
