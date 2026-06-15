import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { agentChatApp } from './routes/agent.chat';
import { agentCoworkApp } from './routes/agent.cowork';
import { agentFileApp } from './routes/agent.file';
import { buildApp } from './routes/build';
import { chatApp } from './routes/chat';
import { conversationsApp } from './routes/conversations';
import { githubPullApp } from './routes/github.pull';
import { githubSaveApp } from './routes/github.save';

const DIST_ROOT = 'web/dist';
const INDEX_HTML = resolve(process.cwd(), DIST_ROOT, 'index.html');

// Minimal SPA shell used when the production build (web/dist) is absent, e.g. in
// tests. In production serveStatic serves the real built assets and index.html.
const FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>ezclaude</title></head>
  <body><div id="root"></div></body>
</html>
`;

const app = new Hono();

// ─── API routes ───────────────────────────────────────────────────────────
// INVARIANT: register every /api/* route ABOVE the static/SPA block below.
// Hono matches in registration order, so the catch-all must stay last or it
// will shadow API routes.
app.get('/api/health', (c) => c.json({ ok: true }));

// Sub-apps define their own full /api/... paths.
app.route('/', conversationsApp);
app.route('/', chatApp);
app.route('/', agentFileApp);
app.route('/', agentChatApp);
app.route('/', agentCoworkApp);
app.route('/', buildApp);
app.route('/', githubSaveApp);
app.route('/', githubPullApp);

// ─── Static assets + SPA fallback (must stay last) ──────────────────────────
// Serve built assets (JS/CSS/etc.) from web/dist. Missing files fall through.
app.use('/*', serveStatic({ root: DIST_ROOT }));

// Catch-all: unmatched /api/* is a real 404 (never the SPA shell); everything
// else returns the index.html shell so client-side routing can take over.
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  const html = existsSync(INDEX_HTML)
    ? readFileSync(INDEX_HTML, 'utf-8')
    : FALLBACK_HTML;
  return c.html(html);
});

// Only bind a port when run as the entrypoint, so importing in tests is safe.
const isEntrypoint =
  process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
  // eslint-disable-next-line no-console
  console.log(`server listening on :${port}`);
}

export { app };
