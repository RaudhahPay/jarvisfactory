# ezClaude — Engineering Handover

> Snapshot date: 2026-06-12. Living context for design rationale is in [`CLAUDE.md`](./CLAUDE.md).
> Env template: [`.env.example`](./.env.example) (copy to `.env.local`, fill real values — never commit it).

## 1. What it is
**ezClaude** (formerly "JarvisFactory v2") — *"Claude, made easy for non-coders."* One web app, three no-code modes on a shared Claude agent engine:
- **Ask** (`chat`) — conversational Claude (streaming, file uploads, model picker).
- **Create** (`cowork`) — Claude + Anthropic Agent Skills produce real **.docx/.pptx/.xlsx/.pdf/.csv** deliverables in a sandbox; downloadable.
- **Build** (`code`) — Claude builds a **self-contained static web app** (`index.html`) in a sandbox with a live preview URL.

It re-engines a v1 "code-generation" product. v1 surfaces (`/dashboard`, `/builder`) still exist and hold ~37 legacy apps.

## 2. Live environment
- **App:** https://ezclaude.ariavibecoderlab.workers.dev (Studio at `/studio`, legacy gallery at `/dashboard`)
- **Sandbox bridge:** https://jarvisfactory-sandbox.ariavibecoderlab.workers.dev
- **Repo:** https://github.com/RaudhahPay/jarvisfactory (branch `main`)
- **Cloudflare account:** ariavibecoderlab — Workers **Paid** plan (required for Containers)
- **Supabase project:** `jtvhhpnmpdduxlmikqtq`

## 3. Architecture (read this first — it's the non-obvious part)
The Claude **Agent SDK (`@anthropic-ai/claude-agent-sdk`) spawns a ~220 MB native `claude` binary as a Node subprocess.** It **cannot run on a Cloudflare Worker/edge.** Therefore:

```
Browser ──► Worker "ezclaude" (thin router, worker/container.ts)
              └─► Cloudflare CONTAINER (Durable Object EzClaudeContainer, standard-2)
                    └─ runs the full Next.js app (node server.js) + Agent SDK
                         └─ HTTP ──► Worker "jarvisfactory-sandbox" (sandbox-worker/)
                                       └─ @cloudflare/sandbox: per-build container + R2
```
- The **app** runs in a **Cloudflare Container** (not a Worker) because of the Node requirement.
- **Per-build sandboxes** (where the agent writes files / runs the preview server) live behind a **separate bridge Worker** (`sandbox-worker/`) wrapping `@cloudflare/sandbox@0.12.1` over HTTP. The Node app calls it via `lib/sandbox/cloudflare-driver.ts`.
- **Cowork deliverables** are persisted to an **R2 bucket `ezclaude-deliverables`** (bound to the bridge) so binary files survive sandbox sleep.

## 4. Stack
- Next.js 14.2 (App Router) · React 18 · TypeScript (`strict: false` — incremental target)
- **Inline-style objects, NO Tailwind** in the app shell (deliberate; match existing style)
- Supabase (Postgres + Auth + RLS) · Cloudflare (Containers, Workers, R2, Durable Objects)
- Anthropic Agent SDK `^0.3.173` (Node-only) · Docker buildx (`linux/amd64` images)

## 5. Repo map (key paths)
```
worker/container.ts          # CF Worker entry + EzClaudeContainer (injects runtime secrets)
wrangler.jsonc               # app Worker/Container config (image_vars = NEXT_PUBLIC build args)
Dockerfile                   # multi-stage; bakes the linux-x64 claude binary into the image
next.config.js               # output: 'standalone'
app/studio/page.tsx          # unified Ask/Create/Build UI (history sidebar, model picker, uploads, copy)
app/api/agent/chat/route.ts  # Ask  — Messages API stream + image/pdf blocks
app/api/agent/cowork/route.ts# Create— agent + skills -> deliverables -> R2
app/api/build/route.ts       # Build — agent -> static app -> preview server (port 8080)
app/api/agent/file/route.ts  # deliverable download (R2-first, live-sandbox fallback)
app/api/conversations/**     # history list + thread
lib/agent/{claude-runner,cowork,build,policy,index}.ts   # agent loop, briefings, command/path policy
lib/sandbox/{cloudflare-driver,stub-driver,types}.ts     # SandboxDriver abstraction
lib/{models,metering}.ts  ·  lib/supabase/authed.ts      # model allowlist, usage metering, RLS-scoped DB client
sandbox-worker/              # the bridge Worker (own wrangler.jsonc + Dockerfile + R2 binding)
CLAUDE.md                    # full design notes / prime directive (KEEP/REPLACE/ADD)
supabase-schema-v*.sql       # schema migrations (applied piecemeal — see Gotchas)
```

## 6. Environment & secrets
`.env.local` (gitignored) holds local dev values; production secrets are **Cloudflare Worker secrets** set with `wrangler secret put` — never in the repo.

| Variable | Where | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret (app, used at agent runtime) | prepaid API credits, **NOT** a subscription |
| `SANDBOX_BRIDGE_TOKEN` | secret (app) + `BRIDGE_TOKEN` secret (bridge) | shared bearer between app↔bridge |
| `GITHUB_OAUTH_CLIENT_SECRET` | secret (app) | GitHub OAuth |
| `NEXT_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` | `wrangler.jsonc` vars + image_vars | public by design |
| `SANDBOX_PROVIDER=cloudflare`, `SANDBOX_BRIDGE_URL`, `GITHUB_OAUTH_CLIENT_ID`, `DEFAULT_MONTHLY_COST_LIMIT_USD` | `wrangler.jsonc` vars | non-secret |

Runtime secrets reach the container via `EzClaudeContainer.envVars` in `worker/container.ts`. `NEXT_PUBLIC_*` are inlined at `next build` (Docker build args via `image_vars`) **and** passed at runtime so server-side reads work.

## 7. Run locally
```bash
npm install
# create .env.local from .env.example with real values (ask the owner)
npm run dev          # http://localhost:3000
```
With `ANTHROPIC_API_KEY` set → the **real** agent runs; without it → a stub runner. With `SANDBOX_PROVIDER=cloudflare` + a reachable bridge → real sandboxes; otherwise an in-memory stub. This means most of the app is exercisable locally without Cloudflare.

## 8. Deploy
```bash
# App (Docker buildx builds a linux/amd64 image, pushes to CF registry, deploys):
wrangler deploy
# Bridge:
cd sandbox-worker && wrangler deploy
# Secrets (once each):
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SANDBOX_BRIDGE_TOKEN
wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
cd sandbox-worker && wrangler secret put BRIDGE_TOKEN
```
> The image build is cross-arch (amd64) — slow on Apple Silicon. After deploy there is a **~1–2 min container rollout lag** during which the previous image still serves (new routes 404 until it cycles; then 401/200).

## 9. Database (Supabase `jtvhhpnmpdduxlmikqtq`, RLS on every table)
- **v2 tables:** `apps` (projects; `files_json` jsonb, `html_code`, `entry_point`, `sandbox_*`, `preview_url`), `conversations`, `messages`, `build_jobs`, `usage_events`, `profiles` (`monthly_cost_limit_usd`), `user_github_connections`.
- **Legacy / aux:** `app_data`, `app_sessions`, `app_users`, `domains`, `jarvis_*`, `waitlist`.
- RLS policy pattern: `auth.uid() = user_id`. The server uses a **token-forwarding client** (`lib/supabase/authed.ts`) so RLS resolves to the calling user (the default `@supabase/ssr` server client queries as anon and 404s under RLS — do not "fix" by widening policies).

## 10. SECURITY — do these FIRST
1. **Rotate the Anthropic API key** — it was exposed in an AI-assistant transcript during development. Issue a new key, set the worker secret, revoke the old.
2. **Rotate the GitHub PAT** that was in `.git/config` (already revoked once; confirm and re-issue if needed).
3. **Encrypt `user_github_connections.access_token`** — currently stored plaintext.
4. **Add rate-limiting** — only a per-user monthly **$** quota exists today (`usage_events` + `lib/metering.ts checkQuota`). Add abuse/rate limits before opening signups.

## 11. Known issues / tech debt / next up
- **Build = static apps only.** `lib/agent/build.ts` briefs the agent to produce a self-contained `index.html`; preview is `python3 -m http.server` on **port 8080**. Framework apps with their own dev server are not yet supported.
- **Cold starts** ~20–60 s (single shared instance `getContainer('ezclaude-main')`, `sleepAfter: 20m`). Consider a warm-ping or per-tenant instances.
- **PDF-in-chat** (Ask) sends a `document` block without the beta header — unverified; images are solid.
- **v1 vs v2 coexist** — `/studio` (v2) and `/dashboard` + `/builder` (v1) share the `apps` table. Decide whether to retire v1.
- **Schema applied piecemeal** — before trusting any column, diff the **live** schema vs `supabase-schema-v11..v15.sql`. (We hit this: `apps.files_json`/`entry_point` were missing in prod and broke Create/Build.)
- `tsconfig` is `strict: false` — tighten incrementally.
- Mixed code style — a Prettier-on-save hook on the original machine reflowed some files to double-quote/semicolon. Normalize with one Prettier pass + commit.

## 12. Gotchas cheat-sheet
- **Don't expose sandbox port 3000** — reserved by the sandbox SDK → `SandboxSecurityError`. Use 1024–65535 (we use 8080).
- **After `wrangler deploy`, wait out the rollout** before testing new routes.
- **Never copy host `node_modules` into the image** — `.dockerignore` excludes it so npm fetches the Linux `claude` binary in-container.
- The `claude` binary ships as an npm **optional platform package** (`@anthropic-ai/claude-agent-sdk-linux-x64`); the Dockerfile copies it explicitly into the standalone bundle.
- Container **image size must be ≤ instance disk** (standard-2 = 12 GB; our image ~1.5–2 GB).
