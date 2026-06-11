# JarvisFactory v2 — Phase 0 Layer Audit

**Framework:** Raudhah Tech 10-Layer Build · **Phase 0, Step 2** · **Date:** 2026-06-11
**Input:** Current State Report (scan of `ariavibecoderlab/jarvisfactory`, HEAD `f915e70`)
**Decision (see end):** ✅ Continue on this foundation — targeted engine transplant, not a rebuild.

---

## A) Layer Audit Table

| # | Layer | Status | What exists | What's missing for v2 | Risk |
|---|---|---|---|---|---|
| 1 | **Product** | ✅ Complete | Working product: idea → proposal + Q&A → build → GitHub deploy. v2 scope (engine swap) is clearly bounded. | State v2 success metrics + explicit out-of-scope. | Low |
| 2 | **Design** | ⚠️ Partial | Functional UI shell (landing/auth/onboarding/dashboard/builder), reusable. | **No design system** — all inline-style objects, no Tailwind/component lib. `builder/page.tsx` mixes UI + logic (2,834 lines). | Med |
| 3 | **Frontend** | ⚠️ Partial | Next.js 14 App Router, React 18, TS. Routing + auth-gated pages sound. | Extract presentation from orchestration in `builder/page.tsx`; keep the chrome, gut the build driver. | Med |
| 4 | **Backend** | ❌ Missing (for v2) | Only a thin Anthropic proxy + GitHub routes. **Build runs client-side in the browser tab.** | A real **server orchestrator**, the **Agent SDK runner**, and durable **build_jobs**. This is the core rebuild. | **High** |
| 5 | **Database** | ⚠️ Partial | Platform schema sound + keepable (`profiles`, `jarvis_profiles`, `apps`, etc.). | Drop shared shim tables (`app_users`/`app_data`/`app_sessions`); add sandbox lifecycle fields + `build_jobs`; add migration tooling (today: manual `.sql`). | Med-High |
| 6 | **Infrastructure** | ❌ Mostly missing | Railway hosting, Docker dev files. | **E2B sandbox compute layer (net-new)**, CI/CD (none today), staging env, `.env.example`. | **High** |
| 7 | **Security** | ❌ Critical | Platform Supabase Auth is sound (keep). | **Live exposures (blocking):** PAT in `.git/config`, plaintext OAuth tokens, git-tracked `.env.local`. Open `USING(true)` RLS + browser-side SHA-256 app auth — both deleted by the rebuild, but exposures are live now. | **High** |
| 8 | **Integration** | ⚠️ Partial | GitHub (OAuth + Git Data API) complete & keepable. Anthropic via direct fetch. | **E2B integration (net-new).** Replace direct Anthropic calls with Agent SDK in-sandbox. Cloudflare deploy: schema columns exist, no route built. | Med |
| 9 | **Operations** | ❌ Missing | None to speak of. | Error monitoring, uptime, structured logs, backups, **resumable/streamable build state** (today a closed tab kills a build). | High |
| 10 | **Business** | ❌ Mostly missing | `apps.tokens_used` gives partial token tracking. | Per-user **token + compute metering**, quotas, analytics events, terms/privacy. v2 economics depend on this. | High |

Legend: ✅ Complete · ⚠️ Partial · ❌ Missing

---

## B) Risk Summary — top 3 to resolve before continuing

**1. Live credential exposure + data-loss landmine (BLOCKING).**
Exposed GitHub PAT, plaintext stored OAuth tokens, and a git-tracked `.env.local` holding live keys — combined with the fact that the **entire v8–v11 engine is untracked** (one `rm -rf` erases it). This is gate-zero: fix before any code is written.
→ Rotate PAT · `git rm --cached .env.local` · archive the untracked engine to a branch/tag · encrypt `user_github_connections.access_token`.

**2. No server-side build infrastructure (Layers 4 + 6 + 9).**
Builds run in the browser today. v2 requires a durable server orchestrator, the Agent SDK running inside E2B, a `build_jobs` run-log, and streaming/resumability. This is the largest, highest-uncertainty body of work in the project.

**3. Multi-tenant isolation (Layers 5 + 7).**
Today every generated app shares one set of tables behind `USING(true)` RLS — full cross-tenant exposure. The v2 sandbox model must be isolation-correct from the first commit, or it's a breach waiting to happen. Treat "one sandbox = one tenant, hostile to all others" as a hard invariant.

---

## C) Recommended Build Order

**Gate 0 — Blocker cleanup (hours, do first):**
Rotate PAT → `git rm --cached .env.local` → archive untracked engine to `v1-archive` tag → delete duplicate folder → encrypt stored GitHub tokens.

**Then, in dependency order:**
1. **Extract `builder/page.tsx`** — separate presentation (KEEP) from orchestration (DELETE). Establish the clean `approveBuild()` seam.
2. **`SandboxDriver` (E2B)** + **`AgentRunner`** abstractions — the two load-bearing, provider-agnostic interfaces.
3. **Server orchestrator + `build_jobs`** — move builds off the browser; durable, streamable, resumable.
4. **Live preview** wired to the sandbox's real dev server (replaces iframe `srcDoc` flattening).
5. **Re-point GitHub deploy** at the sandbox filesystem (reuse `save-v2`/`pull-v2`).
6. **Token + compute metering + per-user quotas** (Layer 10) — enforce before a session starts.
7. **Cleanup + hardening** — drop shim tables + injected backend, add migration tooling, CI (typecheck/lint/smoke), ops monitoring.

---

## D) Decision: continue, don't rebuild

**Build on this foundation.** ~70% of the value — landing, auth, onboarding, dashboard, the proposal flow, and GitHub deploy — is sound and loosely coupled to the engine. The cut line is clean: the body of `approveBuild()`. What gets deleted is well-bounded (the browser-side agent loop, fake in-memory file tools, the Anthropic proxy, and the insecure shared "Jarvis backend" shim). This is a targeted engine transplant onto a healthy shell, gated behind the Gate-0 security/backup cleanup.

**Handoff → Phase 0 Step 3 (Claude Cowork):** turn this audit into `GAP_CHECKLIST.md` (missing/partial items only, grouped by layer, risk-tagged) + finalize `CLAUDE.md`, then resume at Stage 4 in build order above.
