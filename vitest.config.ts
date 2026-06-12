import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// `@/` maps to the REPO ROOT (not web/ or server/) so both `web/` SPA code and
// `server/` code resolve shared modules like `@/lib/build-types` across the
// directory boundary. The per-workspace tsconfig/vite aliases mirror this.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
