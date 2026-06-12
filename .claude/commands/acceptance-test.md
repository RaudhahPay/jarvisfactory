---
description: Generate a manual / acceptance test checklist for a change or release using the qa-engineer agent
argument-hint: [change set | release | platform]
---

Produce a manual/acceptance test checklist a human can execute on the real product (web, mobile, desktop, CLI — whatever this project ships).

Use the **qa-engineer** agent (checklist mode).

Steps:
1. Determine scope from `$ARGUMENTS` (a change set, a release, and/or a target platform). Default: the changes on the current branch.
2. Spawn the qa-engineer agent. It reads `CLAUDE.md` for the product's critical flows and the platform(s) it ships on.
3. It produces a checklist with explicit expected results per step, plus a regression check on adjacent flows and relevant edge cases (offline, errors, permissions, empty states).
4. The human executes the checklist and records PASS/FAIL + any defects.

## Rules
- Every step has an explicit expected result.
- Always include a regression check on adjacent flows.
- This is a human-run checklist — don't claim a manual step passed yourself.

## Input
Change set, release, or platform:
$ARGUMENTS
