import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock `useNavigate` so we can assert the primary CTA triggers navigation
// without a real router history. Keep the rest of react-router-dom intact.
const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

import Landing from './Landing';

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe('Landing', () => {
  it('renders the primary CTA', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByText('Get started')).toBeTruthy();
  });

  it('navigates to /auth when the primary CTA is clicked', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Get started'));
    expect(navigate).toHaveBeenCalledWith('/auth');
  });
});
