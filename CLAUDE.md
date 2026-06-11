# CLAUDE.md — JarvisFactory v2

> Persistent context for Claude Code. Read this first, every session.
> JarvisFactory v2 is a Lovable-style AI app builder where the engine is the
> **Claude Agent SDK** (the real Claude Code agent loop) running inside a
> **per-user E2B sandbox**. v1 was a code-generation pipeline. v2 replaces that
> engine; it keeps the shell.

---

## 1. What we are building

A web product: user types a request → an autonomous agent edits real files and
runs a real dev server in an isolated sandbox → user watches it work and sees a
**live preview** → one-click **deploy**. Three-pane UI (chat | live preview |
files/code). The intelligence is solved by the Agent SDK — our job is the
infrastructure around it: sandboxes, preview proxy, and cost metering.

---

## 2. PRIME DIRECTIVE — v2 is an engine swap, not a rewrite

Always classify any file you touch as KEEP, REPLACE, or ADD. When unsure, ask
before changing — do not refactor KEEP code just because you're nearby.

**KEEP (reuse from v1, do not rebuild):**
- The UI shell / three-pane layout and component library
- Supabase auth + existing user/project tables (extend, don't replace)
- The deploy flow (GitHub push → Cloudflare)
- Brand, routing, marketing pages

**REPLACE (rip out — this is the whole point of v2):**
- The v1 code-generation engine. Wherever v1 calls the model to emit code into
  the app, remove it. Generation no longer happens in our process — it happens
  inside a sandbox, driven by the Agent SDK. Map this boundary precisely (Phase 0)
  before deleting anything.

**ADD (the three new layers):**
1. **Sandbox driver** — create/start/stop/destroy an E2B sandbox per project.
2. **Agent runner** — one Claude Agent SDK session per project, executing inside
   that sandbox; stream its messages to the chat UI.
3. **Preview proxy + token meter** — expose each sandbox dev server to a
   per-project subdomain; log every model call's tokens + cost per user.

---

## 3. Stack

- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript. **Reality
  check (from scan): the existing shell uses inline-style objects — NO Tailwind,
  NO component lib.** Decision pending: keep inline styles for the KEEP shell and
  introduce Tailwind only on new v2 surfaces, or restyle. Do not assume Tailwind
  exists — read the file.
- **Backend:** Next.js API routes / route handlers; a dedicated agent-runner
  service if/when long-running sessions outgrow serverless timeouts
- **Engine:** Claude Agent SDK (TypeScript) — same agent loop, tools, and context
  management that power Claude Code
- **Sandbox:** E2B (isolated microVM per project)
- **DB / Auth:** Supabase (PostgreSQL + Supabase Auth)
- **Hosting:** **Cloudflare only** (founder decision, 2026-06-11) — app on Cloudflare
  (Workers/Pages); user-app deploy target is Cloudflare. No Vercel. **Reality check:
  v1 ships via GitHub push → Railway** (README + the `/api/chat` `maxDuration` comment
  reference Railway); migrate the app host to Cloudflare as part of v2. **Watch-out:**
  long-running Agent SDK sessions exceed Workers' CPU/duration limits — the agent
  runner likely needs Durable Objects / Containers or a dedicated long-running service,
  not a plain Worker (decide at S2/S3).
- **AI billing:** Anthropic API key + prepaid API credit pool (see §6)

> Confirm exact current versions against the Phase 0 scan before coding. Do not
> assume — read the repo.

---

## 4. Architecture — request flow

```
User prompt (chat)
  → Orchestrator (API route): find/create project, ensure E2B sandbox is running
  → Agent runner: open Agent SDK session bound to that sandbox's filesystem
  → Agent edits files / runs commands INSIDE the sandbox
  → Stream agent events back to chat UI (thinking, edits, tool calls)
  → Sandbox dev server reloads → preview proxy → live iframe updates
  → On "Deploy": push sandbox project to Cloudflare
  → Token meter records usage + cost against the user
```

One project = one sandbox = one Agent SDK session context. Persist session state
so a project can be resumed (rehydrate the sandbox from saved files on resume).

> **Scan finding:** today builds run **client-side in the browser tab** (close
> tab = lost build) via `app/builder/page.tsx`. v2 moves this server-side. The
> clean seam to cut at is the body of `approveBuild()` — keep everything before
> it (prompt → proposal) and after finalize (preview, GitHub push); replace the
> middle. Add a **`build_jobs`** run-log table so builds are durable, streamable,
> and resumable. The **sandbox filesystem is the source of truth**, not
> `apps.files_json`/`html_code` (snapshot to storage on pause).

---

## 5. Sandbox rules (E2B)

- **Abstract the sandbox behind a single `SandboxDriver` interface** (create,
  writeFiles, exec, startDevServer, getPreviewUrl, snapshot, destroy). Never call
  the E2B SDK directly from app code. This is non-negotiable: it's how we migrate
  to Fly Machines / self-hosted Firecracker later without touching the product.
- One sandbox per active project. **Idle sandboxes must auto-suspend/teardown** —
  they are the main compute cost. Snapshot files to Supabase storage on suspend.
- The agent runs **inside** the sandbox. Our orchestrator process never executes
  user-generated code directly.
- Treat every sandbox as hostile to every other. No shared filesystem, no shared
  network, no shared secrets across projects/users.

---

## 6. Model & billing rules (critical — do not get this wrong)

- **Authenticate the Agent SDK with `ANTHROPIC_API_KEY` (prepaid API credits).
  NEVER via a Claude subscription / OAuth login.** As of June 15, 2026 headless
  SDK usage on subscription plans draws from a separate metered credit — unsuitable
  for a multi-user product. This product runs on API billing, full stop.
- **Model routing for unit economics:**
  - Default workhorse: **Sonnet 4.6** (1M context, lower cost) for most edits.
  - Escalation: **Opus 4.8** only for hard multi-file / architectural tasks.
  - Route by task difficulty, not by default-to-the-biggest-model.
- **Meter everything.** Every model call logs `{user_id, project_id, input_tokens,
  output_tokens, model, cost_usd}` to Supabase. No usage may be un-metered — this
  is the basis for pricing, quotas, and abuse limits (Layer 10).
- Per-user token/cost quotas enforced before a session starts, not after.

---

## 7. Security & multi-tenancy

- Supabase **Row Level Security** on every table. A user can only ever read/write
  their own projects, sandboxes, and usage rows.
- **No hardcoded secrets.** All keys via env. Maintain `.env.example`.
- The agent's permission layer: auto-approve safe file edits; **gate destructive
  or sensitive ops** (deletes, deploys, network calls to new hosts, package installs
  from untrusted sources) behind explicit policy. Never auto-run `rm -rf`, key
  exfiltration, or deploys without a guard.
- Sanitize/validate all user prompts before they reach the agent loop.
- Compliance: PDPA (Malaysia) baseline; GDPR posture if serving global users.

---

## 8. Coding conventions

- TypeScript everywhere. **Reality check: `tsconfig.json` is currently `strict: false`** —
  strict mode is the *target*; enable it incrementally (it will surface real errors in
  the v1 KEEP code). No *new* `any` without a written reason (e.g. `lib/build-types.ts`
  keeps loose index signatures on `parseAgentOutput` payloads — documented inline).
- Server logic in route handlers / server actions; keep secrets server-side only.
- Small, single-purpose modules. The `SandboxDriver` and `AgentRunner` are the
  two load-bearing abstractions — keep their interfaces clean and provider-agnostic.
- **Commit to GitHub at the end of every layer**, not at the end of the project.
- Update this CLAUDE.md whenever an architectural decision changes.

---

## 9. Build status

Framework: Raudhah Tech 10-Layer Build Framework — **Phase 0 (Audit) nearly done.**

> **GATE 0 — partially closed (full status in `GAP_CHECKLIST.md`):**
> ✅ `git rm --cached .env.local` (was tracked with live keys) · ✅ v8–v11 engine
> archived to `v1-archive` (local, **unpushed**) · ✅ `.env.example` added.
> ⚠️ **STILL OPEN:** rotate the GitHub PAT in `.git/config` (also revoked — blocks all
> `git push`); encrypt `user_github_connections.access_token`; delete the duplicate
> `jarvisfactory 2` folder. Stage-4 S1 proceeded with these open (they don't affect the
> extraction) — **close them before any deploy.**

- [x] Phase 0 Step 1 — Codebase scan (Claude Code) ✓ done 2026-06-11
- [x] Phase 0 Step 2 — 10-layer gap audit (Claude Chat) ✓ see PHASE0_LAYER_AUDIT.md
- [x] Phase 0 Step 3 — GAP_CHECKLIST.md + handoff ✓ done 2026-06-11 (see GAP_CHECKLIST.md)
- [~] Stage 4 — Build v2 engine — **in progress**: ✅ **S1** extract builder at the
  `approveBuild()` seam (`3bf4e45`→`e01e2ef`; orchestration now in `lib/build-pipeline.ts`,
  a temporary scaffold to be **deleted at S3** once `AgentRunner` replaces it). Next:
  S2 `SandboxDriver` + `AgentRunner` → S3 server orchestrator + `build_jobs` → S4 preview
  → S5 deploy re-point → S6 metering → S7 cleanup/hardening.
- [ ] Stage 5 — QA / GO–NO-GO
- [ ] Stage 6 — Deploy + ops

---

## 10. Open questions (resolve during Phase 0)

- Exact boundary of the v1 generation engine — what's coupled to it?
- Does the current Supabase schema model "projects" in a way that extends to live
  sandboxes, or does it need new tables (sandboxes, usage_ledger)?
- Serverless timeout limits vs. long agent sessions — do we need a dedicated
  long-running runner service from day one?
- E2B template: what base image / preinstalled toolchain do user projects need?
