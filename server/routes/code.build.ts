// JarvisFactory v2 — agent code-gen + live run
// POST /api/code/build { projectId, prompt, currentHtml? }
// Claude generates a single self-contained index.html for the prompt; we write it
// into the project's Blaxel sandbox, run it, and return the live preview URL.
// Every model call is metered (CLAUDE.md §6). Single-file HTML keeps generation
// reliable and immediately runnable; multi-file framework builds come later.

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';
import { getSandboxDriver } from '@/lib/sandbox';
import { checkQuota, recordUsage } from '@/lib/metering';
import { validatePrompt } from '@/lib/agent/policy';
import { DEFAULT_MODEL } from '@/lib/models';

const codeBuildApp = new Hono();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PREVIEW_PORT = 3000;
const PREVIEW_COMMAND =
  `node -e "const http=require('http'),fs=require('fs');` +
  `http.createServer((q,r)=>{r.setHeader('content-type','text/html');` +
  `r.end(fs.readFileSync('/blaxel/app/index.html','utf-8'))}).listen(${PREVIEW_PORT})"`;

const SYSTEM = `You are an expert front-end engineer building for non-technical users.
Produce a COMPLETE, self-contained single-file web app as one index.html.
Rules:
- Output ONLY the raw HTML document, starting with <!doctype html>. No markdown, no code fences, no explanation.
- Inline all CSS in <style> and all JS in <script>. No build step, no local file imports.
- You may use CDN <script>/<link> (e.g. Tailwind CDN, fonts) but keep it minimal and resilient.
- Persist user data with localStorage where it makes sense.
- Clean, modern, responsive UI. Make it genuinely usable, not a stub.`;

// Rough cost estimate (USD) for the metering ledger. Sonnet-class pricing.
function estimateCostUsd(model: string, inTok: number, outTok: number): number {
  const p = model.includes('opus')
    ? { i: 15, o: 75 }
    : model.includes('haiku')
      ? { i: 1, o: 5 }
      : { i: 3, o: 15 }; // sonnet/default
  return (inTok / 1e6) * p.i + (outTok / 1e6) * p.o;
}

function extractHtml(text: string): string {
  let t = text.trim();
  // Strip ```html ... ``` fences if the model added them despite instructions.
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const idx = t.toLowerCase().indexOf('<!doctype');
  if (idx > 0) t = t.slice(idx);
  return t;
}

codeBuildApp.post('/api/code/build', async (c) => {
  const { user, db } = await requireUser(c);

  let body: any = {};
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const projectId = body?.projectId;
  if (!projectId) return c.json({ error: 'projectId required' }, 400);

  const v = validatePrompt(body?.prompt);
  if (!v.ok) return c.json({ error: v.reason || 'Invalid prompt' }, 400);
  const prompt: string = v.value;

  const quota = await checkQuota(db, user.id);
  if (!quota.ok) return c.json({ error: quota.reason }, 402);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return c.json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);

  const model = DEFAULT_MODEL;
  const currentHtml: string | undefined = typeof body?.currentHtml === 'string' ? body.currentHtml : undefined;
  const userContent = currentHtml
    ? `Here is the current app's index.html:\n\n${currentHtml}\n\nApply this change and return the FULL updated index.html:\n${prompt}`
    : `Build this app:\n${prompt}`;

  // 1) Generate the app (non-streaming — we need the full file before running it).
  let html = '';
  let inTok = 0;
  let outTok = 0;
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    const j: any = await r.json();
    if (!r.ok) return c.json({ error: j?.error?.message || `Anthropic ${r.status}` }, 502);
    html = extractHtml((j?.content || []).map((b: any) => b?.text || '').join(''));
    inTok = j?.usage?.input_tokens || 0;
    outTok = j?.usage?.output_tokens || 0;
  } catch (e: any) {
    return c.json({ error: 'generation_failed: ' + (e?.message || 'unknown') }, 502);
  }

  if (!html.toLowerCase().includes('<html') && !html.toLowerCase().includes('<!doctype')) {
    return c.json({ error: 'model_returned_no_html' }, 502);
  }

  // 2) Write into the sandbox + run it.
  let previewUrl = '';
  let sandboxId = '';
  const driver = getSandboxDriver();
  try {
    const sandbox = await driver.create({ projectId, files: [{ path: 'index.html', content: html }] });
    sandboxId = sandbox.id;
    try {
      const dev = await sandbox.startDevServer(PREVIEW_COMMAND, PREVIEW_PORT);
      previewUrl = dev.previewUrl;
    } catch {
      previewUrl = await sandbox.getPreviewUrl(PREVIEW_PORT);
    }
  } catch (e: any) {
    return c.json({ error: 'sandbox_run_failed: ' + (e?.message || 'unknown') }, 502);
  }

  // 3) Meter the model call (best-effort).
  await recordUsage(db, [{
    user_id: user.id,
    model,
    input_tokens: inTok,
    output_tokens: outTok,
    cost_usd: estimateCostUsd(model, inTok, outTok),
  }]);

  return c.json({ ok: true, provider: driver.provider, sandboxId, previewUrl, html, model, inputTokens: inTok, outputTokens: outTok });
});

export { codeBuildApp };
