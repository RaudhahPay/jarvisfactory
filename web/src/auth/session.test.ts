import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccessToken } from './session';
import { supabase } from '@/web/src/lib/supabase';

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the session access_token when a session exists', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'tok-123' } },
      error: null,
    } as never);

    await expect(getAccessToken()).resolves.toBe('tok-123');
  });

  it('returns undefined when there is no session', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    await expect(getAccessToken()).resolves.toBeUndefined();
  });
});
