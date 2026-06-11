-- ============================================================
-- JarvisFactory v2 / Stage 4 — S3: sandbox lifecycle + build_jobs
-- ============================================================
-- Adds the durable server-side build state that v2 needs. Idempotent — safe to
-- re-run. Paste into Supabase SQL Editor (until migration tooling lands at S7).
--
-- Decisions (founder-approved 2026-06-11):
--   • Extend `apps` with sandbox-lifecycle fields rather than a separate `sandboxes`
--     table — one project = one active sandbox, so the *current* sandbox lives on the
--     project row. Run history lives in `build_jobs`, not in a sandbox table.
--   • `build_jobs` stores job status + a JSONB tail of recent agent events (for
--     resume/replay). If rows get heavy, move the full event log to object storage
--     and keep only a pointer (revisit at S7).
--   • Per-CALL token metering ({user_id, project_id, in/out tokens, model, cost_usd},
--     CLAUDE.md §6) is a separate `usage_events` table built at S6. `build_jobs` keeps
--     per-job *aggregates* only.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) apps → sandbox lifecycle fields (the project's CURRENT sandbox)
--    Note: cloudflare_url (deployed app) already exists and is distinct from
--    preview_url (the live, ephemeral sandbox dev-server URL).
-- ──────────────────────────────────────────────────────────────
alter table apps add column if not exists sandbox_id text;
alter table apps add column if not exists sandbox_provider text default 'cloudflare';  -- 'cloudflare' | 'e2b' | ...
alter table apps add column if not exists sandbox_status text default 'none';           -- see check below
alter table apps add column if not exists preview_url text;                             -- live sandbox dev-server URL
alter table apps add column if not exists sandbox_last_active_at timestamptz;           -- drives idle auto-suspend
alter table apps add column if not exists snapshot_path text;                           -- Supabase storage key of last file-tree snapshot

-- Constrain sandbox_status to the SandboxStatus union (+ 'none' = never created).
-- Drop-then-add so re-running picks up any value changes.
alter table apps drop constraint if exists apps_sandbox_status_chk;
alter table apps add constraint apps_sandbox_status_chk
  check (sandbox_status in ('none','creating','running','suspended','destroyed','error'));

create index if not exists idx_apps_sandbox_status on apps(sandbox_status);
create index if not exists idx_apps_sandbox_last_active on apps(sandbox_last_active_at);

-- ──────────────────────────────────────────────────────────────
-- 2) build_jobs — durable, streamable, resumable run-log
--    One row per build run (a user prompt that drives an agent session).
-- ──────────────────────────────────────────────────────────────
create table if not exists build_jobs (
  id            uuid default gen_random_uuid() primary key,
  app_id        uuid references apps(id) on delete cascade not null,
  user_id       uuid references profiles(id) on delete cascade not null,

  status        text not null default 'queued'
                  check (status in ('queued','running','succeeded','failed','cancelled')),
  prompt        text,
  model         text,                         -- resolved model for the run (routing result)
  sandbox_id    text,                         -- which sandbox executed this job

  -- Streamed AgentEvent tail (lib/agent/types.ts) for live UI + resume after reload.
  events        jsonb not null default '[]'::jsonb,

  -- Per-job metering aggregates (granular per-call rows come at S6 in usage_events).
  input_tokens  integer default 0,
  output_tokens integer default 0,
  cost_usd      numeric(12,6) default 0,

  error         text,                         -- failure reason when status='failed'

  created_at    timestamptz default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  updated_at    timestamptz default now()
);

create index if not exists idx_build_jobs_app_id  on build_jobs(app_id);
create index if not exists idx_build_jobs_user_id on build_jobs(user_id);
create index if not exists idx_build_jobs_status  on build_jobs(status);
create index if not exists idx_build_jobs_created on build_jobs(created_at desc);

-- ──────────────────────────────────────────────────────────────
-- 3) RLS — every table; a user only ever sees their own rows (CLAUDE.md §7)
-- ──────────────────────────────────────────────────────────────
alter table build_jobs enable row level security;

drop policy if exists "Users see own build_jobs" on build_jobs;
create policy "Users see own build_jobs"
  on build_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
