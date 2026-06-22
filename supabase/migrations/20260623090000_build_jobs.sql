-- ============================================================
-- JARVISFACTORY v2 / Stage 4 — durable build run-log (build_jobs)
-- Plan: docs/plans/2026-06-17-runtime-and-deploy-architecture.md §4
-- ============================================================
-- One row per build. Makes builds durable, streamable, and resumable instead of
-- living only in a browser tab. Written by server/routes/build.ts:
--   insert {app_id,user_id,status:'running',prompt,started_at}
--   update {status,events,sandbox_id,input_tokens,output_tokens,cost_usd,
--           error,finished_at,updated_at}
-- `app_id` is a bare uuid on purpose: it may reference the v1 `apps` table OR the
-- v2 `code_projects` table (engine-swap split), so no hard FK. `user_id` always
-- maps to an auth user.
-- ============================================================

create table if not exists build_jobs (
  id            uuid primary key default gen_random_uuid(),
  app_id        uuid,                                   -- v1 apps.id OR v2 code_projects.id (no FK by design)
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'running',        -- running | succeeded | failed
  prompt        text not null default '',
  events        jsonb not null default '[]'::jsonb,      -- collected AgentEvent[] (streamed run-log)
  sandbox_id    text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(12,6) not null default 0,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_build_jobs_app  on build_jobs(app_id, created_at desc);
create index if not exists idx_build_jobs_user on build_jobs(user_id, created_at desc);

comment on table build_jobs is 'Durable, streamable build run-log (one row per build); replaces tab-local builds.';
comment on column build_jobs.app_id is 'v1 apps.id OR v2 code_projects.id — intentionally no FK (engine-swap split).';
comment on column build_jobs.events is 'Collected AgentEvent[] for the build (also the metering backup).';

-- ── Row Level Security: a user only ever sees/writes their own build jobs ──
alter table build_jobs enable row level security;

drop policy if exists build_jobs_select_own on build_jobs;
create policy build_jobs_select_own on build_jobs
  for select using (auth.uid() = user_id);

drop policy if exists build_jobs_insert_own on build_jobs;
create policy build_jobs_insert_own on build_jobs
  for insert with check (auth.uid() = user_id);

drop policy if exists build_jobs_update_own on build_jobs;
create policy build_jobs_update_own on build_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists build_jobs_delete_own on build_jobs;
create policy build_jobs_delete_own on build_jobs
  for delete using (auth.uid() = user_id);
