// SOP §4.2 — Permission gate for staff-only actions.
// Used in 'use server' actions that should only be callable by staff/admin.

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function requireStaff() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Re-derive staff status server-side per SOP §4.3 — never trust the client.
  // Uses admin client because we may be reading from a staff/role table whose
  // RLS doesn't allow self-lookup.
  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
    redirect('/dashboard?error=insufficient_permissions')
  }

  return { user, role: profile.role as 'staff' | 'admin' }
}

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard?error=insufficient_permissions')
  }

  return { user, role: 'admin' as const }
}
