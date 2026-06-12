---
description: Process any input (business ticket, bug report, or feature idea) into a developer-ready PRD or triaged issue
argument-hint: <ticket file path | feature idea | bug report | plain-language request>
---

Universal entry point for all new work. Takes any input — business ticket, raw feature idea, bug report, or plain-language request — and produces a developer-ready artifact.

## Detection Logic
1. If the input is a file path → read it; classify below.
2. If it's plain text → classify below.

**Classification (auto-detect):**
- **Bug / error / complaint** (keywords: bug, error, crash, broken, failing, doesn't work, regression) → route to **bug-triager**.
- **Business ticket / non-technical request** (keywords: customers want, business needs, ops request, or written in non-technical language with no file paths or code references) → route to **biz-translator**.
- **Technical feature idea** (keywords: add, implement, build, create, integrate, or written with technical specificity — mentions components, APIs, data models) → route to **feature-proposer**.
- **Ambiguous** → ask the user: "Is this a bug, a business request, or a technical feature idea?"

## Pipeline

### Path A — Bug
Spawn **bug-triager** → reproduce → classify severity → write `docs/issues/YYYY-MM-DD-<slug>.md`.

### Path B — Business Ticket (non-technical input)
Spawn **biz-translator**:
- Translate to PRD, preserving original business language in the Problem section.
- Write to `docs/proposals/YYYY-MM-DD-<slug>.md`.
- Produce translation summary: assumptions, ambiguities, urgency check.

### Path C — Technical Feature Idea
Spawn **feature-proposer**:
- Shape the idea into a structured, decision-ready PRD.
- Read `CLAUDE.md` for product/architecture context.
- Write to `docs/proposals/YYYY-MM-DD-<slug>.md`.
- Include impact analysis, success metrics, risks.

### All Paths — Wrap-up
1. **Tracker issue.** Suggest a title + labels and the exact command for the project's tracker.
2. **Summary.** Report: type (bug / business-feature / technical-feature), artifact path, open questions, urgency assessment.
3. **Next command.** End with the exact command to run next:
   - Bug → `/develop <issue-path>` (simple) or `/hotfix <issue-path>` (urgent production bug)
   - Feature → `/design <prd-path>`

## Rules
- One ticket → one file. Don't bundle multiple tickets.
- Flag urgency mismatches clearly (scope vs timeline).
- Always end with the exact next command to run.
- For ambiguous input, ask — don't guess the category.

## Input
Business ticket, feature idea, bug report, or plain-language request:
$ARGUMENTS
