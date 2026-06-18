// JarvisFactory v2 — multi-file agent build + live run (Lovable-style)
// POST /api/code/build { projectId, prompt, currentFiles? }
// Returns an SSE stream with phase updates so the UI shows live progress.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '@/server/middleware/auth';
import { getSandboxDriver } from '@/lib/sandbox';
import { checkQuota, recordUsage } from '@/lib/metering';
import { validatePrompt } from '@/lib/agent/policy';
import { DEFAULT_MODEL } from '@/lib/models';

const codeBuildApp = new Hono();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PORT = 3000;

// ── Fixed base template (Vite + React + Tailwind). The agent never edits these. ──
const BASE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'app', private: true, type: 'module', scripts: { dev: 'vite' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.1', tailwindcss: '^3.4.10', postcss: '^8.4.41', autoprefixer: '^10.4.20' },
  }, null, 2),
  'vite.config.js': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins:[react()], server:{ host:'0.0.0.0', port:${PORT}, strictPort:true, allowedHosts:true, hmr:false } });\n`,
  'tailwind.config.js': `export default { content:['./index.html','./src/**/*.{js,jsx}'], theme:{ extend:{} }, plugins:[] };\n`,
  'postcss.config.js': `export default { plugins:{ tailwindcss:{}, autoprefixer:{} } };\n`,
  'src/index.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
  'index.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>App</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
  'src/main.jsx': `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);\n`,
};

const SYSTEM = `You generate the SOURCE of a React + Vite + Tailwind CSS single-page app for non-technical users.
Output ONLY JSON (no markdown, no prose): {"files":[{"path":"src/App.jsx","content":"..."}]}.
Rules:
- Always include src/App.jsx with a default-exported root component.
- Use .jsx files only. Style EXCLUSIVELY with Tailwind utility classes (Tailwind is preconfigured).
- You MAY add more files under src/ (e.g. src/components/Foo.jsx) and import them with relative paths.
- Do NOT emit package.json, vite.config, tailwind/postcss config, index.html, src/main.jsx or src/index.css — they already exist.
- Use ONLY react + your own files. No other npm packages. No external CDN.
- Persist data with localStorage where sensible. Make it genuinely usable and visually polished, not a stub.`;

function estimateCostUsd(model: string, i: number, o: number): number {
  const p = model.includes('opus') ? { i: 15, o: 75 } : model.includes('haiku') ? { i: 1, o: 5 } : { i: 3, o: 15 };
  return (i / 1e6) * p.i + (o / 1e6) * p.o;
}

function parseFiles(text: string): { path: string; content: string }[] {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  const obj = JSON.parse(t);
  const files = Array.isArray(obj?.files) ? obj.files : [];
  return files
    .filter((f: any) => typeof f?.path === 'string' && typeof f?.content === 'string')
    .map((f: any) => ({ path: f.path.replace(/^\/+/, ''), content: f.content }));
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

  const currentFiles: { path: string; content: string }[] = Array.isArray(body?.currentFiles) ? body.currentFiles : [];

  return streamSSE(c, async (stream) => {
    const emit = (data: Record<string, unknown>) => stream.writeSSE({ data: JSON.stringify(data), event: 'build' });

    try {
      // Phase 1: Generate
      await emit({ type: 'phase', phase: 'generating', detail: 'Claude is writing your app…' });

      const driver = getSandboxDriver();
      const model = DEFAULT_MODEL;
      const userContent = currentFiles.length
        ? `Current app source files:\n${JSON.stringify(currentFiles).slice(0, 60000)}\n\nApply this change and return the FULL updated file set (same JSON shape):\n${prompt}`
        : `Build this app:\n${prompt}`;

      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: userContent }] }),
      });
      const j: any = await r.json();
      if (!r.ok) { await emit({ type: 'error', error: j?.error?.message || `Anthropic ${r.status}` }); return; }

      const inTok = j?.usage?.input_tokens || 0;
      const outTok = j?.usage?.output_tokens || 0;
      let appFiles: { path: string; content: string }[];
      try {
        appFiles = parseFiles((j?.content || []).map((b: any) => b?.text || '').join(''));
      } catch (e: any) {
        await emit({ type: 'error', error: 'Failed to parse generated files: ' + (e?.message || 'unknown') }); return;
      }
      if (!appFiles.some((f) => f.path === 'src/App.jsx')) {
        await emit({ type: 'error', error: 'Model did not return src/App.jsx' }); return;
      }

      // Merge base + generated
      const merged = new Map<string, string>();
      for (const [path, content] of Object.entries(BASE)) merged.set(path, content);
      for (const f of appFiles) merged.set(f.path, f.content);
      const files = [...merged.entries()].map(([path, content]) => ({ path, content }));

      // Phase 2: Write files
      await emit({ type: 'phase', phase: 'writing', detail: `Writing ${files.length} files to sandbox…` });
      await emit({ type: 'files', files, appFiles });

      const sandbox = await driver.create({ projectId });
      await sandbox.writeFiles(files);

      if (typeof sandbox.runDevProject !== 'function') {
        await emit({ type: 'error', error: 'provider_lacks_multifile_run (set SANDBOX_PROVIDER=blaxel)' }); return;
      }

      // Phase 3: Install
      await emit({ type: 'phase', phase: 'installing', detail: 'Installing dependencies…' });

      // runDevProject handles install + dev start internally; we emit phase markers around it.
      // Since it's a single call, we emit 'starting' after a brief wait via a race approach.
      // For now, runDevProject is atomic — we emit 'starting' optimistically partway through.
      const installTimeout = setTimeout(async () => {
        try { await emit({ type: 'phase', phase: 'starting', detail: 'Starting Vite dev server…' }); } catch {}
      }, 15_000);

      let previewUrl: string;
      try {
        const dev = await sandbox.runDevProject({
          installCommand: 'npm install --no-audit --no-fund',
          devCommand: 'npm run dev',
          port: PORT,
          maxInstallMs: 240_000,
        });
        previewUrl = dev.previewUrl;
      } finally {
        clearTimeout(installTimeout);
      }

      // Phase 4: Ready
      await emit({ type: 'phase', phase: 'ready' });
      await emit({ type: 'done', previewUrl, model, inputTokens: inTok, outputTokens: outTok });

      // Meter (best-effort)
      await recordUsage(db, [{ user_id: user.id, model, input_tokens: inTok, output_tokens: outTok, cost_usd: estimateCostUsd(model, inTok, outTok) }]);
    } catch (e: any) {
      await emit({ type: 'error', error: e?.message || 'Build failed' });
    }
  });
});

export { codeBuildApp };
