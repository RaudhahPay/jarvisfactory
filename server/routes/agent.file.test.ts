import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthedDb = vi.fn();
const getSandboxDriver = vi.fn();
const fetchDeliverable = vi.fn();

vi.mock('@/lib/supabase/authed', () => ({
  getAuthedDb: () => getAuthedDb(),
}));
vi.mock('@/lib/sandbox', () => ({
  getSandboxDriver: () => getSandboxDriver(),
}));
vi.mock('@/lib/sandbox/cloudflare-driver', () => ({
  fetchDeliverable: (key: string) => fetchDeliverable(key),
}));

// Chainable db stub whose apps query resolves to `app`.
function makeDb(app: any) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: app })),
        })),
      })),
    })),
  };
}

let agentFileApp: typeof import('./agent.file').agentFileApp;

beforeEach(async () => {
  vi.resetModules();
  getAuthedDb.mockReset();
  getSandboxDriver.mockReset();
  fetchDeliverable.mockReset();
  ({ agentFileApp } = await import('./agent.file'));
});

describe('GET /api/agent/file', () => {
  it('401 when no user', async () => {
    getAuthedDb.mockResolvedValue({ user: null, db: {} });
    const res = await agentFileApp.request('/api/agent/file?appId=a1&path=report.docx');
    expect(res.status).toBe(401);
  });

  it('400 when appId or path missing', async () => {
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db: {} });
    const res = await agentFileApp.request('/api/agent/file?appId=a1');
    expect(res.status).toBe(400);
  });

  it('403 for cross-user', async () => {
    const db = makeDb({ id: 'a1', user_id: 'other', sandbox_id: 's1' });
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });
    const res = await agentFileApp.request('/api/agent/file?appId=a1&path=report.docx');
    expect(res.status).toBe(403);
  });

  it('serves the durable copy with correct headers and bytes', async () => {
    const db = makeDb({ id: 'a1', user_id: 'u1', sandbox_id: 's1' });
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });
    const buf = Buffer.from('hello world');
    fetchDeliverable.mockResolvedValue(buf);

    const res = await agentFileApp.request('/api/agent/file?appId=a1&path=dir/report.docx');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="report.docx"');
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes).toString()).toBe('hello world');
  });

  it('falls back to the live sandbox when no durable copy', async () => {
    const db = makeDb({ id: 'a1', user_id: 'u1', sandbox_id: 's1' });
    getAuthedDb.mockResolvedValue({ user: { id: 'u1' }, db });
    fetchDeliverable.mockResolvedValue(null);
    const sandbox = {
      readFileBase64: vi.fn(() => Promise.resolve(Buffer.from('sandbox bytes').toString('base64'))),
    };
    getSandboxDriver.mockReturnValue({ get: vi.fn(() => Promise.resolve(sandbox)) });

    const res = await agentFileApp.request('/api/agent/file?appId=a1&path=out.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes).toString()).toBe('sandbox bytes');
  });
});
