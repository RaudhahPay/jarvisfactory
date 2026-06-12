import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from './api';

// Stub the session helper so we control whether a token is present, without
// constructing a real Supabase client.
const getAccessToken = vi.fn();
vi.mock('@/web/src/auth/session', () => ({
  getAccessToken: () => getAccessToken(),
}));

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getAccessToken.mockReset();
    fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Pull the Headers object the wrapper actually sent to fetch.
  const sentHeaders = (): Headers => {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return new Headers(init.headers);
  };

  it('attaches Authorization: Bearer <token> when a token exists', async () => {
    getAccessToken.mockResolvedValue('tok');

    await apiFetch('/api/x');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/x');
    expect(sentHeaders().get('authorization')).toBe('Bearer tok');
  });

  it('sends no Authorization header when there is no token', async () => {
    getAccessToken.mockResolvedValue(undefined);

    await apiFetch('/api/x');

    expect(sentHeaders().has('authorization')).toBe(false);
  });

  it('preserves caller-provided headers (and does not clobber them)', async () => {
    getAccessToken.mockResolvedValue('tok');

    await apiFetch('/api/x', {
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'yes' },
    });

    const headers = sentHeaders();
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-custom')).toBe('yes');
    expect(headers.get('authorization')).toBe('Bearer tok');
  });

  it('passes through the rest of init untouched (signal, method, body)', async () => {
    getAccessToken.mockResolvedValue('tok');

    const controller = new AbortController();
    const body = new ReadableStream();

    await apiFetch('/api/x', {
      method: 'POST',
      signal: controller.signal,
      body,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(controller.signal);
    expect(init.body).toBe(body);
  });

  it('returns the fetch Response as-is without consuming the body', async () => {
    getAccessToken.mockResolvedValue(undefined);
    const response = new Response('stream-me');
    fetchMock.mockResolvedValue(response);

    const result = await apiFetch('/api/x');

    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
  });
});
