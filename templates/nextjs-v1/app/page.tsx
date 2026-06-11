// Home page — replaced per app by the Builder agent.
// Default: redirect to /dashboard if authenticated, /login otherwise.

import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/require-user'

export default async function Home() {
  const user = await getUser()
  if (user) {
    redirect('/dashboard')
  }
  redirect('/login')
}
