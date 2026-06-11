-- ============================================================
-- JARVISFACTORY v10 — GitHub OAuth + repo sync
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ── Per-user GitHub connection ──
create table if not exists user_github_connections (
  user_id uuid primary key references profiles(id) on delete cascade,
  github_user_id bigint,
  github_username text not null,
  access_token text not null,           -- v1: plain text. v2: encrypt via Vault.
  scopes text,
  connected_at timestamptz default now(),
  last_used_at timestamptz,
  updated_at timestamptz default now()
);

create index if not exists idx_github_connections_user on user_github_connections(user_id);

alter table user_github_connections enable row level security;

drop policy if exists "Users see only own GitHub connection" on user_github_connections;
create policy "Users see only own GitHub connection"
  on user_github_connections for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Per-app GitHub repo tracking ──
alter table apps add column if not exists github_repo_url text;
alter table apps add column if not exists github_repo_full_name text;
alter table apps add column if not exists github_pushed_at timestamptz;
