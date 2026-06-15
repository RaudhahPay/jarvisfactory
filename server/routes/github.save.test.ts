import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthedDb = vi.fn();

vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: (authHeader?: string | null) => getAuthedDb(authHeader),
}));

// Chainable db stub.
//   from('user_github_connections')...single() -> { data: conn }
//   from('apps')...single()                    -> { data: app }
//   .update(...).eq(...)                        -> resolves
function makeDb(conn: any, app: any) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_github_connections') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: conn })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({})) })),
        };
      }
      // apps
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: app })),
          })),
        })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({})) })),
      };
    }),
  };
}

let githubSaveApp: typeof import('./github.save').githubSaveApp;

beforeEach(async () => {
  vi.resetModules();
  getAuthedDb.mockReset();
  vi.useFakeTimers();
  ({ githubSaveApp } = await import('./github.save'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function post(app: any, path: string, body: any, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/github/save', () => {
  it('401 when no Bearer (no user)', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await post(githubSaveApp, '/api/github/save', { app_id: 'a1' });
    expect(res.status).toBe(401);
  });

  it('200 { ok, repo_url, action:created } on the create path', async () => {
    const conn = { access_token: 'ghtok', github_username: 'u1' };
    const app = {
      id: 'a1',
      user_id: 'u1',
      name: 'My App',
      description: 'desc',
      html_code: '<html>'.padEnd(200, 'x') + '</html>',
      proposal_data: {},
      github_repo_url: null,
      github_repo_full_name: null,
    };
    const db = makeDb(conn, app);
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });

    const fetchMock = vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.endsWith('/user/repos')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ full_name: 'u1/repo', html_url: 'https://github.com/u1/repo' }),
        } as any;
      }
      // README GET (sha lookup) + README/index.html PUTs
      return { ok: true, status: 200, json: async () => ({ sha: 'sha1' }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const resP = post(githubSaveApp, '/api/github/save', { app_id: 'a1' }, {
      authorization: 'Bearer ghtok',
    });
    await vi.runAllTimersAsync();
    const res = await resP;

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.repo_url).toBe('https://github.com/u1/repo');
    expect(json.action).toBe('created');
  });
});
