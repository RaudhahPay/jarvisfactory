// SOP §4.2 — Permission gate for any 'use server' action that touches data.
// Pattern (every server action):
//
//   'use server'
//   import { requireUser } from '@/lib/auth/require-user'
//   import { createSupabaseAdminClient } from '@/lib/supabase/admin'
//
//   export async function doThing(formData: FormData) {
//     const user = await requireUser()  // ← MUST be first line
//     const admin = createSupabaseAdminClient()
//     // ... validated input, then admin writes
//   }
//
// requireUser() throws (which Next.js redirects to /login) if no session.
// Returns the authenticated user object — use it to scope writes by user_id.

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requireUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return user
}

// Returns user or null without redirecting — for routes that conditionally
// render based on auth state (e.g., home page with "Sign in" vs "Dashboard" CTA).
export async function getUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
