# ezclaude — Product Roadmap (Short & Long Term)

> Authored 2026-06-16. Living document. Source of truth for sequencing after the
> Next.js→Vite+Hono migration shipped and the app went live on Cloudflare
> Containers (https://ezclaude.nashih.workers.dev).
>
> Guiding principle (from Landing + founder): **"Make Claude easy. Build
> something real by chatting — no code."** Every decision is judged against one
> question: *would a non-technical Malaysian small-business owner (awam) succeed
> unaided?*

---

## 0. Where we are (honest status)

**Done**
- Migration Next.js → Vite SPA + Hono API (Phases A–D), 65 tests green, deployed.
- App live on Cloudflare Container; bun build pipeline; Bearer auth + route guards.
- All pages restyled to the Landing aesthetic via `web/src/lib/theme.ts`.
- staging pushed to origin with `.env` purged from history.

**Broken / blocking right now**
- Signup fails: Supabase `handle_new_user` trigger ("Database error saving new user").
- Anthropic API key leaked in history → must rotate.
- GitHub OAuth redirect URI not updated for the new domain.

**Not yet real (scaffold only — CLAUDE.md Stage 4)**
- SandboxDriver / AgentRunner real implementation (S2), server orchestrator +
  `build_jobs` (S3), preview proxy (S4), deploy re-point (S5), metering (S6),
  hardening (S7). The Builder still shows v1 generation-engine internals.

**UX debt (audit 2026-06-16)**
- Builder leaks IDE internals (raw HTML default, fake terminal, 11-field modal,
  JARVIS/ezclaude identity split, tokens/QA jargon).
- Dashboard over-exposes GitHub + 5-button cards + dead controls.
- Emoji-as-icons everywhere; no icon system.

---

## SHORT TERM — next ~2–3 weeks

Goal: **a non-technical user can sign up, describe an app in plain language, watch
it build, see a live preview, and not be scared or confused.** Plus close the
security holes that block a safe public launch.

### Sprint 1 (days 1–3): Unblock + secure — *nothing else matters until this is done*
| # | Task | Owner | Done when |
|---|------|-------|-----------|
| S1.1 | Fix Supabase `handle_new_user` trigger (schema-qualified + `search_path` + `on conflict do nothing`) | founder (SQL editor) | signup succeeds end-to-end on prod |
| S1.2 | Rotate Anthropic API key; `wrangler secret put ANTHROPIC_API_KEY` | founder | old key revoked, agent loop works on new key |
| S1.3 | Update GitHub OAuth redirect URI → `/auth/github/callback` on new domain | founder | "Connect GitHub" round-trips |
| S1.4 | Confirm `GITHUB_OAUTH_CLIENT_SECRET` + `SANDBOX_BRIDGE_TOKEN` set as wrangler secrets | founder | `wrangler secret list` shows all three |
| S1.5 | Rotate the GitHub PAT in `.git/config`; encrypt `user_github_connections.access_token` at rest | dev | no plaintext tokens in repo or DB |

### Sprint 2 (days 4–9): UX "one-day wins" → make Builder awam-safe
Implements the audit's P0 + highest-impact P1. One branch, test-gated.
| # | Task | Source |
|---|------|--------|
| S2.1 | **Builder defaults to Preview**, not raw code. Rename tabs "Preview / View code"; hide code behind a toggle | audit P0-1 |
| S2.2 | **Hide the fake terminal** behind an "Advanced/Logs" disclosure; replace with one plain status line ("Membina app anda…"); strip internal version strings | audit P0-2 |
| S2.3 | **Adopt `lucide-react`**; sweep emoji → SVG icons on both pages' chrome; add an `<Icon>` wrapper tied to `theme.ts` tones | audit P0-4 |
| S2.4 | **Unify identity**: frame JARVIS as "your ezclaude assistant" on first mention (or rename) | audit P0-5 |
| S2.5 | **Collapse Deep Discovery** to one optional textarea + prominent "Skip — let ezclaude handle it"; rest behind "Add detail" | audit P0-3 |
| S2.6 | **Demote GitHub** on Dashboard → outcome copy ("Save a backup copy"); cut card actions to Open + More(⋯) | audit P1-6/7 |
| S2.7 | **Remove dead controls** (Search/workspace switcher/`alert('coming soon')`) or gate behind honest "Soon" | audit P1-9 |
| S2.8 | Fix stale copy: proposal "Next.js + Supabase" → correct stack; "~RM7-10/1 build credit" → real metering or remove | audit bug note |

### Sprint 3 (days 10–15): Make the build real for ≥1 happy path
Turn the demo-grade build into a durable one for the simplest case.
| # | Task | CLAUDE.md |
|---|------|-----------|
| S3.1 | Wire `build_jobs` run-log table; builds become durable + resumable | Stage 4 S3 |
| S3.2 | Real `AgentRunner` for a single-file/simple app behind the existing `SandboxDriver` seam (stub→cloudflare) | Stage 4 S2 |
| S3.3 | Preview proxy: live sandbox dev-server → iframe in Builder | Stage 4 S4 |
| S3.4 | **Metering**: every model call logged to `usage_ledger` ({user, project, in/out tokens, model, cost}); enforce per-user quota *before* session start | CLAUDE.md §6 |

**Exit criteria for short term:** awam user signs up → types idea → sees a live
preview of a real (simple) app → makes one change by chatting → no jargon, no
terminal, no fear. Every model call metered. No leaked secrets.

---

## LONG TERM — ~1–4 months

Goal: **a sellable, multi-tenant product with healthy unit economics and a
one-click path from idea to a deployed app the user owns.**

### Theme A — Engine maturity (finish CLAUDE.md Stage 4–7)
- **A1. Full SandboxDriver on Cloudflare**: create/start/stop/destroy, snapshot to
  Supabase storage, idle auto-suspend (main cost lever). Keep provider-agnostic so
  Fly/Firecracker swap stays cheap.
- **A2. Multi-file, multi-step builds** with the real Agent SDK loop inside the
  sandbox; sandbox filesystem = source of truth (not `apps.files_json`).
- **A3. Model routing for unit economics**: Sonnet 4.6 default, Opus 4.8 only for
  hard multi-file/architectural tasks. Route by difficulty, not by default.
- **A4. Deploy flow**: one-click sandbox → Cloudflare (user owns it); re-point the
  v1 GitHub push path. Custom domain support.
- **A5. Hardening (S7)**: permission layer gates destructive/sensitive ops; prompt
  sanitization; per-tenant isolation verified (no shared fs/network/secrets).

### Theme B — Trust, safety & compliance
- **B1. RLS on every table**, audited (sandboxes, usage_ledger, build_jobs).
- **B2. Secrets**: move all to wrangler secrets / a vault; `.env.example` stays the
  only committed env doc; encrypt third-party tokens at rest.
- **B3. PDPA (Malaysia) baseline**; GDPR posture if going global. Data export/delete.
- **B4. Abuse limits**: rate limits, spend caps enforced pre-session, anomaly alerts.

### Theme C — Product & growth (awam-first)
- **C1. Guided onboarding**: from Landing prompt → first successful app in <5 min,
  zero jargon, BM/EN throughout.
- **C2. Templates that actually ship** (replace the `alert('coming soon')`): a small
  set of awam use-cases (kedai loyalty, tempahan, katalog, borang).
- **C3. Progressive disclosure**: advanced surfaces (code, logs, GitHub, metrics)
  exist but are opt-in, never default.
- **C4. Pricing & billing**: wire the Landing tiers (RM49/149/399) to real metering
  + quotas; Stripe/DuitNow. Build-credit model made truthful in-product.
- **C5. JARVIS memory & history** as a real retention feature (per the Builder tier).

### Theme D — Engineering health
- **D1. Re-enable TypeScript `strict` incrementally** (currently `strict:false`);
  burn down `any` in KEEP code.
- **D2. CI**: build image in CI (no local Docker dependency), run the gate on PRs,
  block secret commits at the gate.
- **D3. Test coverage** on the engine seams (SandboxDriver, AgentRunner, metering)
  and integration tests against a real test sandbox.
- **D4. Observability**: structured logs + cost dashboards per user/project.

### Sequencing (long term)
```
Month 1: A1 + A2 (real builds)  ──►  Month 2: A3 + A4 + B (econ + deploy + safety)
Month 3: C1–C3 (awam onboarding + templates)  ──►  Month 4: C4 + C5 (billing + retention)
D1–D4 run continuously across all months.
```

**North-star metrics**
- Time-to-first-working-app (target <5 min for awam).
- % signups reaching a live preview unaided (target >70%).
- Gross margin per build (metering must prove it before pricing).
- 7-day retention of users who shipped ≥1 app.

---

## Risk register (top 5)
1. **Sandbox compute cost** runs away without idle auto-suspend (A1) — highest $ risk.
2. **Un-metered model calls** → can't price or cap → losses. Metering (S3.4) is non-negotiable.
3. **Awam confusion** kills activation even if the engine is perfect — UX (Sprint 2) gates growth.
4. **Security/secrets** leak → trust + legal exposure. S1.5 / B2 close it.
5. **Engine still scaffold** — the product promise isn't fully real until A1–A2 land.

---

## Appendix: User-facing backend binding & domains

Three end-user (awam) capabilities, mapped to the Landing pricing tiers
("Subdomain hosting" Starter · "Custom domain included" Builder · "dedicated
database" Builder/Agency). **Current reality:** every built app shares the
*platform's* Supabase via the injected `lib/jarvis-backend.ts` shim
(`app_users`/`app_data` keyed by `app_id`, SHA-256 password hashing — weak). Apps
have no backend of their own, and domain fields (`apps.custom_domain`,
`custom_domain_status`, `cloudflare_url`, `domains` table) exist but are unwired.

### Feature 1 — User binds their own Supabase (BYO backend / "real ownership")

Two tiers, shipped in order:

- **Tier A — Shared (default, Starter): keep today's model but harden it.**
  Zero-config for awam: app uses platform Supabase, scoped by `app_id`. Fix the
  weak client-side SHA-256 auth → use the platform project's Supabase Auth (GoTrue)
  with proper RLS per `app_id`. Lowest friction, "it just works."

- **Tier B — Bring Your Own Supabase (Builder+, "dedicated database").**
  1. New table `app_backends { app_id, provider, supabase_url, anon_key(enc),
     service_role(enc), status }` — keys **encrypted at rest** (ties to B2).
  2. Dashboard/Builder flow "Connect your database / Sambung pangkalan data":
     user pastes Supabase URL + anon key (+ service-role for migrations only,
     never shipped to browser).
  3. Validate (`GET /rest/v1/`), then run a **schema bootstrap** (auth tables +
     RLS) into *their* project via service role / migration runner.
  4. Build injects **their** `__SUPABASE_URL__`/`__SUPABASE_ANON__` instead of the
     platform's. Only the anon key reaches the built app.
  5. Status surfaced as plain copy: "Connected ✓ / Not connected".

- **Tier C — One-click provision (long term, A-theme).** Supabase Management API
  OAuth: user authorizes ezclaude → we auto-create a Supabase project for them.
  Highest-effort, best awam UX; after A1–A2.

  *Security gate:* never expose service-role keys to the browser or to other
  tenants; encrypt all stored keys; RLS verified per app (Theme B).

### Feature 2 — Custom domain (user brings their own)

Use **Cloudflare for SaaS / Custom Hostnames** (the correct multi-tenant
primitive) — not per-domain manual DNS.
1. Enable SSL-for-SaaS on our Cloudflare zone; store a scoped API token as a
   wrangler secret.
2. User enters `app.kedaisaya.com` in Dashboard → we call the Custom Hostnames API
   → return the CNAME (+ TXT) they must add at their registrar.
3. Poll validation; Cloudflare auto-issues the cert; flip
   `apps.custom_domain_status` → `active`. Route the custom hostname → the app's
   deployed origin by `app_id`.
4. Plain-language UI with copy-paste DNS records + a "Checking… / Live ✓" state.
   Tier: **Builder+** (Landing says "Custom domain included").

### Feature 3 — Free domain (subdomain, the DEFAULT for every app)

Every deployed app gets a free subdomain instantly — this is the Starter promise
and the simplest of the three, so **ship it first**.
1. Acquire one apex (e.g. `ezclaude.app`); wildcard DNS `*.ezclaude.app` → our
   Worker/Container.
2. On deploy, assign `app-slug-xxxx.ezclaude.app`; the preview/deploy proxy routes
   by subdomain → `app_id` (reuses the CLAUDE.md "per-project subdomain" proxy).
3. Store on `apps.cloudflare_url`; show as the app's live link.
   Custom domain (Feature 2) becomes the natural upsell from the free subdomain.

### Delivery order (lowest effort / highest value first)
```
1. Free subdomain (F3)  — default for all apps, unlocks "it's live" moment
2. Harden shared Supabase auth (F1 Tier A) — real auth/RLS, kills SHA-256 hack
3. Custom domain via Cloudflare for SaaS (F2) — Builder-tier upsell
4. BYO Supabase (F1 Tier B) — "dedicated database" tier
5. One-click Supabase provision (F1 Tier C) — long-term, post A1–A2
```
Dependencies: F2/F3 need the real deploy + proxy layer (Theme A4 / Stage 4 S4–S5);
F1 Tier B/C need the secrets/encryption work (Theme B2). F3 + F1 Tier A can start
now against the current shared model.
```
```
