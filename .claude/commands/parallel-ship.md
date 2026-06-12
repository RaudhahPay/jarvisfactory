---
description: Ship 2-4 independent features in parallel — each on its own worktree, with self-healing and converging review
argument-hint: <issue refs | PRD paths, space-separated>
---

Ship 2-4 independent features simultaneously using isolated git worktrees. Each runs the full pipeline; results converge for human approval.

## When to Use
- 2-4 independent issues that don't touch the same files/modules.
- No sequential dependency between them.

## When NOT to Use
- Issues touch the same files → run `/ship` sequentially.
- One depends on another's output.
- More than 4 (context becomes unmanageable).

## Stage 0 — Validate Independence
Confirm each issue touches different files/modules and shares no mutable state: `grep -rn "<keyword>" .` per issue. If they overlap → fall back to sequential `/ship`.

## Stage 1 — Parallel Feature Pipeline
For each issue, spawn an independent pipeline in its own worktree:
1. **Worktree:** `git worktree add .worktrees/<slug> -b feat/<slug>`; install deps + test for a clean baseline.
2. **Design** (**architect**): issue/PRD → spec → plan. Skip the brainstorming dialog for simple/known issues. ADR only if significant.
3. **Implement** (subagent-driven): per task — **implementer** (TDD) → spec review → code-quality review. Continuous.
4. **Quality gate + self-healing:** **local-tester**; if FAIL → **self-healer** (max 3). If still BLOCKED, mark the feature BLOCKED and continue the others.

## Stage 1.5 — Conflict Recheck (post-implementation)
After all features complete Stage 1 (or are BLOCKED), run a cross-diff check before proceeding to review:

```bash
# For each pair of READY branches, check for file overlap
for i in feat/slug-a feat/slug-b feat/slug-c; do
  for j in feat/slug-a feat/slug-b feat/slug-c; do
    [ "$i" = "$j" ] && continue
    OVERLAP=$(comm -12 \
      <(git diff main...$i --name-only | sort) \
      <(git diff main...$j --name-only | sort))
    if [ -n "$OVERLAP" ]; then
      echo "CONFLICT: $i and $j both modify:"
      echo "$OVERLAP"
    fi
  done
done
```

**If files overlap:**
1. Report the conflicting files and which features touch them.
2. Classify the conflict:
   - **Same lines / same logic** → STOP these two features. One must merge first, then the other rebases. Present the choice: "Which feature should merge first?"
   - **Different parts of the same file** (e.g., one adds an import, the other adds a function) → WARN but allow. Git merge will likely resolve automatically. Flag for manual verification after merge.
   - **Shared config/types file** (e.g., `types.ts`, `routes.tsx`, `index.css`) → WARN. These often auto-merge cleanly but check for semantic conflicts (duplicate keys, conflicting type definitions).
3. If no overlap → proceed to Stage 2.

## Stage 2 — Converge
For each READY feature → **code-reviewer** in parallel: architecture, security, project rules, N+1. 🔴 CRITICAL blocks / 🟡 WARNING informational.

## Stage 3 — Merge Sequentially (not simultaneously)
Even though features were built in parallel, merge them **one at a time** to catch integration issues:

For each READY + APPROVED feature (ordered by least file changes first):
1. Present the 4 options (merge / PR / keep / discard).
2. If merging locally: merge, then **re-run the quality gate** on main after the merge to verify no integration break.
3. If the quality gate fails after merge → spawn **self-healer**. If still broken → revert the merge and flag the feature as NEEDS REBASE.
4. Only proceed to merge the next feature after the previous one's quality gate passes.
5. Clean up worktrees: options 1 or 4 → `git worktree remove .worktrees/<slug> && git worktree prune`.

## Final Report
```
# Parallel Ship Report
| Feature | Branch | Heal | Conflict | Review | Status |
|---------|--------|------|----------|--------|--------|
| #123 | feat/x | 0x | none | APPROVED | ✅ MERGED |
| #124 | feat/y | 2x | warn(routes.tsx) | APPROVED WITH WARNINGS | ⚠️ PR |
| #125 | feat/z | 3x BLOCKED | — | — | 🔴 NEEDS HUMAN |

## Conflict Report
- feat/x and feat/y both modify routes.tsx (different sections — auto-merged OK)

## Blocked Features — diagnosis + suggested action
## Next Steps
```

## Rules
- Each worktree is isolated — agents can't see each other's changes.
- Never auto-merge — the human decides per feature.
- Never skip spec-compliance review before code-quality review.
- Never skip the conflict recheck after implementation.
- Merge one at a time, re-test after each merge.
- Max 4 parallel features. BLOCKED features don't stop the others.

## Input
Space-separated issue references or PRD paths (e.g. `#123 #124 #125`):
$ARGUMENTS
