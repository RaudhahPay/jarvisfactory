// Authenticated shell layout — wraps every route under (app)/.
// Calls requireUser() which redirects to /login if no session.
// SOP §4.2: server component, server-side auth check.

import { requireUser } from '@/lib/auth/require-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AppShell } from './app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const supabase = await createSupabaseServerClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  return (
    <AppShell
      user={{
        email: user.email ?? '',
        fullName: profile?.full_name ?? user.email ?? 'You',
        role: (profile?.role as 'user' | 'staff' | 'admin') ?? 'user',
      }}
    >
      {children}
    </AppShell>
  )
}
