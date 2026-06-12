# ADR 0001: Migrate from Next.js to a Vite SPA + Hono Node API (single container)

- Status: accepted
- Date: 2026-06-12
- Supersedes: none

## Context

ezclaude (JarvisFactory v2) currently runs as a Next.js 14 App Router app inside
one Cloudflare Container (`worker/container.ts` → `EzClaudeContainer`, `node server.js`
from the Next standalone build). The Agent SDK requires Node, which is why the whole
app already runs in a container rather than a plain Worker.

Reality of the codebase makes Next.js a poor fit going forward:

- **No SSR value is being used.** Every page is `'use client'`
  (`app/page.tsx`, `app/auth/page.tsx`, `app/studio/page.tsx`, `app/builder/page.tsx`,
  `app/dashboard/page.tsx`, `app/onboarding/page.tsx`). They use inline-style objects,
  no Tailwind, no component lib, and do all data loading client-side. We pay the full
  Next.js build/runtime complexity (`output: standalone`, `outputFileTracingIncludes`
  hacks in `next.config.js` to drag the `claude` binary into the bundle) for zero SSR benefit.
- **Auth is bifurcated and fragile.** `middleware.ts` does cookie-based SSR session
  refresh via `@supabase/ssr` (`utils/supabase/middleware.ts`), `utils/supabase/server.ts`
  reads cookies via `next/headers`, and `lib/supabase/authed.ts` derives the user from the
  **cookie** session (`ssr.auth.getUser()`, `authed.ts:23-26`) and only uses an
  `Authorization: Bearer` token to forward to *data* queries for RLS scoping
  (`authed.ts:33-40`). So today, identity is cookie-bound — making Bearer the sole auth path
  is a genuine **rewrite** of the identity source (`getUser(token)`), not just dropping a
  fallback. We maintain two auth paths.
- The API route handlers already use Web-standard `Request`/`Response` and
  `ReadableStream` SSE (`app/api/agent/chat/route.ts`, `app/api/build/route.ts`,
  `app/api/agent/cowork/route.ts`), so they are not deeply coupled to Next.

The founder has **locked** the target architecture (see Decision). This ADR records it.

## Decision

Replace Next.js with two co-deployed pieces, built and shipped in **one Cloudflare Container**:

1. **Frontend — Vite + React + TypeScript + React Router** (`web/`). A static SPA.
   Ports the six pages 1:1 from `app/*/page.tsx`. `next/navigation` (`useRouter`,
   `useSearchParams`) → `react-router-dom` (`useNavigate`, `useSearchParams`).
   `NEXT_PUBLIC_*` → `import.meta.env.VITE_*`. Output is a static `web/dist/`.

2. **Backend — Hono on Node** (`server/`). Ports the 11 API route handlers 1:1.
   Their Web-standard `Request`/`Response` and `ReadableStream` SSE map directly onto
   Hono's `c.req.raw` / `c.body(stream)` / `streamSSE`. The Agent SDK `query()` loop
   (`lib/agent/claude-runner.ts`) is plain Node and runs unchanged. Hono **also serves
   the SPA's static `dist/`** (catch-all → `index.html` for client routing).

3. **One container, no CORS.** The Hono Node server listens on port 3000 inside the
   same `EzClaudeContainer`, serving both `/api/*` and the SPA. This drops in where
   `node server.js` (Next standalone) is today.

**Auth model converts from cookie/middleware to token/guards:**
- Route protection moves from `middleware.ts` (server-side cookie check) to **client-side
  React Router guards** that read the Supabase browser session.
- Every authenticated API call sends `Authorization: Bearer <supabase access_token>`.
  The Hono API validates that JWT — `lib/supabase/authed.ts` is **rewritten** to identify
  the user from the Bearer token (`getUser(token)`) instead of the cookie session, and the
  `next/headers` path is dropped. (It already forwards a Bearer token to data queries, but
  not for identity — see Context.)

`sandbox-worker/` (the separate per-build sandbox bridge Worker) is **out of scope and
untouched**.

## Consequences

### Positive
- One auth path (Bearer JWT), not two. Removes `middleware.ts`, `utils/supabase/server.ts`,
  `utils/supabase/middleware.ts`, and the `next/headers` cookie machinery.
- Simpler, faster builds: a static Vite bundle + a plain Node entry. Deletes
  `next.config.js`'s `outputFileTracingIncludes` hack and the `.next/standalone` copy
  dance in the `Dockerfile`.
- The API surface barely changes — handlers already speak Web `Request`/`Response`.
- Future-friendly: the SPA can later be served from Cloudflare's static asset/CDN layer
  while the Node API stays in the container, with no app rewrite.

### Negative
- Loss of any future SSR/SEO option for marketing pages without re-introducing a renderer.
  Accepted: these pages are already client-only.
- One genuinely risky conversion: the **GitHub routes** (`app/api/github/*`) authenticate
  via cookies (`utils/supabase/server.ts`), not Bearer, and the dashboard does **not**
  currently send a token. These must be converted, or they break under the SPA.
- The GitHub OAuth callback is a redirect flow that derives the user from the cookie
  session (`app/api/github/oauth/callback/route.ts`). With no SSR cookie, the callback
  can no longer read the Supabase user the same way — the redirect/identity handoff must
  be reworked (see Spec → Auth model).
- **`/api/chat` is a live, unauthenticated, unmetered Anthropic proxy.** It forwards the
  browser's calls to `api.anthropic.com` with the server `ANTHROPIC_API_KEY`
  (`app/api/chat/route.ts:2-3`), driven by `lib/claude-client.ts` (browser code imported by
  `app/builder/page.tsx:10`). It is **not** legacy/dead. Left public it lets anyone burn API
  credits, violating CLAUDE.md §6 ("meter everything"). The migration gates it behind
  `requireUser` + metering, and `lib/claude-client.ts` is reclassified as browser code that
  moves into `web/` (not server `lib/`).

### Neutral
- `image_vars` / build-arg inlining of public vars moves from `next build` semantics to
  Vite's `import.meta.env` inlining; the Dockerfile still passes them as build args.
- Per-build sandbox compute is unaffected (it lives in `sandbox-worker/`).

## Alternatives Considered

The architecture is founder-locked; alternatives are recorded only for the rationale trail.

- **Stay on Next.js, just clean up auth** — rejected: keeps the standalone-build and
  file-tracing complexity with no SSR payoff, and leaves two auth paths.
- **Two separate deploys (SPA on CDN + API in container)** — rejected for now: introduces
  CORS and a second deploy target; the locked decision is one container, no CORS.

## Implementation Notes

High-level only; full sequencing in `docs/plans/2026-06-12-nextjs-to-vite-hono.md`.

1. Scaffold `web/` (Vite SPA + React Router) and port pages, pointed at the existing API.
2. Stand up `server/` (Hono) and port the 11 routes 1:1, preserving SSE streaming.
3. Convert auth: client guards + Bearer everywhere; rewrite the GitHub routes and the
   OAuth callback off cookies.
4. Re-point `Dockerfile` / `wrangler.jsonc` / `worker/container.ts` to the
   Vite-build + Hono-serve container; delete `next.config.js`, `next-env.d.ts`,
   `middleware.ts`, `utils/supabase/{server,middleware}.ts`, and `app/`.
