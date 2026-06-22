-- ============================================================
-- JARVISFACTORY v2 / Stage 4 — go-live deployments (app_deployments)
-- Plan: docs/plans/2026-06-17-runtime-and-deploy-architecture.md §4 + §B/§3
-- ============================================================
-- FORWARD-LOOKING (no code reads this yet). The durable "Deploy" target record:
-- snapshot sandbox files → publish to the static/edge host → assign a subdomain.
-- The router Worker resolves Host (subdomain or custom_domain) → app_id → serves
-- that deployment. One row per project's current live deployment (history via
-- `version`). `user_id` added beyond the plan's sketch so RLS can scope rows.
-- ============================================================

create table if not exists app_deployments (
  id                   uuid primary key default gen_random_uuid(),
  app_id               uuid not null,                    -- v1 apps.id OR v2 code_projects.id (no FK by design)
  user_id              uuid not null references auth.users(id) on delete cascade,
  subdomain            text,                             -- e.g. app-slug-xxxx (under *.ezclaude.app)
  cloudflare_url       text,                             -- resolved live URL
  custom_domain        text,                             -- Builder+ upsell (Cloudflare for SaaS)
  custom_domain_status text not null default 'none',     -- none | pending | active
  version              integer not null default 1,
  deployed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

-- Subdomains and custom domains are globally unique (router maps Host → app_id).
create unique index if not exists idx_app_deployments_subdomain
  on app_deployments(subdomain) where subdomain is not null;
create unique index if not exists idx_app_deployments_custom_domain
  on app_deployments(custom_domain) where custom_domain is not null;
create index if not exists idx_app_deployments_app  on app_deployments(app_id, version desc);
create index if not exists idx_app_deployments_user on app_deployments(user_id);

comment on table app_deployments is 'Durable go-live deployment records; Host → app_id routing (plan §B/§3). Forward-looking.';

alter table app_deployments enable row level security;

drop policy if exists app_deployments_select_own on app_deployments;
create policy app_deployments_select_own on app_deployments
  for select using (auth.uid() = user_id);

drop policy if exists app_deployments_insert_own on app_deployments;
create policy app_deployments_insert_own on app_deployments
  for insert with check (auth.uid() = user_id);

drop policy if exists app_deployments_update_own on app_deployments;
create policy app_deployments_update_own on app_deployments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists app_deployments_delete_own on app_deployments;
create policy app_deployments_delete_own on app_deployments
  for delete using (auth.uid() = user_id);
