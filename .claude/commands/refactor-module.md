---
description: Migrate a module/component from one implementation or dependency to another, test-first, one unit per PR
argument-hint: <file or module to migrate>
---

Migrate the module/component in `$ARGUMENTS` from its current implementation (old dependency, API, or pattern) to the target one — behavior-preserving, test-first, one unit at a time.

## Pre-condition Check
Before starting, confirm the **target** that this code will depend on already exists and is ready:
```bash
grep -rn "<target-symbol-or-endpoint>" .
```
If the target isn't built yet → stop and build it first (e.g. via `/develop`).

## Pipeline

**Stage 1 — Audit.** List every usage of the old implementation in the target file and map each to its replacement:
```bash
grep -n "<old-symbol>" <file>
```

**Stage 2 — Implement (test-first).** Spawn the **implementer** agent:
- Keep the public behavior identical — this is a swap, not a redesign.
- Replace old calls with the new ones, one at a time.
- Preserve surrounding structure (caching, error handling, state) — only swap the layer being migrated.
- Remove the old import once no usages remain.

**Stage 3 — Tests.** Update the unit tests to exercise the new path (mock the new boundary, not the old one). Run the project's test command for the affected area.

**Stage 4 — Verify zero old references.**
```bash
grep -n "<old-symbol>" <file>   # expect zero matches
```
If any remain, continue the migration.

**Stage 5 — Quality Gate.** Spawn the **local-tester** (lint + typecheck + test, scoped to what changed). Fix until READY.

**Stage 6 — Report.**
```
# Module Migration Report
## Migrated: <module/component>
## Old references removed: N (now 0)
## New target used: <symbol/endpoint>
## Files changed: <source + test>
## Tests: PASS  ## Status: READY
```

## Rules
- Never migrate a unit before its target dependency exists.
- Preserve behavior — keep the caching/error/state layers, swap only the migrated layer.
- One module/component per PR — don't bundle migrations.
- After migrating, smoke-test the affected flow.

## Tracking Progress (whole-codebase migration)
```bash
grep -rln "<old-symbol>" . | wc -l    # remaining files to migrate; target: 0
```

## Input
File or module to migrate:
$ARGUMENTS
