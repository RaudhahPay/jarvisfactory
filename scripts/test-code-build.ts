// Live smoke for /api/code/build: real Claude generation -> write into Blaxel ->
// run -> fetch the preview. Run: set -a; . ./.env; set +a; npx tsx scripts/test-code-build.ts
import { getSandboxDriver } from '../lib/sandbox/index.ts';

const PORT = 3000;
const CMD =
  `node -e "const http=require('http'),fs=require('fs');` +
  `http.createServer((q,r)=>{r.setHeader('content-type','text/html');` +
  `r.end(fs.readFileSync('/blaxel/app/index.html','utf-8'))}).listen(${PORT})"`;
const SYSTEM = `Output ONLY a complete self-contained single-file index.html (inline CSS+JS), starting with <!doctype html>. No markdown, no explanation.`;
const PROMPT = 'a simple todo list app: add a task, mark done, delete; clean modern UI';

function extractHtml(t: string): string {
  t = t.trim();
  const f = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (f) t = f[1].trim();
  const i = t.toLowerCase().indexOf('<!doctype');
  return i > 0 ? t.slice(i) : t;
}

console.log('generating with Claude…');
const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: PROMPT }] }),
});
const j: any = await r.json();
if (!r.ok) { console.error('anthropic error', j); process.exit(1); }
const html = extractHtml((j.content || []).map((b: any) => b.text || '').join(''));
console.log('generated html bytes:', html.length, '| tokens in/out:', j.usage?.input_tokens, j.usage?.output_tokens);
console.log('looks like html:', html.toLowerCase().startsWith('<!doctype'));

const driver = getSandboxDriver();
console.log('provider:', driver.provider);
const sb = await driver.create({ projectId: 'codegen-smoke', files: [{ path: 'index.html', content: html }] });
const dev = await sb.startDevServer(CMD, PORT);
console.log('previewUrl:', dev.previewUrl);
await new Promise((r) => setTimeout(r, 2500));
const res = await fetch(dev.previewUrl);
const body = await res.text();
console.log('HTTP', res.status, '| served bytes:', body.length, '| has <html>:', body.toLowerCase().includes('<html'), '| mentions todo:', /todo|task/i.test(body));
await sb.destroy();
console.log('destroyed. DONE');
