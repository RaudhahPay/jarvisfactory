// Derisk: can a real multi-file Vite+React project npm install + run `vite dev`
// inside a Blaxel sandbox and serve via the preview URL?
// Run: set -a; . ./.env; set +a; npx tsx scripts/test-vite-blaxel.ts
import { SandboxInstance } from '@blaxel/core';

const PORT = 3000;
const files = [
  { path: 'package.json', content: JSON.stringify({
    name: 'app', private: true, type: 'module',
    scripts: { dev: 'vite' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.1' },
  }, null, 2) },
  { path: 'vite.config.js', content:
    `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n` +
    `export default defineConfig({ plugins:[react()], server:{ host:'0.0.0.0', port:${PORT}, strictPort:true, allowedHosts:true, hmr:false } });\n` },
  { path: 'index.html', content:
    `<!doctype html><html><head><meta charset="utf-8"/><title>app</title></head>` +
    `<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
  { path: 'src/main.jsx', content:
    `import React from 'react';import {createRoot} from 'react-dom/client';import App from './App.jsx';` +
    `createRoot(document.getElementById('root')).render(<App/>);` },
  { path: 'src/App.jsx', content:
    `export default function App(){return <h1 data-test="ok">Vite running in Blaxel</h1>;}` },
];

const t0 = Date.now();
const sb = await SandboxInstance.createIfNotExists({ name: 'ez-vite-smoke', image: 'blaxel/node:latest', region: process.env.BL_REGION || 'us-pdx-1', ports: [{ target: PORT, protocol: 'HTTP' }] } as any);
await sb.wait({ maxWait: 60000, interval: 1000 });
console.log('sandbox ready', ((Date.now()-t0)/1000).toFixed(1)+'s');

await sb.fs.writeTree(files as any, '/blaxel/app');
console.log('files written');

console.log('npm install… (non-blocking + poll)');
await sb.process.exec({ name: 'install', command: 'npm install --no-audit --no-fund', workingDir: '/blaxel/app', waitForCompletion: false } as any);
await sb.process.wait('install', { maxWait: 240000, interval: 4000 });
const inst: any = await sb.process.get('install');
console.log('install done in', ((Date.now()-t0)/1000).toFixed(1)+'s | exitCode:', inst?.exitCode, '| status:', inst?.status);

console.log('starting vite dev…');
await sb.process.exec({ name: 'dev', command: 'npm run dev', workingDir: '/blaxel/app', keepAlive: true, waitForCompletion: false, waitForPorts: [PORT] } as any);
const preview: any = await sb.previews.createIfNotExists({ metadata: { name: 'p-3000' }, spec: { port: PORT, public: true } } as any);
const url = preview?.spec?.url;
console.log('previewUrl:', url);

await new Promise((r) => setTimeout(r, 4000));
const res = await fetch(url);
const body = await res.text();
console.log('HTTP', res.status, '| bytes:', body.length, '| has #root:', body.includes('id="root"'), '| total', ((Date.now()-t0)/1000).toFixed(1)+'s');

await SandboxInstance.delete('ez-vite-smoke');
console.log('destroyed. DONE');
