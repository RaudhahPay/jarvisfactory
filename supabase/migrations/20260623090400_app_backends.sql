-- ============================================================
-- JARVISFACTORY v2 / Stage 4 — BYO Supabase backends (app_backends)
-- Plan: docs/plans/2026-06-17-runtime-and-deploy-architecture.md §4 + §D-B
-- ============================================================
-- FORWARD-LOOKING (no code reads this yet). Tier B "dedicated database": a user
-- connects THEIR own Supabase project. Secrets MUST be encrypted at rest
-- (CLAUDE.md §7): the *_enc columns hold ciphertext only — encryption/decryption
-- happens in the app layer, never plaintext in the DB, and the service-role key is
-- used for migrations only and NEVER shipped to the browser. `user_id` added
-- beyond the plan's sketch so RLS can scope rows. One backend per app.
-- ============================================================

create table if not exists app_backends (
  id               uuid primary key default gen_random_uuid(),
  app_id           uuid not null,                        -- v1 apps.id OR v2 code_projects.id (no FK by design)
  user_id          uuid not null references auth.users(id) on delete cascade,
  provider         text not null default 'supabase',
  supabase_url     text,
  anon_key_enc     text,                                 -- ciphertext only (safe-ish, but still encrypted)
  service_role_enc text,                                 -- ciphertext only; migrations-only, never to browser
  status           text not null default 'pending',      -- pending | active | error
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists idx_app_backends_app on app_backends(app_id);
create index if not exists idx_app_backends_user on app_backends(user_id);

comment on table app_backends is 'BYO Supabase (Tier B); keys stored as ciphertext only (CLAUDE.md §7). Forward-looking.';
comment on column app_backends.service_role_enc is 'Encrypted service-role key; migrations only, NEVER exposed to the browser.';

alter table app_backends enable row level security;

drop policy if exists app_backends_select_own on app_backends;
create policy app_backends_select_own on app_backends
  for select using (auth.uid() = user_id);

drop policy if exists app_backends_insert_own on app_backends;
create policy app_backends_insert_own on app_backends
  for insert with check (auth.uid() = user_id);

drop policy if exists app_backends_update_own on app_backends;
create policy app_backends_update_own on app_backends
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists app_backends_delete_own on app_backends;
create policy app_backends_delete_own on app_backends
  for delete using (auth.uid() = user_id);
