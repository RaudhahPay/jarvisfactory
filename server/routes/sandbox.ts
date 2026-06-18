// JarvisFactory v2 — sandbox preview endpoint
// POST /api/sandbox/start { projectId, files? }
// Ensures a per-project sandbox via the SandboxDriver (Blaxel when
// SANDBOX_PROVIDER=blaxel), writes the project files (a working demo app if none
// supplied), starts a dev server, and returns the live preview URL. This is what
// the /app Code tab's SandboxRunner calls to "run the built app" live.
//
// No model call here, so nothing to meter — this is pure sandbox compute. Idle
// sandboxes auto-suspend (Blaxel standby), so cost stays bounded.

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';
import { getSandboxDriver } from '@/lib/sandbox';

const sandboxApp = new Hono();

const PREVIEW_PORT = 3000;
// Serve the project's index.html on PREVIEW_PORT (blaxel/node image has node).
const PREVIEW_COMMAND =
  `node -e "const http=require('http'),fs=require('fs');` +
  `http.createServer((q,r)=>{r.setHeader('content-type','text/html');` +
  `r.end(fs.readFileSync('/blaxel/app/index.html','utf-8'))}).listen(${PREVIEW_PORT})"`;

// Minimal but real running app shown until the agent writes the user's project.
const DEMO_INDEX = `<!doctype html><html><head><meta charset="utf-8"/>
<title>ezClaude sandbox</title><style>
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#faf9f6;color:#0a0a18}
  .card{text-align:center}.count{font-size:64px;font-weight:800;margin:16px 0}
  button{font:inherit;padding:10px 18px;border-radius:10px;border:1px solid #e3e3ee;background:#0a0a18;color:#fff;cursor:pointer;margin:0 4px}
  .sub{color:#5a5a72;font-size:14px}
</style></head><body><div class="card">
  <div class="sub">Running live in a Blaxel sandbox</div>
  <div class="count" id="c">0</div>
  <button onclick="window.c.textContent=+window.c.textContent+1">+1</button>
  <button onclick="window.c.textContent=+window.c.textContent-1">-1</button>
</div></body></html>`;

sandboxApp.post('/api/sandbox/start', async (c) => {
  await requireUser(c); // identity required; sandbox compute is gated to signed-in users

  let body: any = {};
  try { body = await c.req.json(); } catch { /* optional body */ }
  const projectId = body?.projectId;
  if (!projectId) return c.json({ error: 'projectId required' }, 400);

  const files = Array.isArray(body?.files) && body.files.length
    ? body.files
    : [{ path: 'index.html', content: DEMO_INDEX }];

  const driver = getSandboxDriver();
  try {
    const sandbox = await driver.create({ projectId, files });
    let previewUrl = '';
    try {
      const dev = await sandbox.startDevServer(PREVIEW_COMMAND, PREVIEW_PORT);
      previewUrl = dev.previewUrl;
    } catch {
      // Dev server may already be running for this sandbox — just resolve its URL.
      previewUrl = await sandbox.getPreviewUrl(PREVIEW_PORT);
    }
    return c.json({ ok: true, sandboxId: sandbox.id, provider: driver.provider, previewUrl });
  } catch (e: any) {
    return c.json({ error: 'sandbox_start_failed: ' + (e?.message || 'unknown') }, 502);
  }
});

export { sandboxApp };
