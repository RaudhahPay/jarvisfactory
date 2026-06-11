-- ============================================================
-- JarvisFactory v2 / Stage 4 — S6: per-call usage ledger + quotas
-- ============================================================
-- CLAUDE.md §6: "Meter EVERYTHING. No usage may be un-metered." build_jobs keeps
-- per-job aggregates; this is the granular, queryable per-model-call ledger that
-- pricing, quotas, and abuse limits read from. Idempotent.
-- ============================================================

create table if not exists usage_events (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references profiles(id) on delete cascade not null,
  app_id        uuid references apps(id) on delete set null,
  build_job_id  uuid references build_jobs(id) on delete set null,
  model         text,
  input_tokens  integer default 0,
  output_tokens integer default 0,
  cost_usd      numeric(12,6) default 0,
  created_at    timestamptz default now()
);

create index if not exists idx_usage_events_user    on usage_events(user_id);
create index if not exists idx_usage_events_user_ts on usage_events(user_id, created_at desc);
create index if not exists idx_usage_events_app     on usage_events(app_id);

alter table usage_events enable row level security;
drop policy if exists "Users see own usage" on usage_events;
create policy "Users see own usage"
  on usage_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Per-user monthly spend cap enforced BEFORE a session starts. 0/NULL = unlimited.
alter table profiles add column if not exists monthly_cost_limit_usd numeric(10,2) default 5.00;
