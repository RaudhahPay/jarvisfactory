---
description: Full dev pipeline — from issue/PRD to merge-ready on one command
argument-hint: <issue ref | PRD path | feature description>
---

Full pipeline from idea to merge-ready, in the correct order.

## Stage 0 — Workspace
- Check whether you're in a linked worktree (`GIT_DIR` vs `GIT_COMMON`).
- If not: `git worktree add .worktrees/<slug> -b feat/<slug>` (verify `.worktrees/` is git-ignored).
- Install deps + run the test command to confirm a clean baseline (project's real commands). If the baseline fails, report and ask whether to proceed.

## Stage 1 — Design
Spawn the **architect** agent:
- **Brainstorm:** explore context, ask clarifying questions one at a time, propose 2-3 approaches.
- **Spec:** write to `docs/specs/YYYY-MM-DD-<slug>.md`; self-review; user approves.
- **ADR** (if a significant decision): `docs/decisions/NNNN-<slug>.md`.
- **Plan:** `docs/plans/YYYY-MM-DD-<slug>.md` with TDD steps per task.

**GATE:** do not proceed until the user approves the spec and a plan exists.

## Stage 2 — Develop (subagent-driven)
For each task: **implementer** (TDD: RED→GREEN→REFACTOR, verifies tests before committing) → spec-compliance review → code-quality review (🔴 CRITICAL / 🟡 IMPORTANT / 🟢 MINOR). Fix → re-review → mark complete → next. Continuous — no check-in pauses unless BLOCKED.

## Stage 3 — Quality Gate + Self-Healing
Spawn the **local-tester** (detects and runs lint + test + build). If FAIL → spawn the **self-healer**: diagnose root cause, fix, re-run; repeat up to 3 times; if still BLOCKED, escalate with a full diagnosis.

## Stage 4 — Architecture Review
Spawn the **code-reviewer** on the full diff: project rules, auth, data-safety, payment/irreversible paths, N+1. 🔴 CRITICAL blocks; 🟡 WARNING is informational.

## Stage 5 — Finish the Branch
1. Run the full verification (lint + test + build) — must pass before presenting options; never claim ready without evidence.
2. Present exactly 4 options:
   1. Merge locally to the main branch
   2. Push and open a Pull Request
   3. Keep the branch as-is
   4. Discard this work
3. Execute the choice. Options 1 or 4: clean up the worktree (`git worktree remove .worktrees/<slug> && git worktree prune`).

## Summary Report
```
# Ship Report — <branch>
## Spec / ADR / Plan paths
## Implementation: branch, files changed, tasks N/N, self-heal attempts
## Quality Gate: PASS
## Architecture Review: APPROVED | APPROVED WITH WARNINGS | BLOCKED
## Next Step: [option chosen] + any manual acceptance testing (/acceptance-test)
```

## Rules
- Never start on `main`/`master`.
- Never claim done without running verification commands and reading output.
- Never skip spec-compliance review before code-quality review.
- Never auto-push or auto-merge — the human decides.
- Stage 1 gate is hard: no code without an approved spec.

## Input
Issue reference, PRD path, or feature description:
$ARGUMENTS
