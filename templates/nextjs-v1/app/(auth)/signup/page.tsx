import Link from 'next/link'
import { SignupForm } from './signup-form'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl font-bold">Create your account</h1>
          <p className="text-sm text-muted-foreground">Get started in seconds</p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
