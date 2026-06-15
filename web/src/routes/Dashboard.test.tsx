import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Dashboard's auth gate redirects unauthenticated visitors to /auth. The port to
// `useNavigate()` left 12 stale `router.push(...)` call sites — `router` is now
// undefined, so mounting Dashboard while signed out used to throw
// `ReferenceError: router is not defined` instead of navigating. This test mocks
// `useNavigate` and asserts the redirect actually calls `navigate('/auth')`,
// proving the crash is gone.
const { apiFetch, getUser, navigate } = vi.hoisted(() => ({
  apiFetch: vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
  // No user → the auth gate must redirect to /auth.
  getUser: vi.fn(async () => ({ data: { user: null } })),
  navigate: vi.fn(),
}));

vi.mock('@/web/src/lib/api', () => ({ apiFetch }));

// Stub Supabase so rendering doesn't require real env.
vi.mock('@/web/src/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getUser,
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => ({}),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
          maybeSingle: async () => ({ data: null }),
          order: async () => ({ data: [] }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/web/src/auth/session', () => ({
  getAccessToken: async () => undefined,
}));

// jarvis-memory pulls in supabase server bits; stub the one function Dashboard uses.
vi.mock('@/lib/jarvis-memory', () => ({
  countLessons: async () => 0,
}));

// Mock useNavigate so we can assert navigation happens (and doesn't throw).
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigate };
});

import Dashboard from './Dashboard';

afterEach(() => {
  cleanup();
  apiFetch.mockClear();
  navigate.mockClear();
});

describe('Dashboard', () => {
  it('redirects unauthenticated visitors to /auth via navigate (no undefined-router crash)', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/auth');
    });
  });
});
