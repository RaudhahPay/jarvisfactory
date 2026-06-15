// JARVISFACTORY v2 — serve a Cowork deliverable for download (ported from Next.js).
// GET /api/agent/file?appId=...&path=report.docx
// Durable copy (R2) first; falls back to reading the live sandbox while it is warm.
// NOTE (B4): getAuthedDb stays as-is here; Task C2 swaps it to requireUser(c).

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';
import { getSandboxDriver } from '@/lib/sandbox';
import { fetchDeliverable } from '@/lib/sandbox/cloudflare-driver';

const TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  json: 'application/json',
};

const agentFileApp = new Hono();

agentFileApp.get('/api/agent/file', async (c) => {
  const { user, db } = await requireUser(c);

  const appId = c.req.query('appId');
  const path = c.req.query('path');
  if (!appId || !path) return c.json({ error: 'appId and path are required' }, 400);

  const { data: app } = await db
    .from('apps')
    .select('id, user_id, sandbox_id')
    .eq('id', appId)
    .single();
  if (!app) return c.json({ error: 'Not found' }, 404);
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);

  const ext = (path.split('.').pop() || '').toLowerCase();
  const name = path.split('/').pop() || 'download';
  const headers = (len: number) => ({
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': String(len),
  });

  // 1) Durable copy in R2 (survives sandbox sleep) — the normal path post-run.
  try {
    const durable = await fetchDeliverable(`deliverables/${appId}/${path}`);
    if (durable) return c.body(new Uint8Array(durable), 200, headers(durable.length));
  } catch {
    /* fall through to the live sandbox */
  }

  // 2) Fallback: read from the live sandbox (in-progress run / not yet persisted).
  if (!app.sandbox_id) return c.json({ error: 'File not found' }, 404);
  try {
    const driver = getSandboxDriver();
    const sandbox = await driver.get(app.sandbox_id);
    if (!sandbox)
      return c.json({ error: 'File expired (sandbox gone, no durable copy)' }, 410);
    const b64 = await sandbox.readFileBase64(path);
    const bytes = Buffer.from(b64, 'base64');
    return c.body(new Uint8Array(bytes), 200, headers(bytes.length));
  } catch (err: any) {
    return c.json({ error: `Could not read file: ${err?.message || 'unknown'}` }, 410);
  }
});

export { agentFileApp };
