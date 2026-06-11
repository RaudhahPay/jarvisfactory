# JarvisFactory — Lessons Learned

*A living document. Updated after every user correction and every shipped class of bug.*
*Reviewed at the start of every session.*

---

## Architecture / Engineering Lessons

### L-9. Modular builds need a final integration pass.
Independently-built modules accumulate undetected cross-module bugs (init function references X defined in module 5; auth module's onclick="showDashboard()" but dashboard module hasn't yet defined it; etc.). Per-module audit was disabled to allow finalize. Result: 8 modules, 66k tokens, app stuck on loader.
**Rule:** After all modules complete, run ONE more Builder agent pass on the assembled HTML with `moduleMode=false` (strict audit gate). This catches cross-module references and forces fix-ups before QA. Don't skip it.



### L-1. One-shot text generation has a hard ceiling.
For complex apps with strict requirements (no undefined functions, no localStorage abuse, every feature delivered), single-prompt Claude calls fail too often. The fix is tool-using agents — same model, different capability.
**Rule:** When the Builder produces a class of bug 2+ times in a row, the architecture is wrong, not the prompt. Switch to tool-using or smaller-scope generation.

### L-2. Hard mechanical gates beat AI judgment for compliance checks.
The AI QA agent certified apps with localStorage abuse multiple times. The regex validator caught what AI missed.
**Rule:** Anywhere I have a yes/no compliance rule (use Jarvis API, no demo creds, every onclick has a definition), implement it as a regex/static-check gate that FORCES retry. Don't rely on AI judgment alone for compliance.

### L-3. Truncated tool_use JSON fails silently.
When Sonnet hits max_tokens mid-tool-call, JSON parsing fails, the tool gets empty input, and the agent loops forever thinking nothing succeeded.
**Rule:** Always detect partial JSON in streamed tool_use blocks and surface a clear error to the agent so it can switch strategies (e.g. chunk the writes).

### L-4. JS keywords look like function names to regex.
The first onclick check flagged `if`, `else`, `for` as undefined functions. False positives confuse the Builder during retry.
**Rule:** Always maintain an explicit skip list of JS keywords + builtins when extracting "function names" from inline event handlers.

### L-5. React closures capture stale state.
The Apply Fix button silently failed because the click handler captured an early-render version of `pendingFeedback` when the state was still empty.
**Rule:** For any callback that runs across React renders (window globals, setTimeout, dangerouslySetInnerHTML buttons), back the data with refs (`useRef`) — refs survive render cycles, state can race.

### L-6. Streaming connections die in browser tabs.
Chrome backgrounds tabs and suspends network IO. Long-lived SSE responses get killed.
**Rule:** Long-lived streams stay server-side. Client gets short-lived JSON responses. Server accumulates from upstream and returns one block.

### L-7. Hot Module Replacement files accumulate.
Next.js dev mode keeps every hot-update file. After 30+ edits, browsers serve stale chunks. The cached "API error 200" persisted through multiple "hard refreshes".
**Rule:** When a user's browser shows behavior that disagrees with the current source code, the immediate diagnosis is cache. The fix is `rm -rf .next` + Docker restart + brand-new tab.

### L-8. Pair regex errors with relevant fix instructions.
Initially every regex-fail message appended "use Jarvis API" — even for unrelated errors like undefined onclick handlers. The Builder got confused by irrelevant guidance.
**Rule:** Each error type needs its own targeted fix instruction. Don't dilute focused errors with generic boilerplate.

---

## Process Lessons

### P-1. After 2 failed patches, STOP and replan architecture.
This session: I patched the same Builder bug class 8 times. Should have stopped at 2 and asked "why is this architecture failing?"
**Rule:** Two consecutive patches that don't fully fix the same bug class = stop. Write a one-paragraph diagnosis of root cause. Propose architectural change. Verify with user before shipping.

### P-2. Verify before declaring done.
Multiple times in this session: I shipped a fix, claimed it worked, user tested and found it broken.
**Rule:** A task is NOT done until I have proof it works:
- Compile check on changed files (✓ doable)
- For UI changes: a screenshot or DOM extract from the user
- For API changes: a successful response with the exact shape expected
- For build changes: a successful build of a test app
"It should work now" is not done.

### P-3. The user often diagnoses faster than I do.
"Replit does this differently" → triggered the right architectural rewrite.
"You're not behaving like a senior full-stack developer" → triggered actual reflection.
**Rule:** When the user's question implies they see the answer faster than I do, take it seriously. Don't defend my approach. Adopt theirs.

### P-4. Read logs before asking for screenshots.
I asked for DevTools screenshots when I had filesystem access and could grep the compiled bundles myself.
**Rule:** Before asking the user for diagnostic info, exhaustively use available tools (grep source, grep .next bundles, read .env.local, etc.). Only ask the user for info I genuinely can't get myself.

### P-5. Don't fabricate. State limits.
**Rule:** When I can't see something or can't be sure, say so. "I think this fixes it" is much better than "this is fixed."

### P-6. Plan mode for any 3+ step task.
**Rule:** Before starting work that touches multiple files or has architectural implications, write a one-paragraph plan and confirm with user. Do not skip this for "obvious" work.

---

## Anti-Patterns to Avoid

- **Pattern: 30+ small patches accumulate over hours, none fully fix the issue.**
  Fix: stop at 2 failures, replan. Document the architectural change in lessons.md.

- **Pattern: I claim "this is fixed" without testing.**
  Fix: every "fix" message must include either a verification step or an explicit "please verify by doing X".

- **Pattern: I ask user for diagnostic data I can get myself.**
  Fix: before asking, do `grep`, `find`, `stat`, read source. Only escalate to user when truly necessary.

- **Pattern: I add complexity (more retries, more checks) instead of finding root cause.**
  Fix: 2nd retry mechanism = stop. Find why retries are needed.

---

## Session Patterns to Carry Forward

This session's wins (do more of these):
- Switching to tool-using Builder when one-shot kept failing (L-1)
- Server-side stream capture for browser tab resilience (L-6)
- `rm -rf .next` to nuke cache (L-7)
- Vector-drawn icons for PDF (avoiding font compatibility issues)

This session's losses (do less of these):
- 8+ patch attempts on the same bug class
- Marking tasks complete before user-side verification
- Asking user for DevTools data instead of grepping bundles
- Defending earlier approaches when user proposed redesign

---

*Update after every session. Capture patterns, not events.*
