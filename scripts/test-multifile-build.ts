// Live smoke for the multi-file build path: Claude JSON file-map -> merge base ->
// Blaxel writeFiles + runDevProject (npm install + vite) -> fetch preview.
// Run: set -a; . ./.env; set +a; npx tsx scripts/test-multifile-build.ts
import { getSandboxDriver } from '../lib/sandbox/index';

const PORT = 3000;
const BASE: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'app', private: true, type: 'module', scripts: { dev: 'vite' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.1', tailwindcss: '^3.4.10', postcss: '^8.4.41', autoprefixer: '^10.4.20' } }),
  'vite.config.js': `import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',port:${PORT},strictPort:true,allowedHosts:true,hmr:false}});`,
  'tailwind.config.js': `export default {content:['./index.html','./src/**/*.{js,jsx}'],theme:{extend:{}},plugins:[]};`,
  'postcss.config.js': `export default {plugins:{tailwindcss:{},autoprefixer:{}}};`,
  'src/index.css': `@tailwind base;@tailwind components;@tailwind utilities;`,
  'index.html': `<!doctype html><html><head><meta charset="utf-8"/><title>App</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
  'src/main.jsx': `import React from 'react';import {createRoot} from 'react-dom/client';import App from './App.jsx';import './index.css';createRoot(document.getElementById('root')).render(<App/>);`,
};
const SYSTEM = `Output ONLY JSON {"files":[{"path":"src/App.jsx","content":"..."}]} for a React+Vite+Tailwind app. .jsx only, Tailwind classes, default-export App in src/App.jsx. No package.json/config/main.jsx. react only.`;

function parseFiles(text: string) {
  let t = text.trim(); const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) t = f[1].trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}'); if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return (JSON.parse(t).files || []).filter((x: any) => x.path && x.content);
}

const t0 = Date.now();
console.log('generating (Claude JSON file map)…');
const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: 'Build a pomodoro timer with start/pause/reset and a task list' }] }) });
const j: any = await r.json();
if (!r.ok) { console.error(j); process.exit(1); }
const appFiles = parseFiles((j.content || []).map((b: any) => b.text || '').join(''));
console.log('app files:', appFiles.map((f: any) => f.path).join(', '), '| tokens', j.usage?.input_tokens, j.usage?.output_tokens);

const merged = new Map<string, string>(Object.entries(BASE));
for (const f of appFiles) merged.set(f.path, f.content);
const files = [...merged.entries()].map(([path, content]) => ({ path, content }));

const driver = getSandboxDriver();
const sb = await driver.create({ projectId: 'multifile-smoke' });
await sb.writeFiles(files);
console.log('wrote', files.length, 'files; installing + starting vite…');
const dev = await (sb as any).runDevProject({ installCommand: 'npm install --no-audit --no-fund', devCommand: 'npm run dev', port: PORT, maxInstallMs: 240000, onLog: (s: string) => process.stdout.write(s) });
console.log('previewUrl:', dev.previewUrl);
await new Promise((r) => setTimeout(r, 4000));
const res = await fetch(dev.previewUrl); const body = await res.text();
console.log('HTTP', res.status, '| has #root:', body.includes('id="root"'), '| total', ((Date.now() - t0) / 1000).toFixed(1) + 's');
await sb.destroy();
console.log('destroyed. DONE');
