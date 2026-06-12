---
name: "review"
description: "Architecture-focused code review of the current branch — flags production issues, not style"
---

Review the changes on the current branch against the base branch.

Use the **code-reviewer** agent.

## Steps
1. Determine the base (`(the user's input / arguments for this command)` or default `main`/`master`).
2. `git diff <base>...HEAD` — full diff.
3. `git log <base>...HEAD --oneline` — scope.
4. Spawn the code-reviewer with the diff + branch context. It reads `CLAUDE.md` and `docs/decisions/` first to enforce the project's own rules.
5. Report findings by severity: 🔴 CRITICAL | 🟡 WARNING | 🟢 NOTE.

## Severity Gate
- **CRITICAL found** → BLOCKED. List all critical items.
- **WARNING only** → APPROVED WITH WARNINGS. Human decides.
- **No issues** → APPROVED.

## Not checked here
Style, formatting, import order — the linter owns those (run `/test-local`).

(the user's input / arguments for this command)
