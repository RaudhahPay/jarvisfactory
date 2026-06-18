import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub driver (in-memory, no network) + mocked identity/metering.
delete process.env.SANDBOX_PROVIDER;
delete process.env.BL_API_KEY;
process.env.ANTHROPIC_API_KEY = 'test-key';

const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: (authHeader?: string | null) => getAuthedDb(authHeader),
}));
vi.mock('@/lib/metering', () => ({
  checkQuota: () => ({ ok: true }),
  recordUsage: () => Promise.resolve(),
}));

import { codeBuildApp } from './code.build';

const APP_JSON = JSON.stringify({ files: [{ path: 'src/App.jsx', content: 'export default function App(){return <h1>Todo</h1>}' }] });

function mockAnthropic() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ content: [{ type: 'text', text: APP_JSON }], usage: { input_tokens: 10, output_tokens: 20 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )));
}

describe('POST /api/code/build', () => {
  beforeEach(() => { getAuthedDb.mockReset(); mockAnthropic(); });
  afterEach(() => vi.unstubAllGlobals());

  it('401 without a valid Bearer', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await codeBuildApp.request('/api/code/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'p1', prompt: 'a todo app' }),
    });
    expect(res.status).toBe(401);
  });

  it('400 when prompt is missing', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1' }),
    });
    expect(res.status).toBe(400);
  });

  it('generates HTML, runs it, returns a preview URL', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', prompt: 'a todo app with add and delete' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.previewUrl).toMatch(/^https?:\/\//);
    // Merged tree includes base template + generated app source.
    expect(json.files.some((f: any) => f.path === 'src/App.jsx')).toBe(true);
    expect(json.files.some((f: any) => f.path === 'package.json')).toBe(true);
    expect(json.provider).toBe('stub');
  });
});
