---
name: "test-local"
description: "Run the full local quality gate (lint, typecheck, test, build) using the local-tester agent"
---

Run the full local quality gate on the current branch.

Use the **local-tester** agent.

Steps:
1. Spawn the local-tester agent.
2. It detects the project's real commands (from `CLAUDE.md` → `package.json` scripts → `Makefile`/`justfile` → language defaults) and runs, in sequence:
   - lint + typecheck
   - unit tests
   - integration tests (if present and their prerequisites are available; else SKIPPED)
   - build (each target)
   - any documented post-build sync/codegen step
3. It fixes failures where appropriate or reports them as blockers.
4. Report final status: READY or BLOCKED.

(the user's input / arguments for this command)
