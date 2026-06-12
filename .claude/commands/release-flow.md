---
description: Release pipeline — quality gate, review, version bump + tag, changelog (skip-gate for pre-verified releases)
argument-hint: <patch|minor|major|version> [package] [--skip-gate]
---

Run the release pipeline. Assumes code is merged and the working tree is clean.

## Flag: `--skip-gate`
If the input contains `--skip-gate` (or `skip-gate`, `quick`), skip Stages 1–2 (quality gate + review) and go straight to Stage 3 (version bump). Use this only when you've **already** run `/test-local` and `/review` separately and both passed in this session.

Without the flag, the full pipeline runs.

## Pipeline (sequential)

**Stage 1 — Pre-Release Quality Gate** *(skipped with --skip-gate)*
Spawn the **local-tester**: lint + test + build (project's commands). Output: PASS or BLOCKED.

**Stage 2 — Final Code Review** *(skipped with --skip-gate)*
Spawn the **code-reviewer** on `git log <last-tag>..HEAD`: any last-minute risks or security flags. Output: PASS or BLOCKED.

**Stage 3 — Release Preparation.**
Spawn the **release-manager**:
1. Pre-release checklist (clean tree, right branch, quality gate passed or skipped).
2. Determine the new version from bump type (`patch` | `minor` | `major`) or explicit version, per semver.
3. Bump version (and build numbers) in **every** file that carries one — `package.json`, native manifests (`build.gradle`, `Info.plist`), language manifests, `version.txt`, etc.
4. Commit: `chore(release): v<version>`.
5. Create the tag using the project's scheme (e.g. `v<version>` or `<package>-v<version>`).

**Stage 4 — Changelog + Release Notes.**
Spawn the **changelog-writer** on `git log <previous-tag>..<new-tag>`:
- Master `CHANGELOG.md` entry (technical, audit-ready).
- User-facing release notes (plain language).

**Stage 5 — Summary Report.**
```
# Release Report — v<version> — <date>

## Quality Gate: PASS | SKIPPED (--skip-gate)
## Code Review: PASS | SKIPPED (--skip-gate)
## Version Bumped In:
- <file> → <old> → <new>
## Commit: <hash> "chore(release): v<version>"
## Tag: <tag> (created locally, not pushed)
## Changelog: updated CHANGELOG.md + release notes
## Next Manual Steps:
- git push && git push --tags
- <publish/store/registry steps from the project's runbook>
```

## Rules
- Stage 1 FAILS → stop; fix tests/build first.
- Stage 2 finds BLOCKING issues → stop; fix, then re-run.
- `--skip-gate` only skips Stages 1–2. It never skips the version bump, tag, or changelog.
- Do NOT push to remote automatically — report the exact command.
- Do NOT publish to a store/registry — that's a manual step.
- If pre-release checks fail (even in Stage 3's checklist), STOP and report blockers.

## Examples
```
/release-flow minor                    # full pipeline, bump minor
/release-flow 1.5.0                    # full pipeline, explicit version
/release-flow patch --skip-gate        # already tested, just bump + tag
/release-flow web minor                # multi-package, bump web minor
```

## Input
Bump type or explicit version (and package), optionally `--skip-gate`:
$ARGUMENTS
