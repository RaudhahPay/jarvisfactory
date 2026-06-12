---
description: Generate changelog + release notes from git history using the changelog-writer agent
argument-hint: <version> [package, if multi-package]
---

Generate or update `CHANGELOG.md` plus user-facing release notes.

Use the **changelog-writer** agent.

Steps:
1. Detect the tag scheme and find the last relevant tag: `git tag --sort=-version:refname | head -5` (multi-package repos may prefix tags, e.g. `<package>-vX.Y.Z`).
2. Spawn the changelog-writer agent.
3. It reads commits between the last tag and HEAD and writes:
   - The master `CHANGELOG.md` entry (technical).
   - User-facing release notes (plain language) in the project's release-notes location.
4. Report every file written.

## Input
Version (and package, if multi-package). Examples: `1.4.0`, `web 1.4.0`.
$ARGUMENTS
