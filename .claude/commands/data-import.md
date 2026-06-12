---
description: Guided, gated migration of data (and files) from a source database/store to a target — schema from migrations, verified row counts, rollback plan
argument-hint: [environment, e.g. staging | production]
---

Migrate data from a source database/store to a target, safely. This is **guided** — each phase requires confirmation before continuing. Adapt every command to the project's actual database, storage, and hosting (read `CLAUDE.md`).

## Hard-Won Lessons (apply regardless of stack)
> **Never import the schema from a full dump.** Importing a full `pg_dump`/`mysqldump`/snapshot can create *ghost migration records* — migrations marked applied but never actually run — so tables, views, and functions go missing silently.
>
> **Schema ALWAYS comes from migration files. Only DATA comes from the export.**

## Prerequisite Check
Verify the tools you'll need exist before starting (DB client, migration CLI, any remote access). If something's missing, install it first — don't proceed.

## Phase 1 — Prepare the Target (schema only)
Build the target schema from migration files, not a dump.
1. Point your migration tool at the target.
2. If the target has ghost migration records, clear the migration-tracking table.
3. Apply **all** migrations to the target.
4. Deploy any server-side functions/procedures the app needs.
5. Set required secrets/config on the target.

**GATE:** Verify the schema matches (a schema diff should show no differences) and a smoke endpoint/query works. Ask the user: *"Phase 1 done — proceed to export data?"*

## Phase 2 — Export Data from the Source
Export **data only** — no schema, no ownership/privileges.
- Full export of the relevant tables/collections (exclude the migration-tracking table).
- Optionally export critical tables separately for easier recovery.
- Record source row counts per table — you'll verify against these later.

**GATE:** *"Export complete and backed up — proceed to import?"*

## Phase 3 — Import Data into the Target
1. Temporarily disable triggers/constraints if needed to avoid ordering/foreign-key violations.
2. Import the data in a single transaction where possible; capture a log.
3. Re-enable triggers/constraints.
4. Scan the log for errors before continuing.

## Phase 4 — Verify
Compare target row counts against the Phase 2 numbers, table by table. If anything mismatches, **do not switch traffic** — debug first.

**GATE:** *"Row counts match — ready to migrate files / switch traffic?"*

## Phase 4b — Migrate Files / Object Storage (if applicable)
Run after data is verified and before switching traffic.
1. Export objects from the source store (record the per-bucket/container counts).
2. Configure target credentials.
3. **Dry-run** the upload first (list files, no writes).
4. Upload; expect result codes like `ok` / `skip` (already exists) / `fail`.
5. Verify object counts match the source.

**GATE:** *"Storage verified — proceed to switch traffic?"*

## Phase 5 — Switch Traffic (carefully)
Point the app at the target (update env/config and redeploy, or flip a remote-config override). Verify health and a key endpoint/flow against the new target.

## Rollback Plan
Know the rollback before you start: revert the env/config (or override) to the source and redeploy. Estimate and write down the rollback time. **Test the rollback path before the maintenance window.**

## Rules
- Schema from migrations, never from a dump.
- Never switch traffic before row counts are verified.
- Always export/back up before importing.
- Always run production migrations in a maintenance window.

## Input
Optional environment context (`staging` | `production`):
$ARGUMENTS
