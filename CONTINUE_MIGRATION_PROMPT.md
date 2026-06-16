# Claude Code prompt — continue the Next.js → Vite SPA + Hono migration

Paste the block below into Claude Code (run it from the repo root). It uses the
`/develop` command in `.claude/commands/`, which orchestrates the
`implementer`, `code-reviewer`, and `self-healer` agents in `.claude/agents/`.
The plan already has Phase A marked `[x]`, so `/develop`'s resume detection skips
those and starts at the first unchecked task (B1).

---

## Recommended prompt (sequential — correct for this plan)

```
/develop docs/plans/2026-06-12-nextjs-to-vite-hono.md

Context:
- Branch: continue on feat/vite-hono-migration (do NOT start on main).
- Phase A is already complete and committed (last commit c659b40). Resume from
  the first unchecked task, which is Phase B, Task B1 (stand up the Hono server).
- Phases run in order because of dependencies: B (Hono + port API routes) →
  C (cookie/middleware auth → Bearer token + client guards, the riskiest phase) →
  D (re-point the Cloudflare Container to SPA+Hono, then delete Next.js).
- Follow the plan's TDD steps exactly: write the failing test, watch it fail,
  write minimal code, watch it pass, commit. Run the real test command
  (`npx vitest run server` / `npx vitest run web`) and read the output before
  claiming any task done.
- Honor CLAUDE.md rules: ANTHROPIC_API_KEY (prepaid API credits) only — never a
  subscription/OAuth; meter every model call; keep the SandboxDriver abstraction;
  sandbox-worker/ stays untouched.
- Before starting B1, run the plan-validation + resume checks from /develop
  Stage 1.5 and tell me the resume point.
- Stop and ask me only if BLOCKED after retries or a task is genuinely ambiguous.
  Otherwise run continuously. Do not auto-push or auto-merge — present the 4
  finish options at the end.
```

---

## Notes

- **There is uncommitted work** (`web/src/routes/Dashboard.tsx` modified + a new
  `Dashboard.test.tsx`). Decide first whether to commit or stash it, or tell
  Claude Code to handle it, so `/develop` starts from a clean tree.
- **Don't use `/parallel-ship` here.** Phases B/C/D depend on each other and touch
  shared files (`server/`, `lib/supabase/authed.ts`, `Dockerfile`), so the parallel
  pipeline's independence rule doesn't hold. Sequential `/develop` is correct.
- **GATE 0 still open** (per CLAUDE.md §9): rotate the GitHub PAT and Anthropic
  keys, encrypt `user_github_connections.access_token`. These don't block the
  migration build but must be closed before any deploy (Phase D cutover).

### Smaller-scope alternative (one phase at a time)

If you'd rather review between phases instead of running B→C→D continuously, run
`/develop` once per phase and stop after each, e.g.:

```
/develop docs/plans/2026-06-12-nextjs-to-vite-hono.md
Only execute Phase B (Tasks B1–B5), then stop and report before Phase C.
```
