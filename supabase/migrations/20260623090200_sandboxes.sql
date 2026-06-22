-- ============================================================
-- JARVISFACTORY v2 / Stage 4 — sandbox lifecycle ledger (sandboxes)
-- Plan: docs/plans/2026-06-17-runtime-and-deploy-architecture.md §4
-- ============================================================
-- FORWARD-LOOKING (no code reads this yet). Tracks each project's live sandbox so
-- the orchestrator can drive idle auto-suspend — the #1 compute-cost risk
-- (CLAUDE.md §5). One row per project sandbox. The sandbox filesystem is the
-- source of truth; snapshot_path points at the Supabase-storage snapshot taken on
-- suspend. `user_id` is added (beyond the plan's sketch) so RLS can scope rows.
-- ============================================================

create table if not exists sandboxes (
  id             text primary key,                       -- provider sandbox id (Blaxel/Cloudflare)
  app_id         uuid,                                   -- v1 apps.id OR v2 code_projects.id (no FK by design)
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null default 'stub',           -- stub | blaxel | cloudflare
  status         text not null default 'running',        -- running | suspended | destroyed
  preview_url    text,
  snapshot_path  text,                                    -- Supabase storage path of the file-tree snapshot
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_sandboxes_app  on sandboxes(app_id);
create index if not exists idx_sandboxes_user on sandboxes(user_id, last_active_at desc);
-- Drives idle teardown: find sandboxes that have been idle past the threshold.
create index if not exists idx_sandboxes_idle on sandboxes(status, last_active_at);

comment on table sandboxes is 'Live sandbox lifecycle ledger; drives idle auto-suspend (CLAUDE.md §5). Forward-looking.';

alter table sandboxes enable row level security;

drop policy if exists sandboxes_select_own on sandboxes;
create policy sandboxes_select_own on sandboxes
  for select using (auth.uid() = user_id);

drop policy if exists sandboxes_insert_own on sandboxes;
create policy sandboxes_insert_own on sandboxes
  for insert with check (auth.uid() = user_id);

drop policy if exists sandboxes_update_own on sandboxes;
create policy sandboxes_update_own on sandboxes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sandboxes_delete_own on sandboxes;
create policy sandboxes_delete_own on sandboxes
  for delete using (auth.uid() = user_id);
