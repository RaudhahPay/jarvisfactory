-- ============================================================
-- JARVISFACTORY v2 / v16 — durable Code-section projects
-- Run this in the Supabase SQL Editor.
-- ============================================================
-- The v2 "Code" surface (Lovable-style builder) previously kept projects + their
-- generated source in the browser's localStorage. This table makes them durable
-- and cross-device: one row per project, owning the generated app SOURCE
-- (app_files) so reopening on any device resumes via /api/code/run with NO model
-- call. Kept separate from the v1 `apps` table on purpose (v2 engine swap).
-- ============================================================

create table if not exists code_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  prompt        text not null default '',
  slug          text,
  app_files     jsonb not null default '[]'::jsonb, -- [{ path, content }] generated source only
  published     boolean not null default false,
  published_url text,
  starred       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_code_projects_user on code_projects(user_id, updated_at desc);
-- A slug is unique per user (publish URL namespacing is per-account).
create unique index if not exists idx_code_projects_user_slug
  on code_projects(user_id, slug) where slug is not null;

comment on table code_projects is 'v2 Code-section projects + generated source (durable, cross-device resume)';
comment on column code_projects.app_files is 'generated app SOURCE only ([{path,content}]); base template is re-merged server-side on run';

-- Keep updated_at fresh on write.
create or replace function set_code_projects_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_code_projects_updated_at on code_projects;
create trigger trg_code_projects_updated_at
  before update on code_projects
  for each row execute function set_code_projects_updated_at();

-- ── Row Level Security: a user only ever sees/writes their own projects ──
alter table code_projects enable row level security;

drop policy if exists code_projects_select_own on code_projects;
create policy code_projects_select_own on code_projects
  for select using (auth.uid() = user_id);

drop policy if exists code_projects_insert_own on code_projects;
create policy code_projects_insert_own on code_projects
  for insert with check (auth.uid() = user_id);

drop policy if exists code_projects_update_own on code_projects;
create policy code_projects_update_own on code_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists code_projects_delete_own on code_projects;
create policy code_projects_delete_own on code_projects
  for delete using (auth.uid() = user_id);
