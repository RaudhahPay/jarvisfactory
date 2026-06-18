# ezclaude — Runtime & Deploy Architecture Plan

> Authored 2026-06-17. The architecture for the core product promise that is **not
> yet real**: a non-technical user (awam) builds a webapp by chatting, it **runs
> live in a sandbox here**, they click **Deploy** and it **goes live on a
> subdomain**, and they can **connect a Supabase backend easily**. Today the build
> produces a single flattened `index.html` previewed via `srcDoc`, the sandbox
> defaults to a **stub** driver, there is **no deploy/subdomain route**, and every
> app shares the platform Supabase. This plan closes that gap.

---

## Appendix Z: Execution-environment choice & engine reusability (plain English)

Two ways to run the apps users build. This is the biggest architecture fork.

- **A. WebContainer** = run the app **inside the user's browser** (StackBlitz
  WebContainers / Nodebox). Used by Bolt.new.
- **B. Cloud sandbox** = run the app on **a server we pay for** (Cloudflare
  Containers / e2b / Firecracker / Fly). Used by Lovable. **ezclaude already
  picked B.**

### Ease

| | A. WebContainer | B. Cloud sandbox |
|---|---|---|
| Speed to start | Very fast, no wait | Slower (seconds, cold start) |
| Setup work | Easy — runs in the tab | Harder — manage servers, proxy, sleep/wake |
| What it can run | Frontend + Node only; no Python, no real DB | Anything — Python, DB, any tool |
| Crash safety | Tab closes = app gone | Keeps running on the server |

### Cost

| | A. WebContainer | B. Cloud sandbox |
|---|---|---|
| Who pays compute | The user's computer (free for us) | We do (server bills) |
| Cost at 1000 builders | Almost zero | High — each running box costs money |
| Main cost risk | None | Boxes left running = big bill → MUST auto-sleep |
| License | WebContainer needs a paid commercial license | No license; pay cloud usage |

**Takeaway:** A = cheaper + easier but weak (no real backend). B = pricier +
harder but powerful (real apps + Supabase + real go-live). B is the right pick
*for this product* — the price is that we must build sleep/wake + deploy (this
plan). Do not reconsider A unless we drop the "real backend" promise.

**Within B, chosen provider = Blaxel** (see §2.A). A managed Firecracker-microVM
sandbox (TS SDK `@blaxel/core`) that gives **perpetual standby** (auto-pause →
near-zero idle cost) and **built-in preview URLs** — i.e. it hands us the two
hardest/most-expensive pieces of option B for free, instead of us building the
`sandbox-worker` bridge + lifecycle + proxy ourselves. Blaxel = the *sandbox*
(run/edit, ephemeral). Cloudflare stays the *app shell host* and the *deploy
target* (static/edge + subdomain, §3). The `SandboxDriver` seam keeps Blaxel
swappable.

### Can the engine serve the public? (yes)

The core engine is the **Claude Agent SDK** (Anthropic's official agent loop).
- It is **general** — not locked to one app type; it plans, edits files, runs
  commands, fixes errors for any project.
- It **scales to many users** — one engine session per project; 1000 users =
  1000 sessions.
- The limit is **not the engine — it is the sandboxes (compute) and the API
  tokens (money).** So metering + per-user quotas are mandatory before launch.
- Must use **API-key billing**, never a personal Claude subscription, for a
  multi-user product.

**Bottom line:** the engine is public-ready (general + scalable). What is not yet
public-ready is the infra *around* it — live sandbox, deploy, metering, cost
control — which is exactly §A/§B/§E of this plan.

---

## 0. Current state (grounded in code, 2026-06-17)

- **App host:** ezclaude itself is live on a Cloudflare Container (Vite SPA + Hono).
- **Sandbox:** `lib/sandbox/` has a `SandboxDriver` interface with `stub-driver.ts`
  (default — returns a fake `*.preview.local` URL) and `cloudflare-driver.ts`
  (real, talks to `sandbox-worker/` over HTTP, but not the active path). Selected
  by `SANDBOX_PROVIDER`.
- **Build:** `web/src/routes/Builder.tsx` runs the v1 generation engine → one
  `index.html`; preview is `srcDoc` HTML, not a running dev server. `useV2Build`
  + `previewUrl` exist but resolve to the stub.
- **Backend for built apps:** `lib/jarvis-backend.ts` injects the **platform's
  shared Supabase** (`app_users`/`app_data` keyed by `app_id`, SHA-256 client-side
  password hashing — weak). No per-app backend.
- **Deploy / go-live:** none. `apps.cloudflare_url` / `custom_domain` /
  `custom_domain_status` columns exist but are unwired. The only "publish" path is
  `github.save` (push `index.html` to a GitHub repo). No `server/routes/deploy.ts`,
  no subdomain routing.
- **Metering:** `usage_ledger` intended; model calls not all metered.

---

## 1. Target architecture (the seams)

Two distinct runtime targets — keep them separate, this is the central decision:

| | **Preview (ephemeral)** | **Deploy (durable)** |
|---|---|---|
| Where | per-project **sandbox** (Cloudflare Sandbox SDK via `sandbox-worker/`) | stable **static/edge host** |
| Lifetime | warm while editing; **idle auto-suspend** + snapshot | permanent until user deletes |
| URL | `*.preview.ezclaude.app` (or sandbox preview URL) | `app-slug.ezclaude.app` (+ custom domain) |
| Purpose | watch the agent build & test live | the app the user ships |

```
User prompt
  → Hono orchestrator (server/routes/build.ts) → ensure sandbox (SandboxDriver)
  → AgentRunner writes files INTO sandbox, runs install + dev server
  → preview proxy exposes sandbox dev server  → live iframe (Preview)
  → "Deploy" → snapshot sandbox files → publish to durable host → assign subdomain
  → token meter records every model call (usage_ledger)
```

`SandboxDriver` and `AgentRunner` stay the two load-bearing, provider-agnostic
abstractions. Never call the Cloudflare Sandbox SDK from app code — only through
the driver. This is how we keep the option to move to Fly/Firecracker later.

---

## 2. Workstreams

### A. Real sandbox execution — "run their webapp here" (CLAUDE.md Stage 4 S2–S4)

**DECISION (2026-06-17): use Blaxel as the sandbox provider** (`SANDBOX_PROVIDER=blaxel`),
implemented as a new `lib/sandbox/blaxel-driver.ts` behind the existing
`SandboxDriver` interface. Rationale: Blaxel (Firecracker microVMs, TS SDK
`@blaxel/core`) ships the two hardest, most expensive pieces we have **not** built —
**perpetual standby** (auto-pause after ~15s idle → pay snapshot storage only, near-
zero idle compute, our #1 cost risk) and **built-in per-port preview URLs** (most of
Layer 5). Resume <25ms, cold start ~100–125ms, microVM isolation for untrusted AI
code, SOC2/ISO/HIPAA. The `cloudflare-driver` + `sandbox-worker/` bridge stays as a
fallback/alt provider but is no longer the primary path. The `SandboxDriver` seam
keeps us swappable.

Blaxel SDK → `SandboxDriver` mapping:
- `SandboxInstance.createIfNotExists({ name, image, memory, ports, region })` → `create()`/`resume()`
- filesystem REST API → `writeFiles()` / `writeFilesBase64()`
- processes/commands API → `exec()` / `startDevServer()`
- preview URL per port → `getPreviewUrl()`
- standby/pause → `suspend()` (near-free idle); snapshot API → `snapshot()`; delete → `destroy()`

Steps:
1. Add `@blaxel/core`; write `lib/sandbox/blaxel-driver.ts` implementing every
   `SandboxDriver` method; select via `SANDBOX_PROVIDER=blaxel` in `lib/sandbox/index.ts`.
2. `AgentRunner`: write the agent's file tree into the sandbox, run install + start
   the dev server; stream tool/edit events to the chat UI.
3. **Preview proxy:** use Blaxel's per-port preview URL directly (or front it with
   `<project>.preview.ezclaude.app`); the Builder iframe points at the real URL
   (replace `srcDoc`).
4. **`build_jobs`** run-log table → builds become durable, streamable, resumable.
5. **Sandbox lifecycle:** lean on Blaxel standby for idle cost; still snapshot the
   file tree to Supabase storage as our own durable source of truth (not vendor-
   locked). Sandbox filesystem is the source of truth, **not** `apps.files_json`/
   `html_code`. Meter every model call regardless (§E).

### B. Free subdomain — "go live", the default (roadmap F3; ship first, lowest effort)
1. Acquire one apex (e.g. `ezclaude.app`); wildcard DNS `*.ezclaude.app` → an edge
   **router Worker**.
2. On **Deploy**: snapshot sandbox files → build static output → publish to the
   durable host (see §3) → assign `app-slug-xxxx.ezclaude.app`.
3. Router Worker maps `Host` subdomain → `app_id` → serves that deployment.
4. Persist `apps.cloudflare_url`; show it as the app's live link. Reserve
   `*.preview.ezclaude.app` for the ephemeral sandbox preview (§A.3).

### C. Custom domain — upsell (Builder+ tier)
- Use **Cloudflare for SaaS / Custom Hostnames**: user enters `app.kedai.com` →
  API returns CNAME (+ TXT) → they add it at their registrar → cert auto-issues →
  flip `custom_domain_status` → `active`; router maps the hostname → `app_id`.

### D. Easy Supabase connect
- **Tier A — Shared, hardened (default, Starter):** keep the zero-config model but
  replace the SHA-256 shim with the platform project's **Supabase Auth (GoTrue)** +
  real **RLS** scoped per `app_id`.
- **Tier B — BYO Supabase (Builder+, "dedicated"):** new `app_backends` table
  (keys **encrypted at rest**). "Connect your database" flow: paste URL + anon key
  (+ service-role for migrations only, never shipped to browser) → validate →
  bootstrap auth tables + RLS into *their* project → build injects **their**
  `SUPABASE_URL`/anon key.
- **Tier C — One-click provision (long term):** Supabase Management API OAuth →
  auto-create a project for the user.

### E. Metering (cross-cutting, non-negotiable — CLAUDE.md §6)
- Every model call logs `{user_id, project_id, input_tokens, output_tokens, model,
  cost_usd}` to `usage_ledger`. Per-user quota enforced **before** a session starts.
  No un-metered usage.

---

## 3. Decision: where deployed apps are hosted

Pick the durable host for the **Deploy** target. Options:

| Option | Fit | Notes |
|---|---|---|
| **Cloudflare Workers Static Assets** (Worker + assets binding) | ✅ Preferred for SPA/static + light API | one platform, wildcard routing via a router Worker, cheap, fast cold paths |
| Cloudflare Pages (per-project) | 🟡 | per-project project creation via API; more moving parts for multi-tenant subdomains |
| R2 + router Worker | 🟡 | pure static; need a Worker to serve + route; no server runtime for the app |
| Keep apps in a long-lived sandbox | ❌ | compute cost per app does not scale; sandboxes are for *editing*, not hosting |

**Recommendation:** publish the built static output to **Cloudflare (Workers Static
Assets / R2) behind one router Worker** that resolves `Host → app_id`. Apps that
need a backend use Supabase (Tier A/B), so the durable host can stay static + edge —
no per-app server process to pay for. Revisit only if user apps need server-side
runtime beyond Supabase.

---

## 4. Data model additions

- **`build_jobs`** — `{id, app_id, user_id, status, phase, sandbox_id, started_at,
  finished_at, log_ref}`; durable build run-log (streamable/resumable).
- **`sandboxes`** — `{id, app_id, provider, status, preview_url, last_active_at,
  snapshot_path}`; drives idle auto-suspend.
- **`app_deployments`** (or extend `apps`) — `{app_id, subdomain, cloudflare_url,
  custom_domain, custom_domain_status, deployed_at, version}`.
- **`app_backends`** — `{app_id, provider, supabase_url, anon_key(enc),
  service_role(enc), status}`; BYO Supabase (Tier B).
- **`usage_ledger`** — `{user_id, project_id, input_tokens, output_tokens, model,
  cost_usd, created_at}`; metering.

RLS on every table — a user only ever reads/writes their own rows.

---

## 5. Sequencing (lowest-effort / highest-value first)

```
1. Free subdomain wiring (B)        → the "it's live" moment; smallest, highest value
2. Real sandbox + preview proxy (A) → apps actually RUN, not srcDoc
3. Deploy route + app_deployments   → snapshot → publish → subdomain (one button)
4. Harden shared Supabase auth (D-A)→ real auth/RLS, kill SHA-256
5. Metering (E)                     → gate before pricing
6. BYO Supabase (D-B)               → "dedicated database" tier
7. Custom domain (C)                → Builder+ upsell
8. One-click Supabase provision (D-C)→ long term
```
Dependencies: B/C need the durable host (§3); A needs the `sandbox-worker/` bridge
on a Workers Paid plan; D-B/C need the secrets/encryption work; E is cross-cutting
and should land alongside A.

## 6. Risks
1. **Sandbox compute cost** — largely mitigated by Blaxel perpetual standby
   (near-zero idle), but still verify real per-second/standby pricing at scale and
   keep metering (§E). Was the top $ risk; Blaxel is the chosen mitigation.
2. **Un-metered model calls** (E) — can't price or cap.
3. **Multi-tenant isolation** — every sandbox/app hostile to every other; no shared
   fs/network/secrets; RLS verified per `app_id`.
4. **Secrets at rest** — encrypt BYO Supabase keys; never expose service-role to the
   browser or other tenants.
5. **Promise gap** — until A + B land, the product is "HTML generator + preview",
   not "build → run → go live".

## 7. Definition of "architecturally good for this"
The product is ready for the core promise when, for a non-technical user:
build (multi-file) → **runs live in a sandbox** → click Deploy → **live on
`app.ezclaude.app`** in one step → optionally **connect Supabase** in a few clicks →
every model call metered. Items A + B + step 3 + D-A are the minimum bar.
```
```
