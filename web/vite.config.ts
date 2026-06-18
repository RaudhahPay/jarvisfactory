import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ESM equivalent of __dirname (the project is "type": "module").
const __dirname = dirname(fileURLToPath(import.meta.url));

// `web/` is the SPA root. `@/` maps to the REPO ROOT (two levels up) to mirror
// `vitest.config.ts` and `web/tsconfig.json`, so ported files keep their
// `@/lib/...` imports working across the directory boundary. The `/api` proxy
// forwards to the Hono server on :3000 during dev.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '..'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
