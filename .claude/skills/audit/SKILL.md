---
name: "audit"
description: "Parallel codebase audit — dead code + test-coverage gaps + code review + security"
---

Run a comprehensive parallel audit. All four agents run concurrently — do not wait for one before starting the others. Report only, no edits.

## Parallel Agents

**Agent 1 — Dead Code.** Spawn the **dead-code-finder**: scan for unused exports, unreachable branches, abandoned flags, orphaned files. Report only. Output: Safe-to-remove / Refactor / Keep.

**Agent 2 — QA / Coverage.** Spawn the **qa-engineer** (coverage mode): audit automated coverage across the critical flows named in `CLAUDE.md`. Output: prioritized coverage-gap report.

**Agent 3 — Code Review.** Spawn the **code-reviewer** on recent history (`git log --oneline -30` and/or the working diff): security, auth/authorization, data-safety, and violations of the project's documented rules/ADRs. Output: findings by severity.

**Agent 4 — Security.** Spawn a general-purpose agent as a security reviewer: scan for committed secrets, missing access controls on protected data, injection vectors, and tampering risks on money/irreversible flows. Output: findings by severity.

## Consolidation
After all four finish, compile one master report:
```
# Audit Report — YYYY-MM-DD
## Critical Findings (act before next release)
## Dead Code to Remove (prioritized)
## Test Coverage Gaps (prioritized)
## Code Quality Findings
## Security Findings
## Recommended Next Steps
```

## Rules
- All four run in parallel.
- Report only — no edits.
- After the report, recommend what to tackle first.

## Input
Optional scope (default: full audit):
(the user's input / arguments for this command)
