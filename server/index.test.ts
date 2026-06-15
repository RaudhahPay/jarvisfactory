import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('hono server', () => {
  it('GET /api/health returns 200 { ok: true }', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('serves SPA index.html fallback for unknown routes', async () => {
    const res = await app.request('/unknown');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<!doctype html>');
    expect(body).toContain('<div id="root">');
  });

  it('unmatched /api/* returns a 404 JSON, not the SPA shell', async () => {
    const res = await app.request('/api/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('<div id="root">');
  });
});
