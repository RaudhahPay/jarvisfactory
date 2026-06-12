---
name: "hotfix"
description: "Emergency production fix — skip design, fast path to fix + test + review on a hotfix/ branch"
---

Emergency fix for production issues. Skips the full design/spec phase — goes straight to reproduce → fix → test → review → finish.

## When to Use
- Production is broken (payments failing, auth bypass, data corruption, app crash).
- The fix is scoped — you know roughly where the bug is.
- You need to ship within the hour, not the day.

## When NOT to Use
- The "fix" requires new features or architecture changes → use `/ship` or `/design` + `/develop`.
- You're not sure what's broken → use `/triage` first to diagnose, then come back.
- It's not urgent → use the normal `/develop` pipeline with a proper plan.

## Stage 0 — Hotfix Branch
```bash
GIT_DIR=$(git rev-parse --git-dir) && GIT_COMMON=$(git rev-parse --git-common-dir)
```
- Already isolated → proceed (rename branch to `hotfix/<slug>` if needed).
- Not isolated → `git worktree add .worktrees/<slug> -b hotfix/<slug>` from `main` HEAD (verify `.worktrees/` is git-ignored).
- Install deps + run tests to confirm a clean baseline. If baseline already fails, note which tests — those are pre-existing, not your problem.

## Stage 1 — Reproduce
Before touching code, prove the bug exists:
1. Read the bug description / error / logs from `(the user's input / arguments for this command)`.
2. Locate the probable area: `grep -rn` for error messages, keywords, affected endpoints/components.
3. Write a **failing test** that reproduces the exact bug. Run it — must FAIL with the reported symptom.
   - If you can't reproduce → STOP. Report what you tried. Suggest `/triage` for deeper investigation.

## Stage 2 — Fix (minimal, scoped)
Spawn the **implementer** agent with strict constraints:
- **Minimal diff** — fix only the bug. No refactors, no cleanups, no "while I'm here" changes.
- **TDD** — the failing test from Stage 1 must go GREEN. No other tests may break.
- **Run the full test suite** after the fix — all green before claiming done.
- Commit: `fix(<area>): <what was broken>` referencing the issue if available.

**Scope guard:** If the implementer touches more than 3 files (excluding test files), pause and ask: "This fix is growing beyond a hotfix. Switch to `/develop`?"

## Stage 3 — Expedited Review
Spawn the **code-reviewer** on the hotfix diff only (`git diff main...HEAD`):
- Focus areas: does the fix introduce regressions? Does it handle edge cases? Is the fix correct for the root cause (not just the symptom)?
- **Expedited severity:** only 🔴 CRITICAL blocks. 🟡 WARNINGs are logged for follow-up but don't block the hotfix.
- If CRITICAL found → fix → re-review (max 2 rounds, then escalate to human).

## Stage 4 — Quality Gate
Spawn the **local-tester**: lint + test + build. All must pass.
- If FAIL → spawn **self-healer** (max 2 retries — tighter than normal since this is urgent).
- If still BLOCKED → report the failure clearly. The human decides whether to force-ship or not.

## Stage 5 — Finish the Hotfix
1. Present exactly 4 options:
   1. Merge locally to main
   2. Push and open a Pull Request (mark as urgent/hotfix)
   3. Keep the branch as-is
   4. Discard this work
2. Execute the choice. For options 1 or 4, clean up the worktree.
3. **Follow-up reminder:** After the hotfix ships, remind:
   - "Create a proper issue for root-cause investigation if this was a symptom fix."
   - "Consider adding an integration test if the bug crossed module boundaries."
   - "Update `CLAUDE.md` Known Issues if this revealed an architectural gap."

## Hotfix Report
```
# Hotfix Report — <branch> — <date>

## Bug: <one-line description>
## Root Cause: <file:line — what was wrong>
## Fix: <what changed and why>
## Test: <test file — what the regression test verifies>
## Files Changed: <count> (should be ≤3 + tests)
## Quality Gate: PASS
## Review: APPROVED | BLOCKED
## Follow-up Needed: yes/no — <what>
```

## Rules
- Never skip the reproduction test — a fix without a failing test is a guess.
- Never expand scope beyond the bug — no refactors, no feature work.
- Never auto-push or auto-merge — the human decides, especially for production hotfixes.
- 3-file limit (excluding tests) — if exceeded, this isn't a hotfix anymore.
- Always suggest follow-up actions — hotfixes are patches, not permanent solutions.

## Input
Bug description, issue reference, or error message:
(the user's input / arguments for this command)
