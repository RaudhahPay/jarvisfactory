---
name: "develop"
description: "Implement a plan, issue, or feature on an isolated branch using subagent-driven development"
---

Implement the plan/issue on an isolated branch, task-by-task, with reviews between tasks.

## Stage 0 — Workspace Isolation
Check whether you're already in a linked worktree:
```bash
GIT_DIR=$(git rev-parse --git-dir) && GIT_COMMON=$(git rev-parse --git-common-dir)
```
- Already isolated → proceed.
- Not isolated → create a worktree: `git worktree add .worktrees/<slug> -b feat/<slug>` (verify `.worktrees/` is git-ignored first).
- Install deps + run the test command in the worktree to confirm a clean baseline (use the project's real commands).

## Stage 1 — Read the Plan
- If the input is a plan file (`docs/plans/*.md`): read it fully, extract every task, and create a task list.
- If it's a raw issue/PRD with no plan: run `/design <ref>` first, then return here with the plan path.

## Stage 1.5 — Validate & Resume

**Plan validation (fail fast).** Before executing anything, scan the plan for problems:
```bash
grep -nE '(TBD|TODO|fill in later|similar to Task|PLACEHOLDER)' <plan-file>
```
- Any TBD/TODO/placeholder → STOP. Report all bad sections at once. Ask the user to fix the plan or re-run `/design`.
- For every file path in the plan (`Create:` / `Modify:` lines), verify it exists (for `Modify`) or that the parent directory exists (for `Create`):
```bash
# For Modify paths — must exist
test -f <path> && echo "OK" || echo "MISSING: <path>"
# For Create paths — parent dir must exist
test -d $(dirname <path>) && echo "OK" || echo "MISSING DIR: $(dirname <path>)"
```
- Every task must have at least one TDD step (look for `Step` / `RED` / `GREEN` / `test` keywords). Tasks without test steps → WARN and ask user to confirm.
- If validation fails → report all issues at once (not one-by-one) and STOP.

**Resume detection.** Check for previously completed tasks:
```bash
grep -cP '^\- \[x\]' <plan-file>   # completed checkboxes
grep -cP '^\- \[ \]' <plan-file>   # remaining checkboxes
```
- If completed tasks exist → report: "Resuming from Task N (Tasks 1–M already complete)."
- Skip all tasks whose checkboxes are `[x]`. Start from the first `[ ]` task.
- Verify the branch and worktree from the previous run still exist. If not, recreate from the last committed state.
- If no completed tasks → start from Task 1 as normal.

**Checkpoint writes.** After each task completes (Stage 2d), update the plan file: flip that task's checkboxes from `- [ ]` to `- [x]` and commit the plan file:
```bash
git add <plan-file> && git commit -m "chore: mark task N complete in plan"
```
This ensures resume works even if the session dies mid-build.

## Stage 2 — Execute task-by-task (subagent-driven)
For each task (starting from the resume point, if any), in order:

**2a. Implement** — spawn the **implementer** agent (fresh, isolated context): full task text + relevant paths + project context. It follows TDD (RED → verify → GREEN → verify → REFACTOR → commit) and runs the real test command before claiming done.
- `NEEDS_CONTEXT` → provide it, re-dispatch.
- `BLOCKED` → assess, break the task down, or escalate.

**2b. Spec-compliance review** (second subagent): did the implementation match the task spec — nothing missing, nothing extra? Issues → fix → re-review until ✅.

**2c. Code-quality review** (the **code-reviewer** agent): architecture, security, project rules. 🔴 CRITICAL (fix now) / 🟡 IMPORTANT (fix before next task) / 🟢 MINOR (note). Issues → fix → re-review until clean.

**2d. Mark the task complete** — update the plan file checkboxes to `[x]` and commit the plan. Proceed to the next task.

**Continuous execution:** don't pause between tasks. Stop only if BLOCKED after retries, blocking ambiguity, or all tasks done.

## Stage 3 — Final Review
Spawn the **code-reviewer** on the full diff (`git diff <base>...HEAD`): project rules, auth, data-safety, payment/irreversible paths, N+1. CRITICAL blocks; WARNING is informational.

## Stage 4 — Finish the Branch
1. Run the full gate (lint + test + build, project's commands). If it fails → spawn the **self-healer** (max 3 retries).
2. Present exactly 4 options:
   1. Merge locally to the main branch
   2. Push and open a Pull Request
   3. Keep the branch as-is
   4. Discard this work
3. Execute the choice. For options 1 or 4, clean up the worktree (`git worktree remove .worktrees/<slug>`).

## Rules
- Never start on `main`/`master` without explicit consent.
- Never claim "done" without running the real test command and reading the output.
- Never skip spec-compliance review before code-quality review.
- Never proceed to the next task with open CRITICAL/IMPORTANT issues.
- Never auto-push or auto-merge — present options, the human decides.
- Never skip plan validation — a bad plan wastes more time than re-running `/design`.

## Input
Plan path, issue reference, or feature description:
(the user's input / arguments for this command)
