import { it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

afterEach(() => cleanup());

it('renders the landing marker on /', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('landing-route')).toBeTruthy();
});

it('renders the auth marker on /auth', () => {
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('auth-route')).toBeTruthy();
});
