import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Studio loads the conversation list on mount. We assert it goes through
// `apiFetch` (the Bearer wrapper) rather than studio's old hand-rolled
// getSession/Bearer at app/studio/page.tsx:166-198.
const { apiFetch, getUser } = vi.hoisted(() => ({
  apiFetch: vi.fn(
    async () => new Response(JSON.stringify({ conversations: [] }), { status: 200 }),
  ),
  // The auth gate calls getUser(); return a user so Studio mounts past the loading screen.
  getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
}));
vi.mock('@/web/src/lib/api', () => ({ apiFetch }));

// Stub Supabase so rendering doesn't require real env.
vi.mock('@/web/src/lib/supabase', () => ({
  getSupabase: () => ({ auth: { getUser, getSession: async () => ({ data: { session: null } }) } }),
}));
vi.mock('@/web/src/auth/session', () => ({
  getAccessToken: async () => undefined,
}));

import Studio from './Studio';

afterEach(() => {
  cleanup();
  apiFetch.mockClear();
});

describe('Studio', () => {
  it('loads the conversation list through apiFetch', async () => {
    render(
      <MemoryRouter>
        <Studio />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/conversations', expect.anything());
    });
  });
});
