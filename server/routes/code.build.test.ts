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

  it('streams build phases, generates files, returns a preview URL', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', prompt: 'a todo app with add and delete' }),
    });
    expect(res.status).toBe(200);

    // Parse the SSE stream into build events.
    const text = await res.text();
    const events = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => JSON.parse(l.slice(5).trim()));

    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toContain('generating');
    expect(phases).toContain('installing');
    expect(phases).toContain('ready');

    const filesEvt = events.find((e) => e.type === 'files');
    expect(filesEvt.files.some((f: any) => f.path === 'src/App.jsx')).toBe(true);
    expect(filesEvt.files.some((f: any) => f.path === 'package.json')).toBe(true);

    const done = events.find((e) => e.type === 'done');
    expect(done.previewUrl).toMatch(/^https?:\/\//);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('POST /api/code/run resumes saved files WITHOUT calling the model', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy); // any model call would blow up the test

    const res = await codeBuildApp.request('/api/code/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', appFiles: [{ path: 'src/App.jsx', content: 'export default ()=>null' }] }),
    });
    expect(res.status).toBe(200);

    const events = (await res.text())
      .split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5).trim()));
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).not.toContain('generating'); // no model phase on resume
    expect(phases).toContain('ready');
    expect(events.find((e) => e.type === 'done').previewUrl).toMatch(/^https?:\/\//);
    expect(fetchSpy).not.toHaveBeenCalled(); // proves no Anthropic call
  });

  it('POST /api/code/run 400s when there is no saved source', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', appFiles: [] }),
    });
    expect(res.status).toBe(400);
  });
});
