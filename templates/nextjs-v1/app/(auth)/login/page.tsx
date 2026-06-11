import Link from 'next/link'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl font-bold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
