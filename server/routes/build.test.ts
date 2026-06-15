import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use the REAL stub sandbox driver + stub agent runner (in-memory, offline) — verified
// against lib/sandbox/stub-driver.ts + lib/agent/stub-runner.ts. Force the stub runner
// and stub driver via env so getAgentRunner()/getSandboxDriver() never touch the network.
const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: () => getAuthedDb(),
}));
vi.mock('@/lib/agent/policy', () => ({
  validatePrompt: () => ({ ok: true, value: 'build x' }),
}));
vi.mock('@/lib/metering', () => ({
  checkQuota: () => ({ ok: true }),
  recordUsage: () => Promise.resolve(),
}));
vi.mock('@/lib/models', () => ({
  resolveModel: () => 'claude-sonnet-4-6',
}));

function makeDb(buildJobInsert: ReturnType<typeof vi.fn>) {
  const app = { id: 'a1', user_id: 'u1', sandbox_id: null, files_json: {}, html_code: null };
  const db: any = {
    from: vi.fn((table: string) => {
      const q: any = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn(() => q);
      q.update = vi.fn(() => q);
      if (table === 'build_jobs') {
        q.insert = vi.fn((row: any) => {
          buildJobInsert(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'job1' }, error: null }) }) };
        });
        q.single = vi.fn(() => Promise.resolve({ data: { id: 'job1' }, error: null }));
      } else {
        q.insert = vi.fn(() => q);
        q.single = vi.fn(() => Promise.resolve({ data: app, error: null }));
      }
      return q;
    }),
  };
  return db;
}

async function readFrames(res: Response): Promise<any[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((b) => b.split('\n').find((l) => l.startsWith('data: ')))
    .filter(Boolean)
    .map((l) => JSON.parse((l as string).slice(6)));
}

let buildApp: typeof import('./build').buildApp;
const prevProvider = process.env.SANDBOX_PROVIDER;
const prevRunner = process.env.AGENT_RUNNER;

beforeEach(async () => {
  vi.resetModules();
  getAuthedDb.mockReset();
  delete process.env.SANDBOX_PROVIDER; // → StubSandboxDriver
  process.env.AGENT_RUNNER = 'stub'; // → StubAgentRunner
  ({ buildApp } = await import('./build'));
});

afterEach(() => {
  if (prevProvider === undefined) delete process.env.SANDBOX_PROVIDER;
  else process.env.SANDBOX_PROVIDER = prevProvider;
  if (prevRunner === undefined) delete process.env.AGENT_RUNNER;
  else process.env.AGENT_RUNNER = prevRunner;
});

describe('POST /api/build', () => {
  it('streams agent events, inserts a build_jobs row, and emits a terminal frame', async () => {
    const buildJobInsert = vi.fn();
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: makeDb(buildJobInsert) });

    const res = await buildApp.request('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'a1', prompt: 'build x' }),
    });
    expect(res.status).toBe(200);

    const frames = await readFrames(res);
    const types = frames.map((f) => f.type);
    // The stub runner emits these labels (verified in lib/agent/stub-runner.ts).
    expect(types).toContain('thinking');
    expect(types).toContain('file_edit');
    expect(types).toContain('done');

    expect(buildJobInsert).toHaveBeenCalledTimes(1);
    expect(buildJobInsert.mock.calls[0][0]).toMatchObject({ app_id: 'a1', status: 'running' });
  });

  it('400 when appId missing', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: makeDb(vi.fn()) });
    const res = await buildApp.request('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'build x' }),
    });
    expect(res.status).toBe(400);
  });

  it('401 when no user', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await buildApp.request('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'a1', prompt: 'build x' }),
    });
    expect(res.status).toBe(401);
  });
});
