# STAGE 4 COMPLETE — JarvisFactory v2 engine

**Date:** 2026-06-11 · **Branch:** `main` (pushed to `RaudhahPay/jarvisfactory`)
**Status:** v2 engine is **code-complete and pushed**. Going live needs 2 human/infra steps (below).

---

## What shipped (S1–S7 + Layer 7), behind clean swappable seams

```
builder UI (flag-gated, live-preview pane)
  → POST /api/build      auth · quota check · prompt validation · build_jobs row
  → ClaudeAgentRunner    real @anthropic-ai/claude-agent-sdk, policy-gated tools
  → SandboxDriver        [ stub | CloudflareSandboxDriver → sandbox-worker bridge → Container ]
  → usage_events ledger · build_jobs run-log · CI green
```

| Step | What | Where |
|---|---|---|
| S1 | Extract builder orchestration from the 2,834-line component | `lib/build-pipeline.ts`, `app/builder/useBuildPipeline.ts` |
| S2 | Provider-agnostic abstractions | `lib/sandbox/types.ts`, `lib/agent/types.ts` |
| S3 | Server orchestrator + durable jobs + real Agent SDK runner + UI wiring | `app/api/build/route.ts`, `lib/agent/claude-runner.ts`, `lib/build-client.ts`, `app/builder/useV2Build.ts`, schema `v12` |
| S4 | Cloudflare sandbox driver + bridge Worker + live-preview pane | `lib/sandbox/cloudflare-driver.ts`, `sandbox-worker/`, preview iframe in `app/builder/page.tsx` |
| L7 | Agent permission policy (deny destructive/exfil/deploy; path/prompt guards) | `lib/agent/policy.ts` |
| S6 | Per-call usage ledger + monthly spend quota | `lib/metering.ts`, schema `v14` |
| S7 | CI (typecheck + smoke), tsc target fix | `.github/workflows/ci.yml` |
| Sec | RLS exposure on `apps`/`profiles`/`jarvis_profiles` found + fixed | schema `v13` (applied to prod) |

**Tests:** policy 33/33 · metering 6/6 · build-client 6/6 · orchestrator 12/12 · agent SDK wiring live-verified (auth+stream). `tsc` clean (app + worker).

**v1 is untouched and remains the default** (`NEXT_PUBLIC_V2_ENGINE=0`). v2 turns on with one env flag.

---

## GO-LIVE — the only things left (require your accounts; I can't do them)

1. **Anthropic credits** — console.anthropic.com → Billing → add credits. (The live agent currently returns "Credit balance is too low".)

2. **Deploy the sandbox bridge** — needs a Cloudflare **Workers Paid** plan with Containers:
   ```bash
   cd sandbox-worker
   npm install
   npx wrangler login            # your Cloudflare account
   wrangler secret put BRIDGE_TOKEN   # pick a strong shared secret
   npm run deploy                # note the printed https URL
   ```

3. **Point the app at it** — in the Next app's `.env.local`:
   ```
   NEXT_PUBLIC_V2_ENGINE=1
   SANDBOX_PROVIDER=cloudflare
   SANDBOX_BRIDGE_URL=https://jarvisfactory-sandbox.<acct>.workers.dev
   SANDBOX_BRIDGE_TOKEN=<same value as the worker secret>
   ANTHROPIC_API_KEY=sk-ant-...        # already set locally
   ```
   (Want to *see it work first without Cloudflare?* Set `NEXT_PUBLIC_V2_ENGINE=1` + `AGENT_RUNNER=stub` and build — the stub agent streams real events into the UI.)

4. **Smoke test** — log in, build something, confirm the live preview iframe loads.

5. **Then tell me to do the cutover cleanup** (deferred on purpose — destructive):
   - delete the v1 `runBuildPipeline` scaffold (only safe once v2 is the default)
   - drop the shim tables `app_users`/`app_data`/`app_sessions` (only after v1-generated apps are migrated — they hold live data)

---

## Still-open security (your call)
- The old GitHub PAT embedded in `.git/config` is **revoked** and has been **removed** (the remote now uses `gh` OAuth). No rotation needed for git ops.
- `user_github_connections.access_token` is still **plaintext** — encrypt at rest (Supabase Vault) before relying on the GitHub-deploy feature in production. This is a v1 feature path.
- Confirm the v13 RLS change didn't break anything: log in → dashboard shows your apps → onboarding shows your JARVIS. (Revert SQL is in the v13 commit message if needed.)

## Rollback
`v1-archive` branch (pushed) is the pre-v2 snapshot. `main` before this work is `f915e70`.
