import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthedDb = vi.fn();
vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: () => getAuthedDb(),
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

// Chainable Supabase query stub: every method returns the same object; awaiting
// any terminal (.single()/.order()) resolves to `result`.
function makeDb() {
  const inserted: any[] = [];
  const db: any = {
    _inserted: inserted,
    from: vi.fn(() => q),
  };
  const q: any = {};
  q.insert = vi.fn((row: any) => {
    inserted.push(row);
    return q;
  });
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.order = vi.fn(() => Promise.resolve({ data: [{ role: 'user', content: 'hi' }] }));
  q.update = vi.fn(() => q);
  q.single = vi.fn(() => Promise.resolve({ data: { id: 'conv1' }, error: null }));
  return db;
}

// Build a ReadableStream that emits the given SSE text chunks.
function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ch of chunks) controller.enqueue(enc.encode(ch));
      controller.close();
    },
  });
}

async function readFrames(res: Response): Promise<any[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((b) => b.split('\n').find((l) => l.startsWith('data: ')))
    .filter(Boolean)
    .map((l) => JSON.parse((l as string).slice(6)));
}

let agentChatApp: typeof import('./agent.chat').agentChatApp;

beforeEach(async () => {
  vi.resetModules();
  getAuthedDb.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test';
  ({ agentChatApp } = await import('./agent.chat'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/agent/chat', () => {
  it('streams conversation → text → done frames in order', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: makeDb() });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        sseStream([
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } })}\n\n`,
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } })}\n\n`,
          `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 5 } })}\n\n`,
        ]),
        { status: 200 }
      ) as any
    );

    const res = await agentChatApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(200);

    const frames = await readFrames(res);
    const types = frames.map((f) => f.type);
    expect(types[0]).toBe('conversation');
    expect(types).toContain('text');
    expect(types[types.length - 1]).toBe('done');
    // text frames carry the deltas, before done
    const textFrames = frames.filter((f) => f.type === 'text');
    expect(textFrames.length).toBeGreaterThanOrEqual(1);
    expect(textFrames.map((f) => f.text).join('')).toBe('Hello');
  });

  it('401 when no user', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await agentChatApp.request('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(res.status).toBe(401);
  });
});
