// Default dashboard. Builder agent REPLACES this per app with feature-specific content.
// Demonstrates the canonical "fetch via server component, mutate via server action" pattern.

import { requireUser } from '@/lib/auth/require-user'

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span>.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Welcome to your new app</h2>
        <p className="text-sm text-muted-foreground mt-2">
          This is the template scaffold. JarvisFactory&apos;s Builder agent replaces this
          page with feature-specific content based on your build proposal. Every mutation
          flows through a permission-gated server action per SOP §4.2.
        </p>
      </div>
    </div>
  )
}
