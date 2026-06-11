-- ============================================================
-- JARVISFACTORY v9 — JARVIS persistent memory
-- ============================================================
-- Run this ONCE in your Supabase SQL Editor.
-- Tables enable JARVIS to learn from every build.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table if not exists jarvis_lessons (
  id uuid default gen_random_uuid() primary key,
  jarvis_id uuid references jarvis_profiles(id) on delete cascade,
  -- jarvis_id null = global lesson (all JARVISes use it)
  category text not null check (category in ('forbidden', 'required', 'pitfall', 'correction', 'recipe')),
  pattern text not null,
  example_before text,
  example_after text,
  source text,
  weight numeric default 1.0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_jarvis_lessons_active_weight
  on jarvis_lessons(active, weight desc);
create index if not exists idx_jarvis_lessons_jarvis
  on jarvis_lessons(jarvis_id) where active = true;

create table if not exists jarvis_recipes (
  id uuid default gen_random_uuid() primary key,
  jarvis_id uuid references jarvis_profiles(id) on delete cascade,
  name text not null,
  use_case text,
  template_html text,
  template_js text,
  notes text,
  success_count integer default 0,
  failure_count integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_jarvis_recipes_active on jarvis_recipes(active);

create table if not exists jarvis_build_outcomes (
  id uuid default gen_random_uuid() primary key,
  app_id uuid references apps(id) on delete cascade,
  jarvis_id uuid references jarvis_profiles(id) on delete set null,
  qa_score integer,
  qa_certified boolean,
  iterations integer,
  duration_seconds numeric,
  errors_caught_by_audit text[],
  features_delivered text[],
  features_missed text[],
  user_satisfaction text check (user_satisfaction in ('works', 'partial', 'broken') or user_satisfaction is null),
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_jarvis_outcomes_jarvis
  on jarvis_build_outcomes(jarvis_id, created_at desc);
create index if not exists idx_jarvis_outcomes_app
  on jarvis_build_outcomes(app_id);

-- ── RLS ────────────────────────────────────────────────────

alter table jarvis_lessons enable row level security;
alter table jarvis_recipes enable row level security;
alter table jarvis_build_outcomes enable row level security;

-- Read: anyone authenticated can read global lessons OR their own
drop policy if exists "Read global or own lessons" on jarvis_lessons;
create policy "Read global or own lessons"
  on jarvis_lessons for select using (
    jarvis_id is null or
    jarvis_id in (select id from jarvis_profiles where user_id = auth.uid())
  );

-- Insert/update: own only
drop policy if exists "Manage own lessons" on jarvis_lessons;
create policy "Manage own lessons"
  on jarvis_lessons for all using (
    jarvis_id is null or
    jarvis_id in (select id from jarvis_profiles where user_id = auth.uid())
  ) with check (
    jarvis_id is null or
    jarvis_id in (select id from jarvis_profiles where user_id = auth.uid())
  );

drop policy if exists "Read recipes" on jarvis_recipes;
create policy "Read recipes" on jarvis_recipes for select using (true);
drop policy if exists "Manage own recipes" on jarvis_recipes;
create policy "Manage own recipes" on jarvis_recipes for all using (
  jarvis_id is null or
  jarvis_id in (select id from jarvis_profiles where user_id = auth.uid())
) with check (
  jarvis_id is null or
  jarvis_id in (select id from jarvis_profiles where user_id = auth.uid())
);

drop policy if exists "Read own outcomes" on jarvis_build_outcomes;
create policy "Read own outcomes"
  on jarvis_build_outcomes for select using (
    app_id in (select id from apps where user_id = auth.uid())
  );
drop policy if exists "Insert own outcomes" on jarvis_build_outcomes;
create policy "Insert own outcomes"
  on jarvis_build_outcomes for insert with check (
    app_id in (select id from apps where user_id = auth.uid())
  );

-- ── Seed initial GLOBAL lessons (learned the hard way in session 2026-05-07) ──

-- Clear any prior global seeds to keep idempotent
delete from jarvis_lessons where source like 'session-2026-05-07-%' and jarvis_id is null;

insert into jarvis_lessons (jarvis_id, category, pattern, source, weight) values
  (null, 'forbidden',
   'NEVER use localStorage to store users, accounts, credentials, current user, login state, or auth tokens. localStorage is for tiny UI prefs ONLY (theme, darkMode, language). All auth data flows through Jarvis.signup / Jarvis.login.',
   'session-2026-05-07-localStorage', 5.0),

  (null, 'forbidden',
   'NEVER define your own users array (const users = [...]). Authentication must go through Jarvis.signup() and Jarvis.login() — these hit the real Supabase backend.',
   'session-2026-05-07-self-rolled-auth', 5.0),

  (null, 'forbidden',
   'NEVER use hardcoded demo credentials (demo@example.com, demo123, admin@admin.com, etc.). Real signup must work via Jarvis.signup().',
   'session-2026-05-07-demo-creds', 5.0),

  (null, 'forbidden',
   'NEVER include the Jarvis library script tag yourself in your HTML output. The library is auto-injected by the platform. Just call its methods.',
   'session-2026-05-07-double-inject', 4.0),

  (null, 'forbidden',
   'NEVER return markdown formatting in your output. No ```html prefix, no ``` suffix, no commentary. Raw HTML only, starting with <!DOCTYPE html>.',
   'session-2026-05-07-markdown-fences', 4.0),

  (null, 'required',
   'Every onclick / onsubmit / onchange / oninput attribute in HTML MUST have a matching function defined in the script. If HTML has onclick="showSignup()", define function showSignup() somewhere. Audit every event handler before finalizing.',
   'session-2026-05-07-undefined-onclick', 5.0),

  (null, 'required',
   'Auth forms must call await Jarvis.signup(email, pw, fullName, role) or await Jarvis.login(email, pw) wrapped in try/catch. On error, show a visible toast/alert. Never silently swallow errors.',
   'session-2026-05-07-auth-pattern', 5.0),

  (null, 'required',
   'Persistent app data (tasks, contacts, posts, items, settings, anything domain-related) must use Jarvis.saveData(table, key, value) and Jarvis.loadData(table). Never localStorage for domain data.',
   'session-2026-05-07-data-pattern', 5.0),

  (null, 'required',
   'Loading screens MUST be defensible: wrap init() in try/catch, put hideLoader() in finally so it ALWAYS runs, and add a setTimeout(5000) fallback that forces hideLoader() + showLogin() in case init hangs. Never let the user be stuck on a loader.',
   'session-2026-05-07-stuck-loader', 5.0),

  (null, 'pitfall',
   'For complex apps (4+ screens, multi-role, big features), write_full_html in one shot may hit token limits and truncate silently. If you have many screens or features, prefer chunked writes: skeleton first via write_full_html (under ~6k tokens), then append_html for each screen, CSS section, and function group.',
   'session-2026-05-07-truncation', 4.0),

  (null, 'correction',
   'When seeing "X is not defined" / ReferenceError: scan every onclick / onsubmit / onchange in HTML, extract the function name, ensure each is defined as `function NAME(){...}` or equivalent in the script.',
   'session-2026-05-07-onclick-fix', 4.0),

  (null, 'correction',
   'When user reports "stuck on loader" / "page doesn''t load past splash": the init function is awaiting a Jarvis call without try/catch, OR the Jarvis library is not yet ready when init runs. Fix: wrap init in try/catch with hideLoader() in finally, add a 5-second timeout fallback that forces showLogin().',
   'session-2026-05-07-loader-fix', 4.0),

  (null, 'recipe',
   'AUTH FLOW PATTERN — Login screen, Signup screen, Dashboard. On page load: if(Jarvis.isLoggedIn()) loadDashboard() else showLogin(). Login submits → await Jarvis.login(email, pw) → loadDashboard(). Signup submits → await Jarvis.signup(...) → loadDashboard(). Logout button → Jarvis.logout() → showLogin(). Use showOnly(screenId) helper to toggle screen visibility.',
   'session-2026-05-07-auth-recipe', 3.0),

  (null, 'recipe',
   'TOAST PATTERN — single div id="toast" fixed top-right. function toast(msg, type){ var t=document.getElementById("toast"); t.textContent=msg; t.className="toast "+(type||"info")+" show"; setTimeout(()=>t.classList.remove("show"),3500); } Wrap every Jarvis call in try/catch and show errors via toast.',
   'session-2026-05-07-toast-recipe', 3.0)
;

-- Done. JARVIS now has 14 seeded lessons + RLS-protected memory tables.
-- Future builds will read these and avoid known bugs from the start.
