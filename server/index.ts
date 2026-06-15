import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

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

app.get('/api/health', (c) => c.json({ ok: true }));

// Serve built static assets (JS/CSS/etc.) from web/dist.
app.use('/*', serveStatic({ root: DIST_ROOT }));

// SPA fallback: any unmatched route returns the index.html shell.
app.get('*', (c) => {
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
