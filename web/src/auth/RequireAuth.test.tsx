import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './RequireAuth';

// Mock getSupabase — returns a controllable getSession stub
const getSessionMock = vi.fn();
vi.mock('@/web/src/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

function renderGuarded(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth" element={<div data-testid="auth-page">Auth</div>} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <div data-testid="dashboard">Dashboard</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    cleanup();
    getSessionMock.mockReset();
  });

  it('renders children when a session exists', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    renderGuarded('/dashboard');
    expect(await screen.findByTestId('dashboard')).toBeTruthy();
  });

  it('redirects to /auth when no session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    renderGuarded('/dashboard');
    expect(await screen.findByTestId('auth-page')).toBeTruthy();
  });

  it('shows a loading state while checking session', async () => {
    // Use a promise that never resolves — but we need to prevent act() from
    // flushing previous test state. Reset and render fresh.
    let resolve: (v: any) => void;
    getSessionMock.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { container } = renderGuarded('/dashboard');
    // Initial render: state is 'loading', component returns null
    // But act() in render may flush the microtask. Since the promise never
    // resolves, setState never fires, so we should see neither page.
    // If the container only has the router wrapper with no matched content:
    expect(screen.queryByTestId('dashboard')).toBeNull();
    expect(screen.queryByTestId('auth-page')).toBeNull();

    // Clean up: resolve to avoid dangling promise warning
    resolve!({ data: { session: null } });
  });
});
