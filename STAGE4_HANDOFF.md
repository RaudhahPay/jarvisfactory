# STAGE 4 HANDOFF NOTE — JarvisFactory v2

Date: 2026-06-11
Prepared by: Claude Cowork (Phase 0 Step 3 — Framework Onboarding)
Handed to: Claude Code (Stage 4 — Active Build)
Framework: Raudhah Tech 10-Layer Build Framework

---

## WHERE TO BEGIN (first task, immediately)

Start with the **Layer 3 extraction of `app/builder/page.tsx`** at the
**`approveBuild()` seam**.

- File: `app/builder/page.tsx` — currently **2,834 lines**, a single client
  component holding the entire builder UI *and* the multi-agent build pipeline.
- Seam: `async function approveBuild()` at **line 1540**. This function is the
  entry point for the whole build pipeline: it sets `phase='building'`, loads
  JARVIS memory lessons, assembles the shared `AgentContext`, and orchestrates
  the Architect + Designer (parallel) → Builder → QA agents via `callClaude(...)`.
- Goal of the extraction: lift the orchestration out of the React component into
  a dedicated module (e.g. `lib/build-pipeline.ts` + a thin `useBuildPipeline`
  hook), leaving `page.tsx` responsible only for rendering and user input.

### Recommended extraction sequence (dependency order)
1. **Freeze the contract first.** Define explicit types for `AgentContext`,
   the agent result shape returned by `parseAgentOutput`, and the `phase` state
   machine (`idle → planning → questioning → approving → building → iterating →
   done`). Nothing else moves until these types are pinned.
2. **Extract the agent-call layer.** Move `callClaude`, `loadJarvisLessons`,
   `formatLessonsForPrompt`, and `parseAgentOutput` into `lib/` (some already
   live in `lib/agents.ts` / `lib/jarvis-memory.ts` — consolidate, don't fork).
3. **Extract the orchestrator.** Move the body of `approveBuild()` (the
   Architect+Designer `Promise.allSettled`, Builder, QA stages) into
   `lib/build-pipeline.ts` as a pure async function that takes `AgentContext`
   and emits progress events (callbacks) instead of calling `setState` directly.
4. **Re-wire the component.** Replace the inlined logic in `page.tsx` with a
   `useBuildPipeline` hook that subscribes to those progress events and maps
   them onto `setPhase` / `setAgentStatus` / `addLog` / `addChat`.
5. **Lock it with a smoke test.** A single build run (idle → done) must produce
   identical agent logs before/after the extraction. Commit only when green.

> NOTE: The canonical first-sprint task IDs must be reconciled against
> `GAP_CHECKLIST.md` once that file is placed at the repo root (see "Open items"
> below). The sequence above is the architectural ordering observed directly in
> the code; merge it with the GAP checklist's Layer-3 items before sprinting.

---

## STATE OF THE REPO AT HANDOFF

Verified stack facts (confirmed against disk):
- **Frontend:** Next.js **^14.2.35**, React 18 (App Router).
- **Database/Auth:** Supabase (`@supabase/supabase-js ^2.45.0`, `@supabase/ssr ^0.5.0`).
- **Styling:** **Inline styles only — no Tailwind** (no tailwind config, not in
  `package.json`; 367 inline `style=` usages in `app/builder/page.tsx`).
- **AI provider:** Anthropic Claude (via `ANTHROPIC_API_KEY`, server routes under `app/api/`).

Gate-0 cleanup completed in this session (see commit when finalized):
- `v1-archive` branch created locally capturing the previously-untracked
  v8–v11 engine (168 files: `lib/builder-agent-v2.ts`, `lib/builder-tools-v2.ts`,
  `lib/jarvis-memory.ts`, `lib/jarvis-patterns-v2.ts`, `lib/agents.ts`,
  `app/api/**`, schema-v9, etc.). **NOT yet pushed** — see blockers.
- `.env.local` untracked (`git rm --cached`), confirmed in `.gitignore`,
  still present on disk.
- `.env.example` created at repo root (placeholder keys only).
- Deleted the `{app` brace-expansion junk directory (contained 0 files).
- Deleted the orphaned root `index.html`.

---

## OPEN ITEMS / BLOCKERS (must resolve before/within first sprint)

HUMAN-ONLY (do NOT let Claude Code attempt these):
1. **Rotate the GitHub PAT** exposed in `.git/config` — it is also currently
   **invalid/revoked** (GitHub rejected it on push). Generate a fresh token in
   GitHub → Settings → Developer settings → Personal access tokens, then update
   the `origin` remote. Until this is done, `git push` cannot run.
2. **Encrypt `user_github_connections.access_token`** at rest in Supabase.

PENDING INPUTS (block the final framework commit):
3. **`CLAUDE.md`, `GAP_CHECKLIST.md`, `PHASE0_LAYER_AUDIT.md`** were not received
   in this session. Place them at the repo root (audit may live in `/docs`),
   then run the single combined commit. Full CLAUDE.md ↔ repo drift-check is
   pending the file (the three stack claims above are already verified true).

CARRYOVER:
4. `.env.local` was historically tracked, so its values may exist in earlier
   commits on `origin/main`. Treat all current secret values as compromised and
   rotate them alongside the PAT.

---

## NEXT STAGE INSTRUCTIONS (for Claude Code)

1. Read `CLAUDE.md` and `GAP_CHECKLIST.md` (once placed) for full context.
2. Confirm `v1-archive` is pushed to origin (needs the rotated PAT) before
   relying on it as the rollback point.
3. Begin the Layer-3 extraction at the `approveBuild()` seam per the sequence above.
4. Commit at the end of every layer; tick items in `GAP_CHECKLIST.md` as you go.
