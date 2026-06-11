// SOP §4.2 — Admin client for WRITES inside 'use server' actions.
// CRITICAL: this client uses the SERVICE_ROLE key and BYPASSES RLS.
// It MUST ONLY be called from a 'use server' file AFTER a permission gate
// (requireUser / requireStaff / requireAdmin) has succeeded.
//
// The permission check is the security gate. The admin client is the reliable
// write path. Don't conflate them.
//
// SOP §4.5: the service_role key is the dangerous one. Never expose to browser.
// This file is server-only (import would fail in a client component).

import { createClient } from '@supabase/supabase-js'

let cachedAdminClient: ReturnType<typeof createClient> | null = null

export function createSupabaseAdminClient() {
  if (cachedAdminClient) return cachedAdminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
      'For local dev, add to .env.local. ' +
      'For Cloudflare Workers, run: wrangler secret put SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cachedAdminClient
}
