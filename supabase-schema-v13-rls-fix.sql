-- ============================================================
-- JarvisFactory — v13: RLS fix for exposed platform tables
-- ============================================================
-- LIVE CRITICAL FINDING (2026-06-11, Supabase advisor): RLS was DISABLED in
-- production on `apps`, `profiles`, `jarvis_profiles` — the public anon key (shipped
-- in the browser) could read/modify every row across all users. The base schema
-- enables RLS on apps but prod didn't have it. This migration enables RLS on all
-- three AND adds owner-scoped policies so the app keeps working.
--
-- Safe because: builder/dashboard/onboarding all read these tables with an
-- AUTHENTICATED session (auth.uid() resolves), and server code using the
-- service-role key bypasses RLS entirely. Generated/published apps use the
-- separate app_* tables, not these.
--
-- REVERSIBLE: if anything breaks, disable per-table with
--   alter table <t> disable row level security;
-- Idempotent — safe to re-run.
-- ============================================================

-- profiles: a user sees/edits only their own row (profiles.id = auth uid)
alter table profiles enable row level security;
drop policy if exists "Users see own profile" on profiles;
create policy "Users see own profile" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- jarvis_profiles: scoped by owner user_id → profiles(id) = auth uid
alter table jarvis_profiles enable row level security;
drop policy if exists "Users see own jarvis_profiles" on jarvis_profiles;
create policy "Users see own jarvis_profiles" on jarvis_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- apps: scoped by owner user_id (policy exists in base schema; ensure it's live)
alter table apps enable row level security;
drop policy if exists "Users see own apps" on apps;
create policy "Users see own apps" on apps for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
