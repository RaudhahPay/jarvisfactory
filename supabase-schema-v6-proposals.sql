-- ============================================================
-- JARVISFACTORY v6 — Persist build proposals with each app
-- Run this ONCE in your Supabase SQL Editor.
-- (Supabase → your project → SQL Editor → paste → Run)
-- ============================================================
--
-- This adds a JSONB column to your `apps` table that stores
-- the full BUILD PROPOSAL JARVIS produced before building.
-- That way you can re-open the proposal or download a PDF
-- of any app you've ever built — anytime, even years later.
-- ============================================================

alter table apps add column if not exists proposal_data jsonb;

-- Optional index if you ever search by fields inside the proposal
create index if not exists idx_apps_proposal_complexity
  on apps ((proposal_data->>'complexity'));

-- Done. Existing apps will have NULL proposal_data — JarvisFactory
-- will offer to retroactively generate a proposal from the saved
-- HTML when you click "Download PDF" on those older apps.
