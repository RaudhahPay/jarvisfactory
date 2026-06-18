import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force the in-memory stub driver (no network) and mock identity.
delete process.env.SANDBOX_PROVIDER;
delete process.env.BL_API_KEY;

const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: (authHeader?: string | null) => getAuthedDb(authHeader),
}));

import { sandboxApp } from './sandbox';

describe('POST /api/sandbox/start', () => {
  beforeEach(() => getAuthedDb.mockReset());

  it('401 without a valid Bearer', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await sandboxApp.request('/api/sandbox/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'p1' }),
    });
    expect(res.status).toBe(401);
  });

  it('400 when projectId is missing', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await sandboxApp.request('/api/sandbox/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns a preview URL for a project (stub driver)', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await sandboxApp.request('/api/sandbox/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.previewUrl).toMatch(/^https?:\/\//);
    expect(json.provider).toBe('stub');
  });
});
