---
description: Triage a bug report — reproduce, classify severity, write a triaged issue using the bug-triager agent
argument-hint: <bug report>
---

Take the bug report below, reproduce it, classify severity, and produce a triaged issue file.

Use the **bug-triager** agent.

Steps:
1. Check the issues folder (e.g. `docs/issues/`) for duplicates.
2. Spawn the bug-triager agent.
3. The agent attempts reproduction and identifies the probable root-cause area (with file:line).
4. It writes the triaged issue to `docs/issues/YYYY-MM-DD-<slug>.md`.
5. Suggest creating a tracker issue with a severity label (show the exact command).

Bug report:
$ARGUMENTS
