---
description: Revert a bad deploy — identify the breaking change, create revert commits, verify build, push safely
argument-hint: <commit hash | tag | "last" | description of what broke>
---

Safely revert a bad production deploy. Since `main` auto-deploys to Cloudflare Pages, this creates revert commit(s) on `main` and — only after the quality gate passes — offers to push.

## When to Use
- A deploy just went out and something is broken in production.
- You need to restore the previous working state NOW while you investigate.

## When NOT to Use
- The issue is in a Supabase Edge Function (those deploy separately — redeploy the previous version via `supabase functions deploy`).
- The issue is in a database migration (migrations can't be reverted automatically — use `/data-import` or manual intervention).
- You want to fix forward instead of reverting → use `/hotfix`.

## Stage 0 — Identify What to Revert
Determine the bad commit(s) from `$ARGUMENTS`:

**If a commit hash or tag is given:**
```bash
git log --oneline <hash>..HEAD    # show what would be reverted
```

**If "last" or no specific ref:**
```bash
# Find the last deploy boundary
git log --oneline -10
# Check CI — what was the last successful deploy vs current?
```

**If a description of what broke:**
```bash
# Search recent commits for the likely culprit
git log --oneline -20 --all --grep="<keyword>"
git log --oneline -20 -- <suspected-path>
```

Present the commit(s) to revert and ask: **"Revert these N commit(s)? This will undo: [list changes]."**

**GATE: Do not revert without user confirmation.**

## Stage 1 — Create Revert Commit(s)
```bash
# For a single commit:
git revert <hash> --no-edit

# For multiple consecutive commits (newest first):
git revert <oldest-hash>^..<newest-hash> --no-edit

# For a merge commit:
git revert -m 1 <merge-hash> --no-edit
```

If revert has conflicts:
1. Show the conflicting files.
2. Attempt auto-resolution (accept the pre-change version for each conflict).
3. If auto-resolution fails → report conflicts and ask the human to resolve.

## Stage 2 — Quality Gate
Spawn the **local-tester**: lint + test + build on the reverted state.
- Must ALL pass — we're about to push to `main` which auto-deploys.
- If FAIL → spawn **self-healer** (max 2 retries).
- If still BLOCKED → STOP. Report: "Revert doesn't build clean. Manual intervention needed." Show the exact failures.

## Stage 3 — Verify the Revert
Quick sanity checks before pushing:
```bash
# Confirm the revert undid what we expected
git diff HEAD~<N>..HEAD --stat

# Confirm we're on main
git branch --show-current

# Confirm build artifact exists
ls dist/ build/ .next/ out/ 2>/dev/null | head -5
```

Report: "Revert ready. N file(s) restored to pre-deploy state. Build passes."

## Stage 4 — Push (human decides)
Present exactly 3 options:
1. **Push now** — `git push origin main` → triggers auto-deploy, production restored.
2. **Push to a branch for review** — `git push origin main:rollback/<slug>` → open PR for team review before merging.
3. **Keep locally, don't push** — revert stays local; the human pushes manually when ready.

Execute the choice. **Never auto-push without explicit confirmation.**

## Stage 5 — Post-Rollback
After the revert ships:
1. **Report the rollback:**
```
# Rollback Report — <date>

## What Broke: <description>
## Reverted Commits: <hash(es)> — <summary>
## Deploy Status: pushed / pending human push
## Production State: restored to <previous-good-commit>
## Quality Gate: PASS

## Follow-up Actions Required:
- [ ] Investigate root cause (run `/triage` on the reverted changes)
- [ ] Fix forward with `/hotfix` or `/develop` once root cause is understood
- [ ] Notify team about the rollback
- [ ] Check for data inconsistencies if the bad deploy ran mutations
```

2. **Suggest next steps:**
   - "Run `/triage <description>` to investigate what went wrong."
   - "Once you have a fix, run `/hotfix <issue>` to ship the corrected version."
   - If the bad deploy touched database/payment code: "⚠️ Check for data inconsistencies — the bad code may have processed transactions between deploy and rollback."

## Rules
- Never revert without showing the user what will be undone and getting confirmation.
- Never push to `main` automatically — the human decides, always.
- Never skip the quality gate — a broken revert is worse than the original problem.
- Always suggest follow-up investigation — a rollback is a temporary fix, not a resolution.
- Flag data/payment risk if the reverted code touched financial flows.

## Edge Cases
- **Revert of a revert:** If the original commit was itself a revert, warn: "This will re-apply the originally reverted changes. Are you sure?"
- **Merge commits:** Use `-m 1` (revert to first parent / main-line). Explain this to the user.
- **Multiple deploys since the break:** Identify the exact breaking commit, don't revert everything blindly. Use `git bisect` logic if needed.

## Input
Commit hash, tag, "last", or description of what broke:
$ARGUMENTS
