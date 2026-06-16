import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('loadServerEnv', () => {
  const saved: Record<string, string | undefined> = {};
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Also clear legacy names to avoid fallback
    for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns env values when both are set', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'pk_test';
    const { loadServerEnv } = await import('./config');
    const env = loadServerEnv();
    expect(env.supabaseUrl).toBe('https://test.supabase.co');
    expect(env.supabasePublishableKey).toBe('pk_test');
  });

  it('throws when SUPABASE_URL is missing', async () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'pk_test';
    const { loadServerEnv } = await import('./config');
    expect(() => loadServerEnv()).toThrow('SUPABASE_URL');
  });

  it('throws when SUPABASE_PUBLISHABLE_KEY is missing', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    const { loadServerEnv } = await import('./config');
    expect(() => loadServerEnv()).toThrow('SUPABASE_PUBLISHABLE_KEY');
  });
});
