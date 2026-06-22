import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub sandbox driver (in-memory, no network) + mocked identity/metering.
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

// Fake agent runner: writes src/App.jsx into the (real stub) sandbox and emits a
// realistic event tail — exercises the build orchestration without the real SDK.
const runnerStart = vi.fn(async (sandbox: any, opts: any) => {
  await sandbox.writeFiles([{ path: 'src/App.jsx', content: 'export default function App(){return <h1>Todo</h1>}' }]);
  opts.onEvent({ type: 'file_edit', path: 'src/App.jsx', action: 'create' });
  opts.onEvent({ type: 'exec', command: 'npm install date-fns' });
  opts.onEvent({ type: 'usage', inputTokens: 10, outputTokens: 20, model: 'claude-sonnet-4-6', costUsd: 0.001 });
  opts.onEvent({ type: 'done', reason: 'end_turn' });
  return { projectId: opts.projectId, sandboxId: sandbox.id, send: async () => {}, interrupt() {}, close: async () => {} };
});
vi.mock('@/lib/agent', () => ({ getAgentRunner: async () => ({ start: runnerStart }) }));

import { codeBuildApp } from './code.build';

function sseEvents(text: string) {
  return text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5).trim()));
}

describe('POST /api/code/build (Agent SDK engine)', () => {
  beforeEach(() => { getAuthedDb.mockReset(); runnerStart.mockClear(); });
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

  it('drives the agent, streams its activity, then runs the dev server', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', prompt: 'a todo app with add and delete' }),
    });
    expect(res.status).toBe(200);
    expect(runnerStart).toHaveBeenCalledOnce();

    const events = sseEvents(await res.text());
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).toContain('generating');
    expect(phases).toContain('installing');
    expect(phases).toContain('ready');

    // Real agent activity surfaced to the chat.
    expect(events.some((e) => e.type === 'agent' && e.kind === 'file_edit')).toBe(true);
    expect(events.some((e) => e.type === 'agent' && e.kind === 'exec')).toBe(true);

    // Snapshot includes the base template + the agent's src/App.jsx.
    const filesEvt = events.find((e) => e.type === 'files');
    expect(filesEvt.files.some((f: any) => f.path === 'src/App.jsx')).toBe(true);
    expect(filesEvt.files.some((f: any) => f.path === 'package.json')).toBe(true);

    const done = events.find((e) => e.type === 'done');
    expect(done.previewUrl).toMatch(/^https?:\/\//);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
});

describe('POST /api/code/run (resume — no model)', () => {
  beforeEach(() => { getAuthedDb.mockReset(); runnerStart.mockClear(); });

  it('resumes saved files WITHOUT invoking the agent', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', appFiles: [{ path: 'src/App.jsx', content: 'export default ()=>null' }] }),
    });
    expect(res.status).toBe(200);

    const events = sseEvents(await res.text());
    const phases = events.filter((e) => e.type === 'phase').map((e) => e.phase);
    expect(phases).not.toContain('generating');
    expect(phases).toContain('ready');
    expect(events.find((e) => e.type === 'done').previewUrl).toMatch(/^https?:\/\//);
    expect(runnerStart).not.toHaveBeenCalled(); // proves no agent/model on resume
  });

  it('400s when there is no saved source', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await codeBuildApp.request('/api/code/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
      body: JSON.stringify({ projectId: 'p1', appFiles: [] }),
    });
    expect(res.status).toBe(400);
  });
});
