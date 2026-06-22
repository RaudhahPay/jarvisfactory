-- ============================================================
-- JARVISFACTORY v2 / Stage 4 — S6: metering ledger (usage_events)
-- Plan: docs/plans/2026-06-17-runtime-and-deploy-architecture.md §E + CLAUDE.md §6
-- ============================================================
-- The append-only ledger of every model call. Written by lib/metering.ts
-- (recordUsage) from BOTH active build routes (server/routes/build.ts and
-- server/routes/code.build.ts). checkQuota() sums this calendar month's cost_usd
-- per user and compares to profiles.monthly_cost_limit_usd BEFORE a session starts.
-- No model call may go un-metered (CLAUDE.md §6).
-- ============================================================

create table if not exists usage_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  app_id        uuid,                                   -- v1 apps.id OR v2 code_projects.id (no FK by design)
  build_job_id  uuid references build_jobs(id) on delete set null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(12,6) not null default 0,
  created_at    timestamptz not null default now()
);

-- checkQuota filters by (user_id, created_at >= start-of-month); index for it.
create index if not exists idx_usage_events_user_time on usage_events(user_id, created_at desc);
create index if not exists idx_usage_events_build_job on usage_events(build_job_id);

comment on table usage_events is 'Append-only per-model-call metering ledger; basis for quotas + pricing (CLAUDE.md §6).';

-- Ensure the quota column checkQuota() reads exists on the pre-existing profiles
-- table. profiles predates CLI migrations, so guard with IF EXISTS / IF NOT EXISTS.
-- NULL or <= 0 means "unlimited" (see lib/metering.ts).
alter table if exists profiles
  add column if not exists monthly_cost_limit_usd numeric(12,2);

comment on column profiles.monthly_cost_limit_usd is 'Per-user monthly spend cap in USD; NULL/<=0 = unlimited (lib/metering.ts).';

-- ── Row Level Security: the ledger is append-only and private to its owner ──
alter table usage_events enable row level security;

drop policy if exists usage_events_select_own on usage_events;
create policy usage_events_select_own on usage_events
  for select using (auth.uid() = user_id);

drop policy if exists usage_events_insert_own on usage_events;
create policy usage_events_insert_own on usage_events
  for insert with check (auth.uid() = user_id);
-- No update/delete policy: the ledger is immutable.
