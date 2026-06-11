# JarvisFactory v2 — GAP Checklist

**Framework:** Raudhah Tech 10-Layer Build · **Phase 0, Step 3** · **Date:** 2026-06-11
**Source:** `PHASE0_LAYER_AUDIT.md` (Step 2) + Current State Report (Step 1)
**Rule:** lists **missing/partial** items only (✅-complete layers omitted), grouped by layer,
risk-tagged, mapped to the build order in `PHASE0_LAYER_AUDIT.md` §C. Tick items as they land.

> Legend — Risk: 🔴 High · 🟠 Med-High · 🟡 Med · ⚪ Low ·
> Step: maps to Build Order step (G0 = Gate 0, S1–S7 = §C steps 1–7)

---

## Gate 0 — Blocker cleanup (must precede feature work)

| ✓ | Item | Risk | Owner |
|---|---|---|---|
| [x] | `git rm --cached .env.local` (was tracked with live keys) | 🔴 | done `abcf7c5` |
| [x] | Archive untracked v8–v11 engine to `v1-archive` branch | 🔴 | done (local; unpushed) |
| [x] | `.env.example` added at repo root | 🟡 | done `abcf7c5` |
| [ ] | **Rotate the GitHub PAT in `.git/config`** (still hardcoded; also revoked) | 🔴 | **HUMAN-ONLY — blocks all `git push`** |
| [ ] | **Encrypt `user_github_connections.access_token`** at rest (Supabase Vault) | 🔴 | **HUMAN-ONLY** |
| [ ] | Delete duplicate `~/Downloads/jarvisfactory 2` folder | 🟡 | pending confirm |
| [ ] | Push `v1-archive` to origin once PAT rotated (rollback point) | 🟠 | blocked on PAT |

> ⚠️ Gate 0 is **partially open**: Stage-4 Step 1 (below) proceeded before the PAT/dupe/encryption
> items closed. Acceptable since they don't affect the extraction, but close them before deploy.

---

## Layer 2 — Design 🟡

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [ ] | Decide design-system direction: keep inline styles for KEEP shell vs. introduce Tailwind on new v2 surfaces only | 🟡 | S1 |
| [~] | Decouple UI from logic in `builder/page.tsx` (was 2,834 lines, monolithic) | 🟡 | **S1 — in progress** (orchestration extracted; presentation still large) |

## Layer 3 — Frontend 🟡

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [x] | Extract orchestration from `builder/page.tsx` at the `approveBuild()` seam | 🟡 | **S1 — DONE** `3bf4e45`→`e01e2ef` (pipeline in `lib/build-pipeline.ts`, wired via `useBuildPipeline`) |
| [ ] | Wire chat UI to streamed **agent events** (replaces local pipeline progress logs) | 🟠 | S2/S3 |
| [ ] | Three-pane layout (chat \| live preview \| files) for v2 | 🟡 | S4 |

## Layer 4 — Backend 🔴 (core rebuild)

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [~] | `AgentRunner` abstraction — one Claude Agent SDK session per project, provider-agnostic | 🔴 | **S2 — interface done** (`lib/agent/types.ts`); concrete `claude-runner` pending |
| [ ] | Server orchestrator API route — find/create project, ensure sandbox, open session | 🔴 | S3 |
| [ ] | Move builds **off the browser tab** to durable server execution | 🔴 | S3 |
| [ ] | `build_jobs` run-log table — durable, streamable, resumable | 🔴 | S3 |
| [ ] | Delete the legacy `runBuildPipeline` scaffold once AgentRunner replaces it | 🟡 | S3 (after) |

## Layer 5 — Database 🟠

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [ ] | Add sandbox lifecycle fields to `apps` (`sandbox_id`, `sandbox_status`, `preview_url`, …) | 🟠 | S2/S3 |
| [ ] | Add `build_jobs` table (see Layer 4) | 🔴 | S3 |
| [ ] | Drop shared shim tables `app_users` / `app_data` / `app_sessions` | 🟡 | S7 |
| [ ] | Add migration tooling (today: manual `.sql` files, no ordering) | 🟠 | S7 |

## Layer 6 — Infrastructure 🔴

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [~] | `SandboxDriver` interface (create/writeFiles/exec/startDevServer/getPreviewUrl/snapshot/destroy) | 🔴 | **S2 — interface done** (`lib/sandbox/types.ts`); **provider: Cloudflare Sandbox SDK** (founder decision 2026-06-11) |
| [ ] | Idle-sandbox auto-suspend + snapshot files to Supabase storage | 🔴 | S2 |
| [ ] | Cloudflare Sandbox base image / preinstalled toolchain for user projects | 🟠 | S2 |
| [ ] | CI/CD pipeline (typecheck + lint + smoke) — none today | 🟠 | S7 |
| [ ] | Staging environment | 🟡 | S7 |

## Layer 7 — Security 🔴

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [ ] | Rotate PAT / encrypt OAuth tokens (see Gate 0) | 🔴 | G0 |
| [ ] | RLS `USING(true)` on every table; per-user isolation as a hard invariant | 🔴 | S2/S7 |
| [ ] | Agent permission layer — gate destructive/sensitive ops (deletes, deploys, installs) | 🔴 | S2 |
| [ ] | Sanitize/validate user prompts before the agent loop | 🟠 | S2 |
| [ ] | "One sandbox = one tenant, hostile to all others" enforced from first commit | 🔴 | S2 |

## Layer 8 — Integration 🟡

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [ ] | Cloudflare Sandbox SDK integration (net-new) | 🔴 | S2 |
| [ ] | Replace direct Anthropic fetch with Agent SDK in-sandbox | 🟠 | S2/S3 |
| [ ] | Live preview wired to sandbox dev server (replaces iframe `srcDoc` flattening) | 🟠 | S4 |
| [ ] | Re-point GitHub deploy at the sandbox filesystem (reuse `save-v2`/`pull-v2`) | 🟡 | S5 |
| [ ] | Build Cloudflare deploy route (schema columns exist, no route) | 🟡 | S5 |

## Layer 9 — Operations 🔴

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [ ] | Resumable/streamable build state (closed tab kills a build today) | 🔴 | S3 |
| [ ] | Error monitoring + uptime + structured logs | 🟠 | S7 |
| [ ] | Backups | 🟡 | S7 |

## Layer 10 — Business 🔴

| ✓ | Item | Risk | Step |
|---|---|---|---|
| [ ] | Per-call token meter → Supabase `{user_id, project_id, in/out tokens, model, cost_usd}` | 🔴 | S6 |
| [ ] | Per-user token/compute quotas enforced **before** a session starts | 🔴 | S6 |
| [ ] | Model routing for unit economics (Sonnet default, Opus only for hard tasks) | 🟠 | S6 |
| [ ] | Analytics events + terms/privacy | 🟡 | S7 |

---

## Build-order progress (PHASE0 §C)

- [x] **Gate 0** — partial (`.env.local`, `v1-archive`, `.env.example` done; PAT/encrypt/dupe pending)
- [x] **S1 — Extract `builder/page.tsx`** ✅ done 2026-06-11 (`3bf4e45`→`e01e2ef`)
- [~] **S2 — `SandboxDriver` + `AgentRunner`** — interfaces done (`lib/sandbox/types.ts`,
  `lib/agent/types.ts`); **provider = Cloudflare Sandbox SDK (decided 2026-06-11); concrete driver pending**
- [ ] **S3 — Server orchestrator + `build_jobs`** (durable/streamable/resumable)
- [ ] **S4 — Live preview** wired to sandbox dev server
- [ ] **S5 — Re-point GitHub deploy** at sandbox filesystem
- [ ] **S6 — Token + compute metering + quotas**
- [ ] **S7 — Cleanup + hardening** (drop shim tables, migration tooling, CI, ops)

> `[~]` = in progress · `[x]` = done · `[ ]` = not started
