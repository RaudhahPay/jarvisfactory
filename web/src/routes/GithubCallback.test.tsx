import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { apiFetch, navigate } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/web/src/lib/api', () => ({ apiFetch }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => navigate };
});

import GithubCallback from './GithubCallback';

beforeEach(() => {
  window.history.replaceState({}, '', '/auth/github/callback?code=abc');
});

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  navigate.mockReset();
});

describe('GithubCallback', () => {
  it('POSTs the code and navigates to /dashboard?github=connected on success', async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, username: 'octocat' }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <GithubCallback />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/github/oauth/exchange',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: 'abc' }),
        }),
      );
      expect(navigate).toHaveBeenCalledWith('/dashboard?github=connected&as=octocat');
    });
  });

  it('navigates with github_error when exchange fails', async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'no_token' }), { status: 502 }),
    );

    render(
      <MemoryRouter>
        <GithubCallback />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/dashboard?github_error=no_token');
    });
  });
});
