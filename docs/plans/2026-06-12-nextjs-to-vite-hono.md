# Next.js → Vite SPA + Hono API Migration — Implementation Plan

> For agentic execution: implement task-by-task. Each task is TDD (write the
> failing test, watch it fail, write minimal code, watch it pass, commit).
> Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace Next.js with a static Vite/React/React-Router SPA (`web/`) plus a
standalone Hono Node API (`server/`), both served from one Cloudflare Container.
**Architecture:** `web/` builds to `dist/`; `server/` (Hono on `@hono/node-server`)
serves `/api/*` and statically serves `dist/` with a catch-all to `index.html`. Auth
moves from cookie/middleware to client route guards + `Authorization: Bearer <jwt>`,
validated server-side. `lib/` stays Node and is imported by `server/`. `sandbox-worker/`
is untouched.
**Stack:** Vite + React 18 + TypeScript + react-router-dom (web); Hono +
@hono/node-server (server); Node 22; @anthropic-ai/claude-agent-sdk; Supabase JS;
Cloudflare Container (`EzClaudeContainer`, `standard-2`, port 3000). Spec:
`docs/specs/2026-06-12-nextjs-to-vite-hono.md`. ADR:
`docs/decisions/0001-nextjs-to-vite-spa-plus-hono-api.md`.

> **No test runner exists today** (`package.json` has only `dev`/`build`/`start`, no
> deps for testing). **Task 0 adds Vitest** so every subsequent TDD step has a runner.
> Run web tests with `npx vitest run web`, server tests with `npx vitest run server`.

> **Riskiest tasks, called out up front:**
> - **Phase C (auth conversion)** — Tasks C1–C4. The GitHub routes use cookies and the
>   dashboard sends no token today; the OAuth callback derives identity from the cookie.
>   De-risk: convert `lib/supabase/authed.ts` to Bearer-only first (C1) with unit tests,
>   then do GitHub last (C3–C4) behind integration tests.
> - **Agent SDK streaming under Hono** — Tasks B2, B5. De-risk with a streaming smoke test
>   (Task B2) that asserts incremental SSE frames before porting the heavy routes.
> - **Container build** — Tasks D1–D3. De-risk by building the image locally on
>   `linux/amd64` and running the existing 200/401 smoke checklist before deleting `app/`.

---

## Phase A — Scaffold Vite SPA + React Router, port pages (points at existing API)

> Phase A leaves the **Next.js app still running**; the SPA is built/tested in `web/` in
> parallel and proxies `/api/*` to the existing Next dev server during dev.

### Task 0: Add Vitest + workspace scaffolding

**Files:**
- Modify: `package.json` (add devDeps: `vitest`, `@testing-library/react`, `jsdom`,
  `@vitejs/plugin-react`, `vite`, `react-router-dom`; add `test` script)
- Create: `vitest.config.ts`
- Test: `web/src/__smoke__/runner.test.ts`

- [x] **Step 1 — Failing test:** `web/src/__smoke__/runner.test.ts` with
      `it('runs', () => expect(1+1).toBe(2))`.
- [x] **Step 2 — Verify it fails:** `npx vitest run` → fails (no vitest installed).
- [x] **Step 3 — Implement:** add deps + `vitest.config.ts` (jsdom env for `web`). **Decide
      the `@/` path alias now:** ported files keep `@/lib/...` imports and `web/` imports the
      shared `lib/build-types.ts` across a dir boundary. Define `@/` → repo root in both
      `web/tsconfig.json` + `web/vite.config.ts` (`resolve.alias`) and `server/tsconfig.json`,
      and mirror it in `vitest.config.ts` so tests resolve. Server `lib/` imports stay `@/lib/*`.
- [x] **Step 4 — Verify it passes:** `npx vitest run` → 1 passed.
- [x] **Step 5 — Commit:** `chore: add vitest + vite/react-router deps for migration`.

### Task A1: SPA shell — router + public routes render

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`,
  `web/src/main.tsx`, `web/src/App.tsx`
- Test: `web/src/App.test.tsx`

- [x] **Step 1 — Failing test:** render `<MemoryRouter initialEntries={['/']}><App/></MemoryRouter>`;
      assert a landing marker is in the document; assert `/auth` route renders an Auth marker.
- [x] **Step 2 — Verify it fails:** `npx vitest run web/src/App.test.tsx` → module not found.
- [x] **Step 3 — Implement:** `App.tsx` with `<Routes>` for `/`, `/auth`, `/studio`,
      `/builder`, `/dashboard`, `/onboarding` using placeholder components; `main.tsx`
      mounts `<BrowserRouter>`; `vite.config.ts` sets `server.proxy['/api']` →
      `http://localhost:3000` (the Next dev server) for Phase A.
- [x] **Step 4 — Verify it passes:** `npx vitest run web/src/App.test.tsx` → PASS.
- [x] **Step 5 — Commit:** `feat(web): vite SPA shell + react-router routes`.

### Task A2: Supabase browser client + session helper

**Files:**
- Create: `web/src/lib/supabase.ts` (from `utils/supabase/client.ts`),
  `web/src/auth/session.ts` (`getAccessToken()`)
- Test: `web/src/auth/session.test.ts`

- [x] **Step 1 — Failing test:** mock `supabase.auth.getSession`; assert
      `getAccessToken()` returns the session `access_token`, and `undefined` when no session.
- [x] **Step 2 — Verify it fails:** `npx vitest run web/src/auth/session.test.ts` → fail.
- [x] **Step 3 — Implement:** `supabase.ts` uses `createBrowserClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)`;
      `session.ts` `getAccessToken()` wraps `auth.getSession()`.
- [x] **Step 4 — Verify it passes:** PASS.
- [x] **Step 5 — Commit:** `feat(web): supabase browser client + getAccessToken`.

### Task A3: API fetch wrapper (attaches Bearer)

**Files:**
- Create: `web/src/lib/api.ts`
- Test: `web/src/lib/api.test.ts`

- [x] **Step 1 — Failing test:** stub `getAccessToken` → `'tok'` and global `fetch`;
      call `apiFetch('/api/x')`; assert outgoing headers include `Authorization: Bearer tok`;
      assert no header when no token.
- [x] **Step 2 — Verify it fails:** fail (module missing).
- [x] **Step 3 — Implement:** `apiFetch(path, init)` merges `Authorization` from
      `getAccessToken()`; passes through `init` (incl. `signal`, streaming bodies).
- [x] **Step 4 — Verify it passes:** PASS.
- [x] **Step 5 — Commit:** `feat(web): apiFetch wrapper attaches supabase bearer token`.

### Task A4: Port Landing + Auth + Onboarding pages

**Files:**
- Create: `web/src/routes/Landing.tsx` (from `app/page.tsx`),
  `web/src/routes/Auth.tsx` (from `app/auth/page.tsx`),
  `web/src/routes/Onboarding.tsx` (from `app/onboarding/page.tsx`)
- Test: `web/src/routes/Landing.test.tsx`

- [ ] **Step 1 — Failing test:** render `Landing`; assert its primary CTA renders and a
      click calls `navigate` (mock `useNavigate`).
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** copy page bodies verbatim; replace `'use client'`/
      `import { useRouter } from 'next/navigation'` with `import { useNavigate } from 'react-router-dom'`
      and `router.push` → `navigate`; inline styles unchanged.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(web): port landing, auth, onboarding pages`.

### Task A5: Port Studio + Builder + Dashboard pages

**Files:**
- Create: `web/src/routes/Studio.tsx` (from `app/studio/page.tsx`),
  `web/src/routes/Builder.tsx` (+ `builder/useBuildPipeline.ts`, `builder/useV2Build.ts`),
  `web/src/routes/Dashboard.tsx` (from `app/dashboard/page.tsx`)
- Move: `lib/build-client.ts` → `web/src/lib/build-client.ts`,
  `lib/claude-client.ts` → `web/src/lib/claude-client.ts` (**browser** code, imported by
  Builder; calls `/api/chat`)
- Test: `web/src/routes/Studio.test.tsx`

- [ ] **Step 1 — Failing test:** render `Studio`; mock `apiFetch`; assert the conversations
      list fetch goes through `apiFetch` (so the Bearer wrapper is used, replacing studio's
      hand-rolled `getSession`/Bearer at `app/studio/page.tsx:166-198`).
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** port all three; swap `useRouter`/`useSearchParams`
      (`next/navigation`) → `react-router-dom`; route every `/api/*` call through `apiFetch`;
      `useV2Build.ts` reads `import.meta.env.VITE_V2_ENGINE` (was `NEXT_PUBLIC_V*`);
      `build-client.ts` `streamBuild` posts via `apiFetch`. **`claude-client.ts` moves with
      Builder** — its `@/lib/claude-client` import becomes a `web/`-local module; its
      `fetch('/api/chat')` calls (`claude-client.ts:60,125`) go through `apiFetch` so the
      v1 browser build path carries the Bearer token. (Dashboard GitHub-token fix is Phase C —
      here just route through `apiFetch`.)
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(web): port studio, builder, dashboard + move build-client`.

---

## Phase B — Stand up Hono server, port API routes 1:1

> Phase B builds `server/` alongside Next. Run it on a **different port** (e.g. 3001)
> during dev; point `web` proxy at it once parity is proven. Routes import `lib/`
> unchanged. Auth still flows through the existing `getAuthedDb` Bearer path (Phase C
> tightens it).

### Task B1: Hono app + static serving + health route

**Files:**
- Modify: `package.json` (add `hono`, `@hono/node-server`, `tsx`/`esbuild`)
- Create: `server/index.ts`
- Test: `server/index.test.ts`

- [ ] **Step 1 — Failing test:** `app.request('/api/health')` → 200 `{ ok: true }`;
      `app.request('/unknown')` → serves `index.html` fallback (assert 200 + html marker).
- [ ] **Step 2 — Verify it fails:** fail (no `server/index.ts`).
- [ ] **Step 3 — Implement:** Hono app; `GET /api/health`; `serveStatic({ root: web/dist })`;
      catch-all `* → index.html` registered **after** `/api/*`; `serve({ fetch: app.fetch, port: 3000 })`
      guarded so tests import the app without binding the port.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(server): hono app, health route, static SPA serving`.

### Task B2: SSE streaming smoke route (de-risk streaming)

**Files:**
- Create: `server/routes/_smoke.stream.ts` (temporary; deleted in Task D4)
- Test: `server/routes/_smoke.stream.test.ts`

- [ ] **Step 1 — Failing test:** call the smoke route; read the response body as a stream;
      assert it yields ≥2 `data:` frames **incrementally** (not one buffered blob) and the
      stream closes — proving SSE works under `@hono/node-server`.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** route returns `c.body(new ReadableStream(...))` with
      `text/event-stream` headers, enqueuing two `data: {...}\n\n` frames with a tick between —
      the exact pattern from `app/api/agent/chat/route.ts:80-155`.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `test(server): SSE streaming smoke proves hono preserves chunking`.

### Task B3: Port non-streaming routes — conversations + chat

**Files:**
- Create: `server/routes/conversations.ts` (from `app/api/conversations/route.ts` +
  `conversations/[id]/route.ts`), `server/routes/chat.ts` (from `app/api/chat/route.ts`)
- Test: `server/routes/conversations.test.ts`

- [ ] **Step 1 — Failing test:** with a mocked authed `db`, `GET /api/conversations`
      returns the user's rows as JSON; `GET /api/conversations/:id` returns one thread.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** port handler bodies; `req.json()`→`c.req.json()`,
      `Response.json(x,{status})`→`c.json(x,status)`; `[id]` param → `c.req.param('id')`;
      mount on the Hono app. **`chat.ts`** is the Anthropic proxy (`app/api/chat/route.ts`) —
      port the upstream-forward logic as-is here; auth + metering are added in C2 (Q1 resolved:
      it is **not** public). Keep `ANTHROPIC_API_KEY` server-side.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(server): port conversations + chat routes to hono`.

### Task B4: Port agent/file route

**Files:**
- Create: `server/routes/agent.file.ts` (from `app/api/agent/file/route.ts`)
- Test: `server/routes/agent.file.test.ts`

- [ ] **Step 1 — Failing test:** mocked authed `db` + stub sandbox; assert the route
      returns the expected JSON for a file read/write request, and 401 without auth.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** port handler; same `c.req`/`c.json` mechanics; `lib/` imports
      unchanged.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(server): port agent/file route to hono`.

### Task B5: Port streaming routes — agent/chat, agent/cowork, build

**Files:**
- Create: `server/routes/agent.chat.ts`, `server/routes/agent.cowork.ts`,
  `server/routes/build.ts` (from the matching `app/api/...` routes)
- Test: `server/routes/agent.chat.test.ts`, `server/routes/build.test.ts`

- [ ] **Step 1 — Failing test:** `agent.chat`: mock the Anthropic upstream fetch to emit
      two SSE deltas; assert the route streams a `conversation` frame then `text` frames then
      `done`, in order. `build`: with the **stub** sandbox driver (`SANDBOX_PROVIDER` unset)
      + a stub agent runner, assert it streams `meta` → agent events → `done` and writes a
      `build_jobs` row (mocked `db`).
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** port the three handlers; reuse the exact `ReadableStream`
      bodies (they are already framework-agnostic), returning via `c.body(stream, { headers })`;
      `lib/agent` / `lib/sandbox` imports unchanged; the `for await (query(...))` loop in
      `lib/agent/claude-runner.ts` runs as-is.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(server): port agent/chat, cowork, build streaming routes`.

---

## Phase C — Convert auth: cookie/middleware → token/guards

> Depends on Phase A (client `apiFetch`) and Phase B (Hono routes mounted). This phase
> makes Bearer the *only* server auth path and adds client guards. **Riskiest phase.**

### Task C1: `getAuthedDb` → Bearer-only **identity** (REWRITE, not a deletion)

> Risk note: today `authed.ts` gets the user from the **cookie** session
> (`ssr.auth.getUser()`); the Bearer token is only forwarded to *data* queries. This task
> **rewrites the identity source** to `supabase.auth.getUser(token)`. Test token
> present / absent / expired / malformed hard — this is the load-bearing auth change.


**Files:**
- Rewrite: `lib/supabase/authed.ts`
- Create: `server/middleware/auth.ts` (`requireUser(c)`)
- Test: `server/middleware/auth.test.ts`

- [ ] **Step 1 — Failing test:** `requireUser` with a valid Bearer → `{ user, db }` (db
      forwards the token); missing/empty header → 401; malformed (`Authorization: foo`) → 401.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** rewrite `authed.ts` to take the `Authorization` header value
      (not `next/headers`), validate via `supabase.auth.getUser(token)`, build the RLS-scoped
      `db` with `global.headers.Authorization` (logic already at `authed.ts:43-48`); read
      `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. `requireUser(c)` extracts
      `c.req.header('authorization')` and returns `{ user, db }` or throws a 401.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `refactor(auth): bearer-only authed db; add requireUser middleware`.

### Task C2: Route all protected Hono routes through `requireUser`

**Files:**
- Modify: `server/routes/agent.chat.ts`, `agent.cowork.ts`, `agent.file.ts`, `build.ts`,
  `conversations.ts`, `chat.ts`
- Test: `server/routes/auth-enforcement.test.ts`

- [ ] **Step 1 — Failing test:** parametrized over the six routes (incl. `chat.ts`) — no/invalid
      Bearer → 401; valid Bearer → not 401.
- [ ] **Step 2 — Verify it fails:** fail (routes still use the old `getAuthedDb` signature;
      `chat.ts` has no auth yet).
- [ ] **Step 3 — Implement:** replace each route's `getAuthedDb()` call with
      `requireUser(c)`; keep the `{ user, db }` destructure identical downstream. For `chat.ts`
      (Q1): add `requireUser(c)` and record usage via `lib/metering.ts` (mirror the agent
      routes) so the Anthropic proxy is authenticated **and** metered, not an open credit drain.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(server): enforce bearer auth on all protected routes`.

### Task C3: Rewrite GitHub save/pull routes to Bearer

**Files:**
- Create: `server/routes/github.save.ts` (save + save-v2),
  `server/routes/github.pull.ts` (pull + pull-v2)
- Test: `server/routes/github.save.test.ts`

- [ ] **Step 1 — Failing test:** no Bearer → 401; valid Bearer + mocked
      `user_github_connections` + GitHub API → repo create/update path returns
      `{ ok: true, repo_url }` (mirrors `app/api/github/save/route.ts:185`).
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** port the four GitHub handlers; replace
      `createClient()` (cookie ssr, `utils/supabase/server.ts`) with `requireUser(c)` for
      identity + RLS `db`; GitHub fetch logic unchanged.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(server): port github save/pull routes to bearer auth`.

### Task C4: Rewrite GitHub OAuth callback (cookie redirect → SPA + Bearer exchange)

**Files:**
- Create: `server/routes/github.oauth.ts` (`POST /api/github/oauth/exchange`),
  `web/src/routes/GithubCallback.tsx`; register route in `web/src/App.tsx`
  (`/auth/github/callback`)
- Modify: `web/src/routes/Dashboard.tsx` (authorize URL `redirect_uri` → SPA callback;
  `VITE_GITHUB_OAUTH_CLIENT_ID`)
- Test: `server/routes/github.oauth.test.ts`

- [ ] **Step 1 — Failing test:** `POST /api/github/oauth/exchange { code }` with no Bearer
      → 401; with valid Bearer + mocked GitHub token-exchange + `/user` → upserts
      `user_github_connections` and returns `{ ok: true, username }`.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** server endpoint reuses the exchange/`/user`/upsert logic from
      `app/api/github/oauth/callback/route.ts:28-78` but identifies the user via
      `requireUser(c)`; `GithubCallback.tsx` reads `?code`, POSTs it via `apiFetch`, then
      `navigate('/dashboard?github=connected'|'?github_error=...')`. Dashboard authorize URL
      points `redirect_uri` at `/auth/github/callback`.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit (+ external note):** `feat(github): SPA oauth callback + bearer code exchange`
      — and flag: GitHub OAuth app redirect URI must be updated at cutover (Spec Open Q3).

### Task C5: Client route guards (replace middleware.ts)

**Files:**
- Create: `web/src/auth/RequireAuth.tsx`; wrap guarded routes in `web/src/App.tsx`
- Test: `web/src/auth/RequireAuth.test.tsx`

- [ ] **Step 1 — Failing test:** with a mocked session present → renders children; with no
      session → renders a `<Navigate to="/auth">` (assert redirect).
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** `RequireAuth` reads `supabase.auth.getSession()` (loading
      state → spinner), redirects to `/auth` when absent; wrap `/studio`, `/builder`,
      `/dashboard`, `/onboarding` (the exact set `middleware.ts:9` matched). `/` and `/auth`
      stay public. Add an API-401 handler in `apiFetch` that signs out + redirects.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `feat(web): client route guards replace next middleware`.

---

## Phase D — Re-point container to SPA+API; delete Next.js

> Depends on A–C green. After this phase the app ships from `server/dist/index.js` and
> Next is gone. `sandbox-worker/` stays untouched throughout.

### Task D1: Env var rename (VITE_/SUPABASE_) across config + .env.example

**Files:**
- Modify: `wrangler.jsonc` (`image_vars`/`vars`: `NEXT_PUBLIC_*` → `VITE_*` build args +
  server `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`), `worker/container.ts` (`envVars` keys),
  `.env.example`
- Test: `server/config.test.ts`

- [ ] **Step 1 — Failing test:** a small `server/config.ts` `loadServerEnv()` reads
      `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` from `process.env` and throws a clear error
      if missing; assert present-case returns them, missing-case throws.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** add `loadServerEnv()`; update `wrangler.jsonc`,
      `worker/container.ts` env maps, and `.env.example` to the new names (mapping table in
      the Spec → Env Var Mapping). `import.meta.env.VITE_*` already used in `web/`.
- [ ] **Step 4 — Verify it passes:** PASS.
- [ ] **Step 5 — Commit:** `chore(config): rename env vars to VITE_/SUPABASE_; update wrangler+container`.

### Task D2: Rewrite Dockerfile (vite build + hono serve)

**Files:**
- Rewrite: `Dockerfile`
- Modify: `package.json` (root `build` → builds `web` + `server`)
- Test: `scripts/docker-build-smoke.sh` (build + run + curl checks)

- [ ] **Step 1 — Failing test:** `scripts/docker-build-smoke.sh` builds the image on
      `linux/amd64`, runs it, and curls `/` → 200, `/studio` → 200 (SPA fallback),
      `/api/health` → 200, `/api/agent/chat` (no auth) → 401. Initially fails (old Dockerfile
      builds Next).
- [ ] **Step 2 — Verify it fails:** run the script → fail.
- [ ] **Step 3 — Implement:** rewrite `Dockerfile`: `deps` (npm ci, keep
      `claude-agent-sdk-linux-x64`), `builder` (`vite build` with `VITE_*` build args →
      `web/dist`; compile `server/` → `server/dist`), `runner` (keep `git` +
      `ca-certificates`; copy `server/dist`, `web/dist`, server `node_modules` incl. the
      agent SDK + `-linux-x64`; `CMD ["node", "server/dist/index.js"]`, `PORT=3000`). Drop the
      `.next/standalone` copies.
- [ ] **Step 4 — Verify it passes:** smoke script → all checks PASS.
- [ ] **Step 5 — Commit:** `build: dockerfile builds vite SPA + hono server (drop next standalone)`.

### Task D3: Point web dev proxy + prod at the Hono server

**Files:**
- Modify: `web/vite.config.ts` (dev proxy → Hono port), `docker-compose.yml`,
  `Dockerfile.dev`, `docker-README.md`
- Test: covered by D2 smoke script (no new unit test)

- [ ] **Step 1 — Failing test:** re-run `scripts/docker-build-smoke.sh` after switching the
      build entry to the Hono server end-to-end; the SPA must load from the container (not the
      removed Next server). Fails until compose/dev artifacts point at Hono.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** update dev artifacts to run `vite` + `node server/dist/index.js`
      (or `tsx server/index.ts`); vite dev proxy `/api` → Hono dev port.
- [ ] **Step 4 — Verify it passes:** smoke script PASS.
- [ ] **Step 5 — Commit:** `build: dev/compose artifacts target hono server`.

### Task D4: Delete Next.js and dead auth/config files

**Files:**
- Delete: `app/` (all pages + API routes), `next.config.js`, `next-env.d.ts`,
  `middleware.ts`, `utils/supabase/server.ts`, `utils/supabase/middleware.ts`,
  `server/routes/_smoke.stream.ts`, `web/src/__smoke__/runner.test.ts`
- Modify: `package.json` (remove `next`, `@supabase/ssr` if unused after; drop
  `dev/build/start` next scripts), `tsconfig.json` (drop next plugin/`.next` refs)
- Test: full suite + docker smoke

- [ ] **Step 1 — Failing test:** add `scripts/no-next.test` assertion (grep) that the repo
      contains no `next` import and no `app/` dir; fails while they exist.
- [ ] **Step 2 — Verify it fails:** fail.
- [ ] **Step 3 — Implement:** delete the files above; clean `package.json`/`tsconfig.json`;
      remove `outputFileTracingIncludes` references.
- [ ] **Step 4 — Verify it passes:** `npx vitest run` all green + `scripts/docker-build-smoke.sh`
      PASS + the no-next grep passes.
- [ ] **Step 5 — Commit:** `chore: remove next.js, middleware, cookie auth — vite+hono cutover complete`.

---

## Self-review

1. **Spec coverage** — every Spec disposition has a task: pages (A4–A5), all 11 API
   routes (B3–B5, C3–C4), `authed.ts` (C1), env mapping (D1), Dockerfile/wrangler/
   container (D1–D3), deletions (D4), GitHub OAuth rework (C4). ✓
2. **Placeholder scan** — no TBD/TODO; each code step names exact files and the verbatim
   patterns to reuse (with source line refs). ✓
3. **Type/interface consistency** — `requireUser(c) → { user, db }` matches the
   `getAuthedDb()` destructure used in every ported route (C1 establishes it, B-routes and
   C2 consume it); `apiFetch` is the single client transport used by A3/A5/C4. ✓
4. **Risk handling** — streaming de-risked before heavy ports (B2 before B5); auth Bearer
   core before GitHub (C1 before C3–C4); container smoke (D2) before deleting `app/` (D4). ✓
