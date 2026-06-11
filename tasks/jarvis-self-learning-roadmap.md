# JARVIS Self-Learning Architecture — Roadmap

*Strategic pivot proposed by Coach Fadzil. Drafted by Claude after Taskly worked.*

---

## The Reframe

**Before:** "JarvisFactory is a tool to ship random apps for random users."

**After:** "JarvisFactory is a factory that builds JARVISes. Build one excellent self-learning JARVIS first. Replicate later."

This means: every minute spent making the JARVIS-inside-the-app smarter is leverage. Every minute spent shipping random apps for random users is wasted until JARVIS is excellent.

---

## The Three Pillars

### Pillar 1 — Persistent JARVIS Memory

**Problem:** Claude (me) loses memory across sessions. JARVIS shouldn't.

**Solution:** Supabase tables that JARVIS reads BEFORE every build and writes AFTER every build.

**Schema:**

```sql
-- Lessons JARVIS has learned
create table jarvis_lessons (
  id uuid primary key default gen_random_uuid(),
  jarvis_id uuid references jarvis_profiles(id), -- per-user OR global (jarvis_id = null)
  category text, -- 'forbidden' | 'recipe' | 'pitfall' | 'correction'
  pattern text, -- "When user wants login, must use Jarvis.signup not localStorage"
  example_before text, -- code that was wrong
  example_after text,  -- code that fixed it
  source text, -- "session-2026-05-07-localStorage-bug" or "manual"
  weight numeric default 1.0, -- how often this lesson has fired
  created_at timestamptz default now()
);

-- Recipes — proven successful patterns
create table jarvis_recipes (
  id uuid primary key default gen_random_uuid(),
  jarvis_id uuid,
  name text, -- "auth_login_screen", "dashboard_with_stat_cards"
  use_case text, -- "any app needing email/password login"
  template_html text,
  template_js text,
  notes text,
  success_count integer default 0,
  failure_count integer default 0,
  created_at timestamptz default now()
);

-- Build outcomes — track every build's outcome
create table jarvis_build_outcomes (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id),
  jarvis_id uuid,
  qa_score integer,
  iterations integer,
  duration_seconds numeric,
  errors_caught_by_audit text[],
  features_delivered text[],
  features_missed text[],
  user_satisfaction text, -- 'works' | 'partial' | 'broken'
  notes text,
  created_at timestamptz default now()
);
```

**At build time:**
1. JARVIS reads all `jarvis_lessons` for this user (or global)
2. Top 20 most-relevant lessons get injected into Architect/Builder/QA system prompts as "things you must do" / "things you must NEVER do"
3. After build: outcome recorded in `jarvis_build_outcomes`
4. If user reports bug: lesson auto-captured into `jarvis_lessons`

**The compounding effect:** App #1 fails on a localStorage bug → lesson recorded → App #2 starts with that lesson loaded → never makes the same mistake. By app #100, JARVIS knows ~100 specific things never to do.

---

### Pillar 2 — Modular / Phased Builds

**Problem:** Building BrainyBunch (8 screens, 6 roles, ~25k tokens of code) in one Builder session = chaos. Too much surface area, too many places to fail.

**Solution:** Decompose every non-trivial app into modules. Build them sequentially. Each module is testable.

**Standard modules (most apps):**

| Module | Contents | Typical time |
|---|---|---|
| 1. Foundation | Skeleton HTML, base CSS, Jarvis library glue, helper functions (showOnly, toast, api) | 90s |
| 2. Auth | Login, signup, logout, session handling | 90s |
| 3. Empty Dashboard | Role-aware shell, navigation, empty states | 60s |
| 4. Domain MVP A | First major feature (e.g. "community feed" for BrainyBunch) | 120s |
| 5. Domain MVP B | Second major feature (e.g. "messaging") | 120s |
| 6. Domain MVP C | Third major feature (e.g. "payments") | 120s |
| 7. Admin | Admin-only features | 90s |
| 8. Polish | Refinements, edge cases, loading states | 60s |

**Each module:**
- Has a clear contract (what it adds, what it depends on)
- Builds on previous modules' code (using append_html into the existing app)
- Self-audits before completing
- User can approve before next module starts

**For BrainyBunch:** 8 modules × ~90s avg = 12 minutes total, but every minute is grounded and tested. No more 19-minute builds that ship broken.

**For Taskly:** Modules 1-3 only (no domain features beyond the basics). 4 minutes total.

---

### Pillar 3 — Build JARVIS First, Replicate Later

**Implication:** Until JARVIS is excellent, we don't optimize for multi-user, billing, GitHub sync, or other "scale" features.

**What "excellent JARVIS" means:**

1. Successfully builds simple apps (1-3 modules) on first try, every time. ✓ Taskly proved this works.
2. Successfully builds complex apps (4-8 modules) with module-by-module audit gates.
3. Self-learns: every build adds at least 1 lesson to memory.
4. After 50+ builds: visibly different from a fresh JARVIS — knows your style, your industry, your patterns.

**Once JARVIS hits this bar:** then we replicate (multi-user, billing, etc.).

---

## Implementation Plan

### Phase 1 — Memory Foundation (Week 1)

- [ ] Migration: create `jarvis_lessons`, `jarvis_recipes`, `jarvis_build_outcomes` tables
- [ ] `lib/jarvis-memory.ts`: read/write functions
- [ ] Modify Architect/Builder/QA: inject top lessons into system prompts
- [ ] Modify approveBuild: record outcome after every build
- [ ] Seed initial lessons (capture from `tasks/lessons.md`):
  - Forbidden: localStorage for users/data; hardcoded demo creds; self-rolled auth
  - Required: every onclick has a function; every Jarvis call wrapped in try/catch
  - Recipes: 5-line auth pattern, dashboard skeleton, toast helper, init pattern with timeout

### Phase 2 — Modular Build Architecture (Week 2)

- [ ] Modify Architect prompt: produce `modules` array in design spec, each with id/name/contract/contents
- [ ] Modify approveBuild: loop over modules instead of one big build
- [ ] Each module: own Builder agent run with append_html as primary tool
- [ ] After each module: optional user checkpoint ("Module 3 done, approve before Module 4?")
- [ ] UI: show module-by-module progress instead of one big bar

### Phase 3 — Self-Improvement Loop (Week 3)

- [ ] After build success: detect new patterns, write to lessons
- [ ] After user feedback (bug report or "it works!"): capture as outcome
- [ ] Periodic lesson consolidation (deduplicate, weight common ones higher)
- [ ] Lesson dashboard for user: "Your JARVIS has learned 47 lessons across 23 builds"

### Phase 4 — Vision-Guided QA (Week 4)

- [ ] After build, take screenshot via html2canvas (we already have this for PDF)
- [ ] Pass to QA agent with Claude vision
- [ ] QA reviews visually: "the login button is too small on mobile"
- [ ] Findings get recorded as lessons

### Phase 5 — Replicate (Month 2+)

Only AFTER Phases 1-4 work reliably:
- Multi-user provisioning (each user gets their own JARVIS instance with isolated memory)
- Billing (DuitNow, Stripe)
- GitHub OAuth + sync
- Custom domains
- Production deployment

---

## What This Means For Today

**This week's work:**

1. Memory foundation (Phase 1) — concrete, achievable in 3-4 days.
2. Capture all lessons from this session into the database manually.
3. Test on a fresh build of Taskly — see if JARVIS uses the lessons.

**Don't do this week:**
- Build BrainyBunch full size (it's still too big without modular)
- Add new features (we're consolidating, not expanding)
- Patch the in-app fix flow (we'll retire it once modular builds work)

---

## Success Metrics

By end of Week 4:

- JARVIS has 30+ lessons in memory
- JARVIS builds Taskly-class apps in <2 minutes, first-try-correct
- JARVIS builds BrainyBunch-class apps in <15 minutes via modular builds, first-try-functional
- After 20+ builds, JARVIS visibly avoids previous mistakes (measurable: errors per build over time)

---

*Approved by Coach Fadzil on [date]. Implementation starts after green light.*
