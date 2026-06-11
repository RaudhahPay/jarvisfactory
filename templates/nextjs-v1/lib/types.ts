// Shared types for the v12 template.
// Builder agent EXTENDS this file (additive) when adding per-app types.
// Never wholesale rewrites it.

export type UserRole = 'user' | 'staff' | 'admin'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

// Generic action result shape — every 'use server' action should return this
// so the client can react uniformly.
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string }
