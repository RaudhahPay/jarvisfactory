---
description: "DEPRECATED — use /release-flow instead (add --skip-gate to skip quality gate + review)"
argument-hint: <patch|minor|major|version> [package]
---

> **This command has been merged into `/release-flow`.**
>
> - Full pipeline: `/release-flow minor`
> - Skip quality gate (already tested): `/release-flow minor --skip-gate`
>
> Running `/release-flow $ARGUMENTS --skip-gate` for you now.

Run `/release-flow $ARGUMENTS --skip-gate` — this is the equivalent of the old `/release` (bump + tag + changelog, no quality gate or review).

$ARGUMENTS
