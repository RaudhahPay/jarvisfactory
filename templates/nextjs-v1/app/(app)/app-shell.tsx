'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { logout } from '@/actions/auth'

interface User {
  email: string
  fullName: string
  role: 'user' | 'staff' | 'admin'
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition()

  function onLogout() {
    startTransition(async () => {
      await logout()
    })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/dashboard" className="font-display text-lg font-semibold">
            JarvisFactory App
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.fullName}</span>
            {user.role !== 'user' ? (
              <span className="text-xs font-medium uppercase tracking-wide rounded-full bg-primary/10 text-primary px-2.5 py-0.5">
                {user.role}
              </span>
            ) : null}
            <button
              onClick={onLogout}
              disabled={pending}
              className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  )
}
