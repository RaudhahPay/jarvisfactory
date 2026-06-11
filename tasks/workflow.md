# JarvisFactory — How I (Claude) Work on This Project

*Workflow contract between Coach Fadzil and Claude. Reviewed at session start.*

---

## Default behaviour for any non-trivial request

### 1. Plan first, code second.
For ANY task that touches 3+ files, has architectural implications, or might fail in non-obvious ways:
1. Read `tasks/lessons.md` for relevant patterns
2. Write a one-paragraph plan including: what to change, why, and how I'll verify
3. List the steps in TaskCreate with checkable items
4. Only after that — start coding

For trivial tasks (rename a variable, fix a typo, add a sentence to a prompt) — just do it.

### 2. After 2 failed patches, STOP.
If I've shipped 2 fixes for the same bug class and it's still happening:
1. Stop patching
2. Re-read the actual error from the user
3. Diagnose root cause (not symptom)
4. Propose architectural change explicitly
5. Wait for user approval before shipping

This rule exists because of session 2026-05-07 where I patched the same Builder bug class 8 times before finally rewriting the architecture.

### 3. Use subagents for breadth.
For tasks that require:
- Searching across many files
- Reading large unknown content
- Running independent tools in parallel
- Deep research

Spawn a subagent with a focused prompt. Keep my main context for synthesis and decisions.

### 4. Verify before declaring done.
A task is NOT complete until I have proof it works:
- **Code change → compile check** (look for the new code in `.next/server/`)
- **UI change → user screenshot or `read_page`**
- **API change → successful response with expected shape**
- **Build pipeline change → a test app builds end-to-end**

I don't say "fixed" without proof. I say "shipped, please verify by doing X" or "verified — here's the proof".

### 5. Capture lessons after every correction.
When the user corrects me or points out a mistake:
1. Add the pattern to `tasks/lessons.md`
2. Make sure the rule is specific enough to prevent the same mistake
3. Reference the rule in future similar situations

---

## Tools I have and when to use them

| Tool | Use for |
|---|---|
| `Read` | Reading specific files I know exist |
| `Grep` | Searching for patterns in code |
| `Glob` | Finding files by name pattern |
| `Edit` | Surgical changes to known content |
| `Write` | New files only — never to overwrite without reading first |
| `mcp__workspace__bash` | Running shell commands, especially: stat / grep on `.next` bundles to verify compiles, ls on directories, file-existence checks |
| `Agent` (subagent) | Open-ended research, parallel work, or anything that would bloat my context |
| `TaskCreate/TaskUpdate` | Tracking multi-step work — always for 3+ step tasks |
| `mcp__cowork__create_artifact` | When user wants a persistent dashboard / live page |

---

## Communication style

### Be direct.
- Lead with the answer. If user asks "did X fix it?", first word is "Yes" / "No" / "Partially".
- Don't pad with "I appreciate your patience" or other softening.
- If something failed, state it: "I shipped that wrong. Specifically, I ___."

### Be honest about limits.
- "I can't see X without you running Y" — fine, ask for it.
- "I'm not sure if this fixes it — please verify by ___" — fine.
- "This is fixed!" — only after verification.

### Be brief when the user is tired.
After 4+ rounds on the same issue, my response should be ≤200 words. Action over explanation.

### Lead with the user's own words.
When the user says "build is too slow" or "still broken", echo that exact concern in my opening: "Right — too slow. Cutting it from X to Y now." Don't reframe their concern in my own words first.

---

## File / project conventions

- **`tasks/`** holds my workflow files (lessons, this file, todo lists).
- **`lib/`** is for utility modules.
- **`app/`** is Next.js routes.
- Never create README.md or other doc files unless user explicitly asks.
- Never write to `/Users/coachfadzilhashim/jarvisuniverse/` unless user explicitly asks for a final deliverable there.

---

## Anti-patterns to refuse

If I catch myself doing any of these, stop and reread this file:

- Adding a 3rd retry mechanism to a system that already has 2
- Saying "fixed!" when I haven't verified
- Asking for a screenshot when I could have grepped the source myself
- Patching a regex when the root cause is the architecture
- Writing prose explaining what I'll do — instead of doing it
- Claiming a fix worked because it compiled (compile ≠ correct)

---

*This is a contract. If I violate it, the user is right to call me on it.*
