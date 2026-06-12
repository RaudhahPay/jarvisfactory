import { createBrowserClient } from '@supabase/ssr';

// Ported from `utils/supabase/client.ts`, but reads Vite env (`import.meta.env.VITE_*`)
// instead of `process.env.NEXT_PUBLIC_*`. Keep the `createClient` factory for parity
// with existing call sites, and expose a lazy `getSupabase()` accessor that the
// auth/session helpers (and route guards) share.
//
// No hardcoded fallbacks: per CLAUDE.md §7 we fail loud on misconfig rather than
// silently pointing the app at localhost. The client is constructed lazily on first
// `getSupabase()` call (and cached), so simply importing this module never reads or
// validates env — keeping it test-friendly without baked-in test creds.

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

export const createClient = (): SupabaseBrowserClient => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY: set both env vars to construct the Supabase browser client.',
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
};

let client: SupabaseBrowserClient | undefined;

/**
 * Returns the shared Supabase browser client, constructing it on first call and
 * caching it thereafter. Throws if the required `VITE_*` env vars are absent.
 */
export const getSupabase = (): SupabaseBrowserClient => {
  if (!client) {
    client = createClient();
  }
  return client;
};
