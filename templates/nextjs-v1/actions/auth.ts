// SOP §4.2 + §4.3 canonical pattern.
// Every server action in every v12 app follows this exact shape:
//   1. 'use server' at the top
//   2. zod-validated input
//   3. permission gate (requireUser / requireStaff / requireAdmin) — except for
//      signup/login which are by definition pre-auth
//   4. admin client for the actual write
//   5. typed ActionResult return
//
// Builder agent: COPY this structure. Don't invent variants.

'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import type { ActionResult } from '@/lib/types'

// ──────────────────────────────────────────────────────────────
// SIGNUP
// ──────────────────────────────────────────────────────────────
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Please enter your name'),
})

export async function signup(formData: FormData): Promise<ActionResult> {
  // 1. Validate input — never trust the client (SOP §4.3)
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Invalid input', field: first?.path[0]?.toString() }
  }

  // 2. Use auth client (anon key) for signup itself
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  })

  if (error) {
    return { ok: false, error: error.message }
  }
  if (!data.user) {
    return { ok: false, error: 'Signup failed — no user returned' }
  }

  // 3. Create profile row via ADMIN client (SOP §4.2 — bypasses RLS reliably)
  const admin = createSupabaseAdminClient()
  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    role: 'user',
  })
  if (profileError) {
    // Roll back the auth user if profile insert failed
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: 'Could not create profile: ' + profileError.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ──────────────────────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
})

export async function login(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Invalid input', field: first?.path[0]?.toString() }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    return { ok: false, error: 'Email or password incorrect' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ──────────────────────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

// ──────────────────────────────────────────────────────────────
// UPDATE PROFILE — example of a typical mutation following the SOP pattern
// ──────────────────────────────────────────────────────────────
const updateProfileSchema = z.object({
  fullName: z.string().min(2, 'Name too short').max(100, 'Name too long'),
})

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  // 1. Permission gate FIRST
  const user = await requireUser()

  // 2. Validate
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  // 3. Write via admin client, scoped by user.id (derived server-side, not client-supplied)
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ full_name: parsed.data.fullName, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return { ok: false, error: 'Could not update profile: ' + error.message }
  }

  revalidatePath('/dashboard')
  return { ok: true, data: undefined }
}
