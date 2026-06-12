import { createBrowserClient } from '@supabase/ssr';

// Ported from `utils/supabase/client.ts`, but reads Vite env (`import.meta.env.VITE_*`)
// instead of `process.env.NEXT_PUBLIC_*`. Keep the `createClient` factory for parity
// with existing call sites, and expose a `supabase` singleton for the auth/session
// helpers (and route guards) to share one browser client.
// Fallbacks keep the singleton constructable in unit tests (where Vite env is
// not injected); real values are baked in at build time from `import.meta.env`.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'test-anon-key';

export const createClient = () => createBrowserClient(supabaseUrl, supabaseKey);

export const supabase = createClient();
