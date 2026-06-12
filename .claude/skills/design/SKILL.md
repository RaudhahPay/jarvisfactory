---
name: "design"
description: "Turn a PRD or idea into an approved spec, an optional ADR, and a bite-sized TDD implementation plan"
---

Turn a PRD or feature idea into an approved spec, an ADR (if warranted), and a bite-sized implementation plan with TDD steps.

## Stage 1 — Brainstorm & Spec (one question at a time)
1. **Explore context** — read the PRD, `CLAUDE.md`, related files, recent commits, and existing ADRs in `docs/decisions/`.
2. **Ask clarifying questions** — one at a time, multiple-choice preferred. Don't bundle them with other content.
3. **Propose 2-3 approaches** — trade-offs and a clear recommendation.
4. **Present the design** section by section; get approval on each.
5. **Write the spec** to `docs/specs/YYYY-MM-DD-<slug>.md`; commit.
6. **Spec self-review** — scan for TBD/TODO placeholders, contradictions, ambiguity. Fix before showing the user.
7. **Review gate** — "Spec written to `<path>`. Please review before I write the plan."

**HARD GATE: do not write the implementation plan until the user approves the spec.**

## Stage 2 — ADR (if needed)
Spawn the **architect** agent to judge whether an ADR is warranted:
- Significant architectural choice → write `docs/decisions/NNNN-<slug>.md` (check existing numbers first).
- Minor detail → note the rationale in the plan header, skip the ADR.

## Stage 3 — Implementation Plan
Spawn the **architect** agent to write a bite-sized plan with TDD steps to `docs/plans/YYYY-MM-DD-<slug>.md`.

Every task must include:
- Exact file paths (create / modify / test), verified with `ls`/`grep`.
- TDD steps: write failing test → verify RED (project's test command) → minimal code → verify GREEN → commit.
- Exact commands with expected output, using the project's real toolchain (from `CLAUDE.md`).
- Complete code — no "TBD", no "fill in later", no "similar to Task N".

**Plan self-review:** spec coverage, placeholder scan, type/interface consistency across tasks.

## Stage 4 — Offer Execution Path
After the plan is saved:
> "Plan saved to `docs/plans/<file>.md`. Run `/develop <plan-path>` to implement it task-by-task (each task: implement → spec-compliance review → code-quality review)."

## Rules
- Never write the plan before the user approves the spec.
- ADR numbers are sequential — check existing first.
- Real file paths only — `grep`/`ls` to verify before writing them in the plan.

## Input
PRD path, feature idea, or architectural question:
(the user's input / arguments for this command)
