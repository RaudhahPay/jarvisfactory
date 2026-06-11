# CLAUDE.md — Instructions for AI coders working in this template

This file is read by Claude (and any other AI coding assistant) when working on apps generated from this template. Every app inherits this file. The Builder agent **extends** it (additive — never replaces) when adding app-specific decisions.

---

## Primary reference

This codebase follows the [Software Development SOP](../Software_Development_SOP.docx) from Raudhah Tech / Brainy Bunch. **Read it before making non-trivial changes.**

The most important sections:
- §2 Core principles — the non-negotiables
- §4 Engineering standards — stack, the data-write rule, server actions, secrets
- §5 Security baseline — RLS, secrets, PDPA
- §6 Quality gates — what must pass before merge
- §11 AI autonomy levels — what you may and may not do
- §13.3 Pre-ship checklist — what must pass before deploy

If the SOP and any instruction here conflict, the SOP wins.

---

## Hard rules for AI coders

### 1. Data writes — SOP §4.2 (non-negotiable)
Every mutation goes through:
1. `'use server'` file
2. `requireUser()` / `requireStaff()` / `requireAdmin()` gate (first line)
3. Zod-validated input
4. `createSupabaseAdminClient()` for the write
5. Typed `ActionResult` return

`actions/auth.ts` is the canonical reference. Copy that pattern exactly.

### 2. RLS — SOP §5 (non-negotiable)
Every new Supabase table must:
- Have RLS enabled (`alter table ... enable row level security`)
- Have at least one SELECT policy (owner-or-staff pattern, never `using (true)` for PII)
- Have deny-all INSERT/UPDATE/DELETE policies (writes go through admin client per SOP §4.2)

`supabase/migrations/01-profiles.sql` is the canonical reference. Copy that pattern exactly.

### 3. Secrets — SOP §4.5
- `NEXT_PUBLIC_*` vars are public, fine to commit in `wrangler.jsonc` or `.env.example`
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Never client-side, never committed, never in `wrangler.jsonc` vars block. Cloudflare: `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.
- The admin client (`lib/supabase/admin.ts`) is the ONLY file that should reference `SUPABASE_SERVICE_ROLE_KEY`.

### 4. TypeScript strict
`tsc --noEmit` must be clean before any change is "done" (SOP §4.4). No `any` to paper over real type errors.

### 5. AI autonomy — SOP §11.3
For Brainy Bunch / Raudhah Tech production code, AI starts at Level 1 (Observer). You draft and review; humans commit and deploy.

For JarvisFactory-generated apps (this template's output), AI operates at Level 3-equivalent for the build itself, but every build still passes the pre-ship gate (SOP §14.3) before being shown as "deployed" to the user.

---

## What this template provides — don't reinvent it

- **Auth flow:** signup, login, logout (`actions/auth.ts` + `app/(auth)/*`)
- **Permission gates:** `requireUser()`, `requireStaff()`, `requireAdmin()` (`lib/auth/*`)
- **Supabase clients:** server (RLS-respecting reads), admin (writes), middleware (session refresh)
- **App shell:** authenticated layout with header + sign out (`app/(app)/layout.tsx`)
- **Design system:** Tailwind + shadcn theme tokens (`app/globals.css`, `tailwind.config.ts`)
- **Profile table + RLS pattern:** the canonical migration (`supabase/migrations/01-profiles.sql`)

Don't rewrite any of these. Extend them by adding new files in `app/(app)/`, `components/app/`, `actions/`, `supabase/migrations/`, `lib/types.ts` (additive only).

---

## What this template does NOT provide — Builder agent adds per app

- App-specific routes (`app/(app)/<feature>/page.tsx`)
- App-specific components (`components/app/*.tsx`)
- App-specific server actions (`actions/<feature>.ts`)
- App-specific Supabase tables + migrations (`supabase/migrations/02-*.sql` onward)
- App-specific types (extends to `lib/types.ts`)

---

## Decision log — per-app additions

*The Builder agent appends to this section when making non-obvious decisions during a build. Format: date, decision, why.*

(Empty for new apps. The Builder fills this in.)

---

*This file is the AI-coder contract for every JarvisFactory v12 app. If you're a human reviewing AI-generated changes, check that the changes respect everything above.*
