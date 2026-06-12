# Next.js → Vite SPA + Hono API Migration — Design Spec

- Status: draft
- Date: 2026-06-12
- Related PRD/issue: founder-locked migration directive (this task)
- ADR: docs/decisions/0001-nextjs-to-vite-spa-plus-hono-api.md

## Context

ezclaude runs as a Next.js 14 App Router app in one Cloudflare Container. All pages
are `'use client'` with inline styles (no SSR data-loading to preserve), and the API
route handlers already use Web-standard `Request`/`Response` + `ReadableStream` SSE.
The Agent SDK needs Node. The founder has locked a move to a **static Vite + React +
React Router SPA** plus a **standalone Hono Node API**, both served from **one
Cloudflare Container** (Hono serves `/api/*` and the SPA `dist/`). This spec defines
the target structure, the auth conversion, env mapping, deploy-artifact changes, and a
file-by-file disposition table. `sandbox-worker/` is out of scope and untouched.

## Approach

Two co-located build outputs, one runtime:

- `web/` — Vite SPA. Pages port 1:1 from `app/*/page.tsx`; only navigation, env-var,
  and auth-token glue changes. Built to `web/dist/`.
- `server/` — Hono Node server. Route handlers port 1:1 from `app/api/**/route.ts`
  (Web `Request`/`Response` → Hono context). Serves the API and statically serves
  `web/dist/`, with a catch-all → `index.html` for client-side routing.
- `lib/` stays server-side and is imported by `server/` unchanged (the Agent SDK loop,
  sandbox driver, metering, claude-client, etc.). The single browser-facing module
  (`lib/build-client.ts`) moves into `web/`. Shared types (`lib/build-types.ts`,
  `lib/agent/types.ts` types) are imported by both.

Why this over the status quo: the API is already transport-portable, there is no SSR to
lose, and collapsing to one auth path (Bearer JWT) removes the Next middleware/cookie
machinery. See ADR 0001.

## Architecture

### Target repo layout

```
web/                      # Vite SPA (NEW)
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx              # React root + <BrowserRouter>
    App.tsx               # <Routes>: / /auth /studio /builder /dashboard /onboarding
    routes/
      Landing.tsx         # from app/page.tsx
      Auth.tsx            # from app/auth/page.tsx
      Studio.tsx          # from app/studio/page.tsx
      Builder.tsx         # from app/builder/page.tsx (+ useBuildPipeline, useV2Build)
      Dashboard.tsx       # from app/dashboard/page.tsx
      Onboarding.tsx      # from app/onboarding/page.tsx
    auth/
      RequireAuth.tsx     # client route guard (replaces middleware.ts)
      session.ts          # supabase browser client + getAccessToken()
    lib/
      api.ts              # fetch wrapper that attaches Authorization: Bearer
      build-client.ts     # MOVED from lib/build-client.ts
      supabase.ts         # MOVED/REWRITTEN from utils/supabase/client.ts

server/                   # Hono Node API + static host (NEW)
  index.ts                # Hono app, @hono/node-server serve(), serveStatic(dist)
  middleware/auth.ts      # requireUser(): validate Supabase JWT from Bearer
  routes/
    agent.chat.ts         # from app/api/agent/chat/route.ts
    agent.cowork.ts       # from app/api/agent/cowork/route.ts
    agent.file.ts         # from app/api/agent/file/route.ts
    build.ts              # from app/api/build/route.ts
    chat.ts               # from app/api/chat/route.ts
    conversations.ts      # from app/api/conversations/route.ts (+ [id])
    github.oauth.ts       # from app/api/github/oauth/callback/route.ts
    github.pull.ts        # pull + pull-v2
    github.save.ts        # save + save-v2

lib/                      # KEEP (server-side). Imported by server/.
  supabase/authed.ts      # REWRITE: Bearer-only (drop next/headers fallback)
  ... agent/, sandbox/, metering, claude-client, models, etc. unchanged

worker/container.ts       # REWRITE: env wiring (Next → Vite/Hono)
Dockerfile                # REWRITE: vite build + hono build, serve dist
wrangler.jsonc            # REWRITE: image_vars NEXT_PUBLIC_* → VITE_*
sandbox-worker/           # UNTOUCHED
```

### Data flow (unchanged in spirit)

```
Browser (SPA)
  → React Router renders a page (client-only)
  → page calls server/lib/api.ts → fetch('/api/...', Authorization: Bearer <jwt>)
  → Hono (same origin, same container) → requireUser() validates JWT
  → handler runs lib/ (Agent SDK, sandbox driver, metering)
  → SSE stream back to the page (build/cowork/chat) OR JSON (github, conversations)
```

No cross-origin hop: the SPA and API share the container origin, so no CORS.

### Streaming preservation (riskiest mechanical port)

The streaming routes build a `new ReadableStream<Uint8Array>` that enqueues
`data: ${JSON}\n\n` SSE frames and return it with `Content-Type: text/event-stream`
(`app/api/agent/chat/route.ts:80-155`, `app/api/build/route.ts:89,194`,
`app/api/agent/cowork/route.ts:88-156`). In Hono:

- Return the same `ReadableStream` via `return c.body(stream, { headers: {...} })`, OR
  use `streamSSE(c, async (s) => {...})`. Either preserves chunked SSE under
  `@hono/node-server`.
- The Agent SDK `for await (const message of query({...}))` loop in
  `lib/agent/claude-runner.ts:101-115` is pure Node and is imported unchanged.
- Keep `runtime = 'nodejs'` semantics implicitly (the whole server is Node). The Next
  `maxDuration` exports (120/300) become irrelevant — the container has no serverless
  cap; document the timeout is now governed by the container/`sleepAfter`.

## Auth Model Conversion (the hard part)

### Today
- `middleware.ts` matches `/dashboard|/builder|/onboarding|/studio` → `updateSession`
  (`utils/supabase/middleware.ts`) refreshes the cookie session and redirects to `/auth`
  if no user.
- `utils/supabase/client.ts` — browser session via `createBrowserClient`.
- `utils/supabase/server.ts` — reads cookies via `next/headers`; used by GitHub routes.
- `lib/supabase/authed.ts` — **already** prefers `Authorization: Bearer`, falls back to
  cookie session via the ssr client.
- Client token use: **only `app/studio/page.tsx` sends Bearer today**
  (`studio/page.tsx:74,166-167,174,198`). The dashboard GitHub calls
  (`dashboard/page.tsx:90,115`) send **no token** — they rely on cookies.

### Target
1. **Client route guards** replace `middleware.ts`. `web/src/auth/RequireAuth.tsx`
   reads the Supabase browser session; if none, `<Navigate to="/auth" />`. Wrap
   `/dashboard`, `/builder`, `/onboarding`, `/studio` (same set `middleware.ts` matched).
   `/` and `/auth` stay public. This is best-effort UX gating only — real enforcement is
   server-side per request (below).
2. **Bearer on every authenticated request.** `web/src/lib/api.ts` wraps `fetch`, calls
   `getAccessToken()` (`supabase.auth.getSession()`), and sets
   `Authorization: Bearer <token>`. All page fetches route through it — including the
   dashboard GitHub calls that send nothing today.
3. **Server validates JWT from Bearer only.** `lib/supabase/authed.ts` is rewritten to
   read the token from the `Authorization` header off the Hono request and drop the
   `next/headers` cookie fallback. `server/middleware/auth.ts` exposes `requireUser(c)`
   → `{ user, db }` (or 401), reused by every protected route.

### Per-route auth disposition

| Route | Auth today | Sends token today | Target |
|---|---|---|---|
| `POST /api/agent/chat` | `getAuthedDb` (Bearer-pref) | studio: yes | Bearer required |
| `POST /api/agent/cowork` | `getAuthedDb` | studio: yes | Bearer required |
| `POST /api/agent/file` | `getAuthedDb` | studio: yes | Bearer required |
| `POST /api/build` | `getAuthedDb` | builder: **verify** | Bearer required |
| `POST /api/chat` | **none** (Anthropic proxy) | builder (browser via `lib/claude-client.ts`) | **Bearer required + meter** (Q1 resolved — see below) |
| `GET/POST /api/conversations` | `getAuthedDb` | studio: yes | Bearer required |
| `GET /api/conversations/[id]` | `getAuthedDb` | studio: yes | Bearer required |
| `POST /api/github/save` (+ v2) | cookie `createClient()` | **no** | **REWRITE to Bearer** |
| `POST /api/github/pull` (+ v2) | cookie `createClient()` | **no** | **REWRITE to Bearer** |
| `GET /api/github/oauth/callback` | cookie `createClient()` | redirect flow | **REWRITE** (see below) |

### GitHub OAuth callback rework (open design point, resolved here)

`app/api/github/oauth/callback/route.ts` is a browser **redirect** landing
(`github.com → /api/github/oauth/callback?code=...`). It currently derives the Supabase
user from the **cookie** session (`createClient()` → `auth.getUser()`,
`callback/route.ts:59-63`) and then `NextResponse.redirect`s to `/dashboard`.

With no SSR cookie, the callback cannot read the Supabase user from a header (the browser
follows GitHub's redirect with no `Authorization` header). Chosen conversion:

- Make the OAuth callback an **SPA route**, not an API route. Register
  `https://<app>/auth/github/callback` as the GitHub OAuth redirect URI. A new SPA route
  `web/src/routes/GithubCallback.tsx` reads `?code` from the URL, then POSTs it to a
  Hono endpoint **with the Bearer token** (`POST /api/github/oauth/exchange { code }`).
- The Hono endpoint does the `code → access_token` exchange + GitHub `/user` fetch +
  `user_github_connections` upsert exactly as today (`callback/route.ts:28-78`), but
  identifies the Supabase user from the **Bearer JWT** instead of the cookie, then
  returns JSON. The SPA route then `navigate('/dashboard?github=connected')`.
- This preserves the existing token-exchange logic; only the user-identity source and the
  redirect mechanics change. The `?github_error=` / `?github=connected` query params the
  dashboard reads stay the same (now set client-side).

> Note: the GitHub authorize URL is built client-side in
> `app/dashboard/page.tsx:77-79` from `NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID`; update its
> `redirect_uri` to the new SPA callback route and map the var to `VITE_*`.

## Env Var Mapping

`process.env.*` inventory (from `grep` over `app lib utils worker`):

| Var | Used by | Lands as |
|---|---|---|
| `ANTHROPIC_API_KEY` | server (agent) | server-side, `wrangler secret` (`process.env` in `server/`) |
| `GITHUB_OAUTH_CLIENT_SECRET` | github callback | server-side secret |
| `GITHUB_OAUTH_CLIENT_ID` | github callback | server-side var (also public id below) |
| `SANDBOX_BRIDGE_TOKEN` | sandbox driver | server-side secret |
| `SANDBOX_BRIDGE_URL` | sandbox driver | server-side var |
| `SANDBOX_PROVIDER` | sandbox driver | server-side var |
| `DEFAULT_MONTHLY_COST_LIMIT_USD` | metering | server-side var |
| `AGENT_RUNNER` | agent index | server-side var |
| `NEXT_PUBLIC_SUPABASE_URL` | client + `lib/supabase/authed.ts` | **client → `VITE_SUPABASE_URL`**; server reads its own `process.env.SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + authed.ts | **client → `VITE_SUPABASE_PUBLISHABLE_KEY`**; server reads `process.env.SUPABASE_PUBLISHABLE_KEY` |
| `NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID` | `dashboard/page.tsx:77,79` | **client → `VITE_GITHUB_OAUTH_CLIENT_ID`** |
| `NEXT_PUBLIC_V2_ENGINE` / `NEXT_PUBLIC_V*` | `builder/page.tsx`, `useV2Build.ts` | **client → `VITE_V2_ENGINE`** |

Rules:
- Client (`web/`): only `VITE_*`, read via `import.meta.env.VITE_*`, inlined at Vite build.
  These are public by design (they already are in `wrangler.jsonc` `image_vars`).
- Server (`server/` + `lib/`): plain `process.env.*`. Where `lib/supabase/authed.ts` reads
  `NEXT_PUBLIC_SUPABASE_*` today (`authed.ts:44`), give the server its own non-prefixed
  copies (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) so server code no longer depends on a
  client naming convention.
- Maintain `.env.example` with the new names.

## Deploy Artifact Changes

- **`Dockerfile`** (REWRITE): replace the Next standalone flow. `deps` stage installs both
  workspaces' deps (incl. the `claude-agent-sdk-linux-x64` optional binary, still needed).
  `builder` stage runs `vite build` (→ `web/dist`, passing `VITE_*` build args) and compiles
  `server/` (tsc/esbuild → `server/dist`). `runner` stage keeps `git` + `ca-certificates`
  (the `claude` CLI shells to git), copies `server/dist`, `web/dist`, and the server's
  `node_modules` (must include `@anthropic-ai/claude-agent-sdk` + `-linux-x64`), then
  `CMD ["node", "server/dist/index.js"]` listening on `PORT=3000`. Drop the `.next/standalone`
  / `.next/static` copies and the `next.config.js` file-tracing hack.
- **`wrangler.jsonc`** (REWRITE): keep the container/DO/migrations block as-is
  (`EzClaudeContainer`, `standard-2`, `max_instances`, port 3000). Rename `image_vars` and
  `vars` `NEXT_PUBLIC_*` → the `VITE_*` build args + server `SUPABASE_*`. No new Worker.
- **`worker/container.ts`** (REWRITE — small): the `envVars` map keys `NEXT_PUBLIC_*` →
  the server-side `SUPABASE_*` / `VITE_*` build-arg counterparts; `defaultPort = 3000` and
  `sleepAfter` unchanged. The Worker `fetch` front door is unchanged.
- **DELETE**: `next.config.js`, `next-env.d.ts`, `middleware.ts`,
  `utils/supabase/server.ts`, `utils/supabase/middleware.ts`, `app/` (all pages + API
  routes once ported). `app/api/chat/route.ts` only after Q1 is resolved.

## File-by-File Disposition

Legend: KEEP (in place, unchanged) · MOVE (relocate, minimal edits) · REWRITE (logic/auth
change) · DELETE.

### Pages (`app/*/page.tsx`)
| File | Disposition | Target |
|---|---|---|
| `app/layout.tsx` | REWRITE | `web/index.html` + `web/src/main.tsx` (root/providers) |
| `app/page.tsx` | MOVE | `web/src/routes/Landing.tsx` (`next/navigation`→`react-router-dom`) |
| `app/auth/page.tsx` | MOVE | `web/src/routes/Auth.tsx` |
| `app/studio/page.tsx` | MOVE | `web/src/routes/Studio.tsx` (already Bearer-aware) |
| `app/builder/page.tsx` | MOVE | `web/src/routes/Builder.tsx` (+ `useSearchParams` swap) |
| `app/builder/useBuildPipeline.ts` | MOVE | `web/src/routes/builder/useBuildPipeline.ts` |
| `app/builder/useV2Build.ts` | MOVE | `web/src/routes/builder/useV2Build.ts` (VITE env) |
| `app/dashboard/page.tsx` | REWRITE | `web/src/routes/Dashboard.tsx` (add Bearer to github fetch; GH redirect_uri) |
| `app/onboarding/page.tsx` | MOVE | `web/src/routes/Onboarding.tsx` |

### API routes (`app/api/**/route.ts`)
| File | Disposition | Target | Note |
|---|---|---|---|
| `agent/chat/route.ts` | MOVE | `server/routes/agent.chat.ts` | SSE; `getAuthedDb`→`requireUser` |
| `agent/cowork/route.ts` | MOVE | `server/routes/agent.cowork.ts` | SSE + sandbox |
| `agent/file/route.ts` | MOVE | `server/routes/agent.file.ts` | |
| `build/route.ts` | MOVE | `server/routes/build.ts` | SSE + Agent SDK |
| `chat/route.ts` | REWRITE | `server/routes/chat.ts` | Anthropic proxy; add `requireUser` + metering (Q1) |
| `conversations/route.ts` | MOVE | `server/routes/conversations.ts` | |
| `conversations/[id]/route.ts` | MOVE | `server/routes/conversations.ts` (`:id`) | |
| `github/oauth/callback/route.ts` | REWRITE | `server/routes/github.oauth.ts` (`/exchange`) + SPA `GithubCallback.tsx` | cookie→Bearer; redirect→SPA |
| `github/pull/route.ts` | REWRITE | `server/routes/github.pull.ts` | cookie→Bearer |
| `github/pull-v2/route.ts` | REWRITE | `server/routes/github.pull.ts` (v2) | cookie→Bearer |
| `github/save/route.ts` | REWRITE | `server/routes/github.save.ts` | cookie→Bearer |
| `github/save-v2/route.ts` | REWRITE | `server/routes/github.save.ts` (v2) | cookie→Bearer |

### lib (`lib/*`) — server-side unless noted
| File | Disposition | Note |
|---|---|---|
| `lib/agent/**` | KEEP | imported by `server/`; Agent SDK loop is Node |
| `lib/sandbox/**` | KEEP | driver + bridge client |
| `lib/metering.ts`, `lib/models.ts`, `lib/agents.ts`, `lib/templates.ts`, `lib/jarvis-*`, `lib/build-pipeline.ts`, `lib/builder-*` | KEEP | server-side |
| `lib/supabase/authed.ts` | REWRITE | Bearer-only **identity** (`getUser(token)`, not cookie); drop `next/headers`; read `SUPABASE_*` |
| `lib/build-types.ts` | KEEP (shared) | types only; imported by both `web/` and `server/` |
| `lib/build-client.ts` | MOVE | → `web/src/lib/build-client.ts` (browser transport) |
| `lib/claude-client.ts` | MOVE | → `web/src/lib/claude-client.ts` — **browser** code (lifted from `app/builder/page.tsx`, calls `/api/chat`; imported by `Builder.tsx`). Was misclassified KEEP. |

### utils + config
| File | Disposition | Note |
|---|---|---|
| `utils/supabase/client.ts` | MOVE/REWRITE | → `web/src/lib/supabase.ts` (`VITE_*`) |
| `utils/supabase/server.ts` | DELETE | replaced by `server/middleware/auth.ts` |
| `utils/supabase/middleware.ts` | DELETE | replaced by client `RequireAuth` |
| `middleware.ts` | DELETE | replaced by client guards |
| `next.config.js` | DELETE | |
| `next-env.d.ts` | DELETE | |
| `package.json` | REWRITE | new deps (vite, react-router-dom, hono, @hono/node-server, tsx/esbuild); scripts (`dev`, `build` per workspace); drop `next` |
| `Dockerfile` | REWRITE | vite+hono build, serve dist |
| `Dockerfile.dev`, `docker-compose.yml`, `docker-README.md` | REWRITE | dev flow now Vite + Hono |
| `wrangler.jsonc` | REWRITE | env var rename only |
| `worker/container.ts` | REWRITE | envVars key rename |
| `sandbox-worker/**` | KEEP (untouched) | separate worker, out of scope |

## Error Handling

- **API layer (Hono):** `requireUser` returns `401` JSON when the Bearer JWT is missing/
  invalid (mirrors `Response.json({ error: 'Not authenticated' }, { status: 401 })` today).
  Quota (`checkQuota` → 402), validation (`validatePrompt` → 400), and 500s carry over
  verbatim from the route bodies.
- **Streaming:** errors mid-stream are emitted as `data: {"type":"error",...}` SSE frames
  and the stream is closed (existing pattern in chat/cowork/build); preserved under Hono.
- **SPA guard:** `RequireAuth` redirects to `/auth` on no session; API 401 from an expired
  token triggers a client-side sign-out + redirect to `/auth` (new, since middleware no
  longer refreshes cookies — token refresh is the Supabase browser client's job).
- **OAuth callback:** GitHub error / missing-code / save-failed cases map to
  `navigate('/dashboard?github_error=...')` client-side (same query contract as today).

## Testing Strategy

- **Unit:** `lib/supabase/authed.ts` Bearer extraction (token present/absent/malformed);
  `web/src/lib/api.ts` attaches the header; `RequireAuth` redirect logic.
- **Integration (per ported route):** hit the Hono route with a valid/invalid Bearer and
  assert status + (for streaming routes) that SSE frames arrive in order and the stream
  closes. Build/cowork integration uses the sandbox **stub** driver (`SANDBOX_PROVIDER`
  unset) so no real container is needed.
- **Streaming smoke (highest risk):** assert `/api/agent/chat` and `/api/build` produce
  incremental `data:` frames under `@hono/node-server` (not buffered to the end).
- **Auth E2E:** sign in → guarded route renders; sign out → guarded route redirects;
  GitHub connect round-trip (authorize → SPA callback → exchange → `?github=connected`).
- **Container build:** the Docker image builds on `linux/amd64`, serves `/`, `/studio`,
  `/auth` → 200, and `/api/agent/chat` → 401 unauth (the existing live-deploy checklist).
- **Manual/acceptance:** full build run end-to-end against the real sandbox bridge once the
  container is re-pointed (parity with the current live deploy).

## Open Questions

1. ~~**`app/api/chat/route.ts` auth + role.**~~ **RESOLVED.** It is **not** legacy: it's the
   server-side Anthropic proxy (`route.ts:2-3`) that hides `ANTHROPIC_API_KEY`, and it **is**
   called — by `lib/claude-client.ts` (browser code, imported by `app/builder/page.tsx:10`,
   `fetch('/api/chat')` at `claude-client.ts:60,125`). Left public it's an unmetered credit
   drain (violates CLAUDE.md §6). **Decision: port with `requireUser` + metering** (added to
   Task C2's enforced set; metering mirrors the other agent routes). `lib/claude-client.ts`
   moves into `web/` as browser code.
2. **Supabase token refresh under a long build.** A build/cowork SSE stream can run minutes;
   the Bearer token is captured at request start. Confirm the in-flight `db` client's token
   doesn't need mid-stream refresh (it didn't with cookies because RLS used the captured
   token too — likely fine, but verify against `recordUsage`/`messages` writes in the
   `finally` block of long streams).
3. **GitHub OAuth redirect URI registration.** Moving the callback to an SPA route
   (`/auth/github/callback`) requires updating the GitHub OAuth app's allowed redirect URI;
   that is an external config change to coordinate at cutover (not a code blocker).
4. **Static-serving root path collisions.** Confirm the Hono catch-all that serves
   `index.html` is registered *after* `/api/*` and `/assets/*` so client routes resolve but
   API routes are never shadowed.
