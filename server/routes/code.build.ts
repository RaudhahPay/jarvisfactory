// JarvisFactory v2 — multi-file agent build + live run (Lovable-style)
//
// ENGINE: the real Claude Agent SDK loop (lib/agent ClaudeAgentRunner) — the agent
// writes/edits files and runs commands INSIDE the Blaxel sandbox via policy-gated
// tools, iterating and self-correcting (not a one-shot generation). After it
// finishes we snapshot the source, run `npm install` + `vite dev`, and stream the
// live preview URL. Every model call is metered (CLAUDE.md §6).
//
//   POST /api/code/build  { projectId, prompt, currentFiles? }  → SSE
//   POST /api/code/run    { projectId, appFiles }               → SSE (resume, NO model)

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';
import { getSandboxDriver } from '@/lib/sandbox';
import { getAgentRunner } from '@/lib/agent';
import type { AgentEvent } from '@/lib/agent/types';
import { checkQuota, recordUsage } from '@/lib/metering';
import { validatePrompt } from '@/lib/agent/policy';
import { DEFAULT_MODEL } from '@/lib/models';

const codeBuildApp = new Hono();

const PORT = 3000;

// ── Fixed base template (Vite + React + Tailwind). Seeded into the sandbox so the
//    agent edits a working project instead of scaffolding the toolchain itself. ──
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

const BRIEFING = `You are an expert React web app builder working in an EXISTING Vite + React + Tailwind CSS project. Build (or modify) the app from the user's request using ONLY the provided sandbox tools (write_file, read_file, exec, list_files).

ALREADY SCAFFOLDED — do NOT recreate these (they exist and are configured):
  package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html, src/main.jsx, src/index.css

RULES:
- App code lives under src/. The root component MUST be src/App.jsx with a default export.
- Use .jsx + Tailwind utility classes (Tailwind is preconfigured). Split UI into components under src/components/ where sensible.
- You MAY add npm packages when genuinely needed by running: exec with "npm install <pkg>". Prefer the standard library + React.
- Do NOT start the dev server or run "npm run dev" / "vite" — the platform starts it for preview.
- When editing an existing app, read the relevant files FIRST and make minimal, correct changes.
- Persist user data with localStorage where it makes sense. Ship something complete, polished and responsive — never placeholders or TODOs.

When finished, write one short sentence describing what you built or changed.`;

type File = { path: string; content: string };

/** Merge the fixed base template with app source (app wins on conflict). */
function mergeWithBase(appFiles: File[]): File[] {
  const merged = new Map<string, string>();
  for (const [path, content] of Object.entries(BASE)) merged.set(path, content);
  for (const f of appFiles) merged.set(f.path, f.content);
  return [...merged.entries()].map(([path, content]) => ({ path, content }));
}

/** Source paths worth persisting/showing — drop installed deps, vcs, build output. */
function isSource(path: string): boolean {
  return !/^(node_modules|\.git|dist|\.vite)\//.test(path) && !path.includes('/node_modules/');
}

/** Install deps + start Vite, emitting installing → starting phases. Returns the
 *  preview URL, or null if it emitted an error. Shared by build + run. */
async function startDev(sandbox: any, emit: (d: Record<string, unknown>) => void): Promise<string | null> {
  if (typeof sandbox.runDevProject !== 'function') {
    emit({ type: 'error', error: 'provider_lacks_multifile_run (set SANDBOX_PROVIDER=blaxel)' });
    return null;
  }
  emit({ type: 'phase', phase: 'installing', detail: 'Installing dependencies…' });
  const t = setTimeout(() => emit({ type: 'phase', phase: 'starting', detail: 'Starting Vite dev server…' }), 15_000);
  try {
    const dev = await sandbox.runDevProject({
      installCommand: 'npm install --no-audit --no-fund',
      devCommand: 'npm run dev',
      port: PORT,
      maxInstallMs: 240_000,
    });
    return dev.previewUrl;
  } finally {
    clearTimeout(t);
  }
}

/** Build an SSE ReadableStream. `run` gets a synchronous, ordered emit(). */
function sse(c: any, run: (emit: (d: Record<string, unknown>) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (d: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try { await run(emit); } catch (e: any) { emit({ type: 'error', error: e?.message || 'failed' }); }
      finally { controller.close(); }
    },
  });
  return c.body(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
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
  if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);

  const currentFiles: File[] = Array.isArray(body?.currentFiles)
    ? body.currentFiles.filter((f: any) => typeof f?.path === 'string' && typeof f?.content === 'string')
    : [];
  const isEdit = currentFiles.length > 0;

  return sse(c, async (emit) => {
    const model = DEFAULT_MODEL;
    const usageRows: any[] = [];
    let inTok = 0, outTok = 0;

    // Seed the sandbox with the base template (+ prior source on an edit) so the
    // agent works on a real, runnable project.
    emit({ type: 'phase', phase: 'generating', detail: isEdit ? 'Applying your changes…' : 'Starting the agent…' });
    const driver = getSandboxDriver();
    const sandbox = await driver.create({ projectId, files: mergeWithBase(currentFiles) });

    // Stream the agent's real activity into the chat + drive metering.
    const onEvent = (e: AgentEvent) => {
      if (e.type === 'usage') {
        inTok += e.inputTokens; outTok += e.outputTokens;
        usageRows.push({ user_id: user.id, model: e.model, input_tokens: e.inputTokens, output_tokens: e.outputTokens, cost_usd: e.costUsd });
      } else if (e.type === 'file_edit') {
        emit({ type: 'phase', phase: 'generating', detail: `${e.action === 'create' ? 'Creating' : e.action === 'edit' ? 'Editing' : 'Deleting'} ${e.path}` });
        emit({ type: 'agent', kind: 'file_edit', path: e.path, action: e.action });
      } else if (e.type === 'exec') {
        emit({ type: 'phase', phase: 'generating', detail: `$ ${e.command}` });
        emit({ type: 'agent', kind: 'exec', text: e.command });
      } else if (e.type === 'text' && e.text.trim()) {
        emit({ type: 'agent', kind: 'text', text: e.text });
      } else if (e.type === 'error') {
        emit({ type: 'agent', kind: 'error', text: e.message });
      }
    };

    const userPrompt = `${BRIEFING}\n\n--- USER REQUEST ---\n${prompt}`;
    const runner = await getAgentRunner();
    await runner.start(sandbox, { projectId, userId: user.id, model, prompt: userPrompt, onEvent });

    // Snapshot the source the agent produced (exclude installed deps / build output).
    const snap = await sandbox.snapshot();
    const appFiles = (snap.files || []).filter((f: File) => isSource(f.path));
    if (!appFiles.some((f: File) => f.path === 'src/App.jsx')) {
      emit({ type: 'error', error: 'The agent did not produce src/App.jsx — try rephrasing your request.' });
      return;
    }
    emit({ type: 'files', files: appFiles, appFiles });

    const previewUrl = await startDev(sandbox, emit);
    if (previewUrl === null) return; // error already emitted

    emit({ type: 'phase', phase: 'ready' });
    emit({ type: 'done', previewUrl, model, inputTokens: inTok, outputTokens: outTok });
    await recordUsage(db, usageRows);
  });
});

// Resume a saved project: write the saved source + start the dev server. NO model
// call, no metering — reopening a project must not re-bill or re-think.
codeBuildApp.post('/api/code/run', async (c) => {
  const { user } = await requireUser(c);
  void user;

  let body: any = {};
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const projectId = body?.projectId;
  if (!projectId) return c.json({ error: 'projectId required' }, 400);

  const appFiles: File[] = Array.isArray(body?.appFiles)
    ? body.appFiles.filter((f: any) => typeof f?.path === 'string' && typeof f?.content === 'string')
    : [];
  if (!appFiles.some((f) => f.path === 'src/App.jsx')) {
    return c.json({ error: 'no saved source to run (missing src/App.jsx)' }, 400);
  }

  return sse(c, async (emit) => {
    const files = mergeWithBase(appFiles);
    emit({ type: 'files', files, appFiles });
    emit({ type: 'phase', phase: 'writing', detail: `Writing ${files.length} files to sandbox…` });
    const sandbox = await getSandboxDriver().create({ projectId, files });
    const previewUrl = await startDev(sandbox, emit);
    if (previewUrl === null) return;
    emit({ type: 'phase', phase: 'ready' });
    emit({ type: 'done', previewUrl, model: '', inputTokens: 0, outputTokens: 0 });
  });
});

export { codeBuildApp };
