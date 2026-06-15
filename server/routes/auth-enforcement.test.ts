import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// Task C2 — bearer auth enforcement across all protected routes.
// Every protected route now flows through requireUser(c), which reads the
// Authorization header, calls getAuthedDb(authHeader), and THROWS HTTPException(401)
// when no user. We mock getAuthedDb to toggle the user, then assert:
//   - no/invalid Bearer (user:null)  → 401
//   - valid Bearer    (user:{id})    → NOT 401 (reaches the handler body)
// ============================================================

const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: (h?: string) => getAuthedDb(h),
}));
vi.mock('@/lib/agent/policy', () => ({
  validatePrompt: () => ({ ok: true, value: 'hi' }),
}));
vi.mock('@/lib/metering', () => ({
  checkQuota: () => ({ ok: true }),
  recordUsage: () => Promise.resolve(),
}));
vi.mock('@/lib/models', () => ({
  resolveModel: () => 'claude-sonnet-4-6',
}));

// Chainable Supabase-query stub: every method returns the same object; awaiting
// any terminal resolves to a benign row so handler bodies don't crash.
function makeDb() {
  const db: any = {
    from: vi.fn(() => q),
  };
  const q: any = {};
  q.insert = vi.fn(() => q);
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  q.update = vi.fn(() => q);
  q.single = vi.fn(() => Promise.resolve({ data: { id: 'x', user_id: 'u1' }, error: null }));
  return db;
}

const prevProvider = process.env.SANDBOX_PROVIDER;
const prevRunner = process.env.AGENT_RUNNER;

type RouteCase = {
  name: string;
  load: () => Promise<{ app: { request: (...a: any[]) => Promise<Response> } }>;
  request: (app: any) => Promise<Response>;
};

const cases: RouteCase[] = [
  {
    name: 'agent.chat',
    load: async () => ({ app: (await import('./agent.chat')).agentChatApp }),
    request: (app) =>
      app.request('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ message: 'hi' }),
      }),
  },
  {
    name: 'agent.cowork',
    load: async () => ({ app: (await import('./agent.cowork')).agentCoworkApp }),
    request: (app) =>
      app.request('/api/agent/cowork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ task: 'x' }),
      }),
  },
  {
    name: 'agent.file',
    load: async () => ({ app: (await import('./agent.file')).agentFileApp }),
    request: (app) =>
      app.request('/api/agent/file?appId=a1&path=out.txt', {
        headers: { Authorization: 'Bearer t' },
      }),
  },
  {
    name: 'build',
    load: async () => ({ app: (await import('./build')).buildApp }),
    request: (app) =>
      app.request('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ appId: 'a1', prompt: 'p' }),
      }),
  },
  {
    name: 'conversations (list)',
    load: async () => ({ app: (await import('./conversations')).conversationsApp }),
    request: (app) =>
      app.request('/api/conversations', { headers: { Authorization: 'Bearer t' } }),
  },
  {
    name: 'conversations (:id)',
    load: async () => ({ app: (await import('./conversations')).conversationsApp }),
    request: (app) =>
      app.request('/api/conversations/c1', { headers: { Authorization: 'Bearer t' } }),
  },
  {
    name: 'chat',
    load: async () => ({ app: (await import('./chat')).chatApp }),
    request: (app) =>
      app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      }),
  },
];

beforeEach(() => {
  vi.resetModules();
  getAuthedDb.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test';
  delete process.env.SANDBOX_PROVIDER; // → StubSandboxDriver
  process.env.AGENT_RUNNER = 'stub'; // → StubAgentRunner
  // global fetch for the proxy/agent paths so the non-401 path is reachable.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }) as any
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevProvider === undefined) delete process.env.SANDBOX_PROVIDER;
  else process.env.SANDBOX_PROVIDER = prevProvider;
  if (prevRunner === undefined) delete process.env.AGENT_RUNNER;
  else process.env.AGENT_RUNNER = prevRunner;
});

describe('bearer auth enforcement', () => {
  for (const tc of cases) {
    it(`${tc.name}: 401 when no user`, async () => {
      getAuthedDb.mockResolvedValue({ user: null, db: makeDb() });
      const { app } = await tc.load();
      const res = await tc.request(app);
      expect(res.status).toBe(401);
    });

    it(`${tc.name}: not 401 when authenticated`, async () => {
      getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: makeDb() });
      const { app } = await tc.load();
      const res = await tc.request(app);
      expect(res.status).not.toBe(401);
    });
  }
});
