import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

// Capture every createClient call (config carries the forwarded headers).
const createClientCalls: any[] = [];
const getUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts?: any) => {
    createClientCalls.push({ url, key, opts });
    return {
      auth: {
        getUser: (token?: string) => getUser(token),
      },
    };
  },
}));

beforeEach(() => {
  createClientCalls.length = 0;
  getUser.mockReset();
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'pk_test';
  // Default: any token resolves to a user unless overridden.
  getUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
});

async function loadRequireUser() {
  const mod = await import('./auth');
  return mod.requireUser;
}

function ctxWithAuth(authHeader: string | undefined) {
  return {
    req: {
      header: (name: string) =>
        name.toLowerCase() === 'authorization' ? authHeader : undefined,
    },
  } as any;
}

describe('requireUser middleware', () => {
  it('returns { user, db } for a valid Bearer token', async () => {
    const requireUser = await loadRequireUser();
    const { user, db } = await requireUser(ctxWithAuth('Bearer good-token'));
    expect(user).toEqual({ id: 'user-1' });
    expect(db).toBeTruthy();
    expect(getUser).toHaveBeenCalledWith('good-token');
  });

  it('constructs the db client forwarding the Bearer token in global headers', async () => {
    const requireUser = await loadRequireUser();
    await requireUser(ctxWithAuth('Bearer good-token'));
    const forwarding = createClientCalls.find(
      (c) => c.opts?.global?.headers?.Authorization === 'Bearer good-token'
    );
    expect(forwarding).toBeTruthy();
  });

  it('throws HTTPException(401) when the Authorization header is missing', async () => {
    const requireUser = await loadRequireUser();
    await expect(requireUser(ctxWithAuth(undefined))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws HTTPException(401) for an empty header', async () => {
    const requireUser = await loadRequireUser();
    await expect(requireUser(ctxWithAuth(''))).rejects.toBeInstanceOf(
      HTTPException
    );
  });

  it('throws HTTPException(401) for a malformed header (no bearer prefix)', async () => {
    const requireUser = await loadRequireUser();
    await expect(requireUser(ctxWithAuth('foo'))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws HTTPException(401) for an expired/invalid token', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    });
    const requireUser = await loadRequireUser();
    await expect(
      requireUser(ctxWithAuth('Bearer expired'))
    ).rejects.toMatchObject({ status: 401 });
  });

  it('works as a real Hono route -> 401 without token, 200 with token', async () => {
    const requireUser = await loadRequireUser();
    const app = new Hono();
    app.get('/protected', async (c) => {
      const { user } = await requireUser(c);
      return c.json({ id: user!.id });
    });

    const unauth = await app.request('/protected');
    expect(unauth.status).toBe(401);

    const authed = await app.request('/protected', {
      headers: { authorization: 'Bearer good-token' },
    });
    expect(authed.status).toBe(200);
    expect(await authed.json()).toEqual({ id: 'user-1' });
  });
});
