import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccessToken } from './session';

// Mock the lazy accessor so no real `createBrowserClient` is constructed (which
// would throw on missing VITE_* env). We only need `auth.getSession` stubbed.
const getSession = vi.fn();
vi.mock('@/web/src/lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

describe('getAccessToken', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it('returns the session access_token when a session exists', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'tok-123' } },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe('tok-123');
  });

  it('returns undefined when there is no session', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBeUndefined();
  });
});
