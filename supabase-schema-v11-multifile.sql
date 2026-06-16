-- ============================================================
-- JARVISFACTORY v11 / Phase 7.1 — Multi-file project storage
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Multi-file project tree. Shape: { "index.html": "...", "styles/main.css": "..." }
-- Backwards-compat: old apps keep using html_code (single index.html).
-- New v11 apps populate files_json and set html_code = files_json['index.html']
-- so v10 surfaces (preview iframe, single-file GitHub push) keep working.
alter table apps add column if not exists files_json jsonb;

-- Entry point — defaults to index.html for HTML projects.
-- Phase 7.2+ React projects will use 'app/page.tsx' or similar.
alter table apps add column if not exists entry_point text default 'index.html';

-- Builder version: 'v10' (single-file HTML), 'v11' (multi-file HTML), 'v12' (React/Next.js — Phase 7.2+)
alter table apps add column if not exists builder_version text default 'v10';

-- Optional: which Cloudflare hosting URL the app deploys to (Phase 7.6)
alter table apps add column if not exists cloudflare_url text;
alter table apps add column if not exists cloudflare_deployed_at timestamptz;

-- Optional: customer-attached custom domain (Phase 7.7)
alter table apps add column if not exists custom_domain text;
alter table apps add column if not exists custom_domain_status text;  -- 'pending' | 'active' | 'failed'

-- Index for finding apps by builder version (useful for migration queries)
create index if not exists idx_apps_builder_version on apps(builder_version);

-- ── Helpful view: which apps are still on the old single-file pipeline ──
-- Useful for the "Convert to React" migration UX (Phase 7.1 task #68)
create or replace view legacy_v10_apps as
  select id, user_id, name, created_at,
         length(html_code) as code_size,
         (proposal_data is not null) as has_proposal,
         (github_repo_full_name is not null) as on_github
  from apps
  where builder_version = 'v10' or builder_version is null;

comment on column apps.files_json is 'v11+ multi-file project tree as { path: content } map';
comment on column apps.entry_point is 'v11+ entry file path (index.html for HTML, app/page.tsx for Next.js)';
comment on column apps.builder_version is 'Which pipeline generated this app: v10 (single HTML), v11 (multi-file HTML), v12 (React)';
