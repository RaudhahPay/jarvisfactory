import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The Auth/Onboarding routes construct the Supabase browser client at render via
// `getSupabase()`, which requires VITE_* env vars. Stub it so route rendering
// stays an integration test of the router, not of Supabase config.
vi.mock('@/web/src/lib/supabase', () => ({
  getSupabase: () => ({}),
}));

import App from './App';

afterEach(() => cleanup());

it('renders the Landing page on /', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText('Build something real')).toBeTruthy();
});

it('renders the Auth page on /auth', () => {
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText('Create Account')).toBeTruthy();
});
