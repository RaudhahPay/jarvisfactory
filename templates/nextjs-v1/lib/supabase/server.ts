// SOP §4.2 — RLS-respecting Supabase client for READS in server components.
// For WRITES, use lib/supabase/admin.ts (admin client) behind a permission gate.
// Why: the RLS-respecting client's write context is unreliable on Cloudflare
// Workers — auth.uid() doesn't always reach Postgres, so writes silently match
// zero rows. The admin client is the reliable write path; the permission check
// is the security gate.

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — Next.js doesn't allow cookie mutation
            // there. Middleware refreshes the session instead. Safe to ignore.
          }
        },
      },
    }
  )
}
