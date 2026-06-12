---
name: "find-dead-code"
description: "Scan for unused / dead / obsolete code and report it for safe removal using the dead-code-finder agent"
---

Scan the codebase for unused, dead, or obsolete code that can be safely removed.

Use the **dead-code-finder** agent.

Steps:
1. Spawn the dead-code-finder agent (scoped to `(the user's input / arguments for this command)` if provided, else the whole repo).
2. It reads `CLAUDE.md` for entry points and intentionally-retained code, detects the language(s), and uses appropriate tools plus cross-reference search.
3. It produces a report categorizing findings:
   - **Safe to remove** — no references anywhere, not an entry point.
   - **Refactor candidates** — branches/conditions that can be simplified now.
   - **Keep** — still referenced or intentionally retained.
4. Report only — no edits until you confirm.

## Rules
- Report first; remove only after explicit confirmation.
- Don't remove anything reachable from an entry point without tracing it.
- Watch for dynamic references (reflection, string-keyed lookups, DI, config-driven imports).
- For each proposed removal, name the test that verifies nothing broke.

## Input
Optional scope (default: full repo):
(the user's input / arguments for this command)
