// Live smoke: replicate /api/sandbox/start against the real provider and fetch the
// preview URL. Run: set -a; . ./.env; set +a; npx tsx scripts/test-sandbox-preview.ts
import { getSandboxDriver } from '../lib/sandbox/index';

const PORT = 3000;
const CMD =
  `node -e "const http=require('http'),fs=require('fs');` +
  `http.createServer((q,r)=>{r.setHeader('content-type','text/html');` +
  `r.end(fs.readFileSync('/blaxel/app/index.html','utf-8'))}).listen(${PORT})"`;
const HTML = '<!doctype html><h1 id="m">Running live in a Blaxel sandbox</h1>';

const driver = getSandboxDriver();
console.log('provider:', driver.provider);

const sb = await driver.create({ projectId: 'preview-smoke', files: [{ path: 'index.html', content: HTML }] });
console.log('sandbox:', sb.id);

const dev = await sb.startDevServer(CMD, PORT);
console.log('previewUrl:', dev.previewUrl);

// Give the server a moment, then fetch the live URL.
await new Promise((r) => setTimeout(r, 2500));
const res = await fetch(dev.previewUrl);
const body = await res.text();
console.log('HTTP', res.status, '| contains marker:', body.includes('Blaxel sandbox'));

await sb.destroy();
console.log('destroyed. DONE');
