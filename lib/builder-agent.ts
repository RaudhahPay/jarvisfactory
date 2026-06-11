// ============================================================
// JARVISFACTORY v8.0 — Tool-using Builder agent
// ============================================================
// Replaces the one-shot Builder with a multi-turn tool-using agent.
// Builder writes HTML, audits its own output, patches missing functions,
// re-audits, and only finalizes when clean. Mirrors how Claude Code behaves.
// ============================================================

import { validateBuild } from './jarvis-patterns'
import type { AgentContext } from './agents'
import { BUILDER } from './agents'

// ──────────────────────────────────────────────────────────────
// TOOL SCHEMAS — sent to Claude as `tools` in the request
// ──────────────────────────────────────────────────────────────
export const BUILDER_TOOLS = [
  {
    name: 'write_full_html',
    description:
      'Write the complete single-file HTML app in one go. After this, you MUST call audit_build to check your work, then patch issues. Only after audit_build returns clean may you call finalize.',
    input_schema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description:
            'Complete HTML document starting with <!DOCTYPE html>. Includes inline <style>, all screens (login, signup, dashboard, etc.), and a single <script> at the end with EVERY function referenced by onclick handlers defined.',
        },
      },
      required: ['html'],
    },
  },
  {
    name: 'audit_build',
    description:
      "Audits the current HTML for: (1) onclick/onsubmit handlers that reference functions not defined in the script, (2) localStorage usage with disallowed keys (only 'theme', 'darkMode', 'jarvis_*', 'jf_*' allowed), (3) missing Jarvis.signup/login when auth is required, (4) hardcoded demo credentials. Returns specific issue list. Call after write_full_html and after each round of patches.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'add_function_to_script',
    description:
      'Append a function definition to the end of the main <script> block (just before </script>). Use this to fix "Undefined onclick handlers" issues from audit_build.',
    input_schema: {
      type: 'object',
      properties: {
        function_code: {
          type: 'string',
          description:
            'Full function definition. E.g. "function showSignup() { showOnly(\\"screen-signup\\"); }" or "async function doLogin() { try { await Jarvis.login(...) } catch(e) { toast(e.message, \\"error\\") } }"',
        },
      },
      required: ['function_code'],
    },
  },
  {
    name: 'patch_html',
    description:
      'Replace a specific block of text in the HTML with a new block. Use to fix specific issues (e.g. replace localStorage usage with Jarvis API calls). Old text must be unique in the document.',
    input_schema: {
      type: 'object',
      properties: {
        old_text: {
          type: 'string',
          description: 'Exact text to find. Must be unique in the document. Include enough context to be unambiguous.',
        },
        new_text: { type: 'string', description: 'Replacement text.' },
      },
      required: ['old_text', 'new_text'],
    },
  },
  {
    name: 'append_html',
    description:
      'Insert a chunk of HTML/CSS/JS into the document just before a specified anchor string. Use this to build the app in chunks when write_full_html is too large to fit in one call. Examples: anchor="</main>" to add screens; anchor="</style>" to add CSS; anchor="</script>" to add functions.',
    input_schema: {
      type: 'object',
      properties: {
        chunk: {
          type: 'string',
          description: 'The HTML/CSS/JS chunk to insert. Should be self-contained and syntactically valid.',
        },
        anchor: {
          type: 'string',
          description: 'Anchor text to insert before. Must exist exactly once in the document. Common: "</main>", "</body>", "</style>", "</script>", "</head>".',
        },
      },
      required: ['chunk', 'anchor'],
    },
  },
  {
    name: 'get_current_html',
    description:
      'Returns the current accumulated HTML so you can see what you have so far. Use sparingly — only when you need to verify the current state. Returns up to 30,000 characters.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'finalize',
    description:
      'Mark the build as complete. ONLY call this AFTER audit_build returned no errors. The build will be shipped to the user.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One-sentence summary of what was built (e.g. "Built a 6-screen to-do app with role-based auth, task CRUD, and dark mode toggle").',
        },
      },
      required: ['summary'],
    },
  },
]

// ──────────────────────────────────────────────────────────────
// BUILDER STATE — accumulated across tool calls
// ──────────────────────────────────────────────────────────────
export interface BuilderState {
  html: string
  finalized: boolean
  finalSummary: string
  iterations: number
  toolCalls: { name: string; ok: boolean; note?: string }[]
}

export function createBuilderState(): BuilderState {
  return { html: '', finalized: false, finalSummary: '', iterations: 0, toolCalls: [] }
}

// ──────────────────────────────────────────────────────────────
// TOOL EXECUTORS — pure functions on state
// ──────────────────────────────────────────────────────────────
type ToolResult = { ok: boolean; content: string }

export function executeBuilderTool(
  name: string,
  input: any,
  state: BuilderState,
  ctx: { needsAuth: boolean; moduleMode?: boolean }
): ToolResult {
  switch (name) {
    case 'write_full_html': {
      const html = String(input?.html || '').trim()
      if (html.length < 200) return { ok: false, content: 'ERROR: HTML is too short to be a real app.' }
      // Strip accidental markdown fences just in case
      const cleaned = html.replace(/^```html\n?/, '').replace(/\n?```$/, '')
      state.html = cleaned
      return { ok: true, content: `HTML written (${cleaned.length.toLocaleString()} chars). Now call audit_build.` }
    }
    case 'audit_build': {
      if (!state.html) return { ok: false, content: 'ERROR: no HTML yet — call write_full_html first.' }
      const v = validateBuild(state.html, ctx.needsAuth)
      if (v.valid && v.warnings.length === 0) {
        return { ok: true, content: 'AUDIT CLEAN. No errors, no warnings. You may now call finalize.' }
      }
      const lines: string[] = []
      if (v.errors.length) {
        lines.push('ERRORS (must fix before finalize):')
        v.errors.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`))
      }
      if (v.warnings.length) {
        lines.push('WARNINGS (non-blocking, but consider fixing):')
        v.warnings.forEach((w, i) => lines.push(`  ${i + 1}. ${w}`))
      }
      return { ok: false, content: lines.join('\n') }
    }
    case 'add_function_to_script': {
      if (!state.html) return { ok: false, content: 'ERROR: no HTML yet — call write_full_html first.' }
      const code = String(input?.function_code || '').trim()
      if (!code) return { ok: false, content: 'ERROR: function_code is empty.' }
      const lastClose = state.html.lastIndexOf('</script>')
      if (lastClose === -1) return { ok: false, content: 'ERROR: no </script> tag found in current HTML.' }
      state.html = state.html.slice(0, lastClose) + '\n' + code + '\n' + state.html.slice(lastClose)
      return { ok: true, content: `Function appended to script. HTML now ${state.html.length.toLocaleString()} chars. Re-run audit_build to verify.` }
    }
    case 'patch_html': {
      if (!state.html) return { ok: false, content: 'ERROR: no HTML yet — call write_full_html first.' }
      const oldT = String(input?.old_text || '')
      const newT = String(input?.new_text ?? '')
      if (!oldT) return { ok: false, content: 'ERROR: old_text is empty.' }
      const occurrences = state.html.split(oldT).length - 1
      if (occurrences === 0) return { ok: false, content: `ERROR: old_text not found in HTML. Use get_current_html or audit_build to see the current state.` }
      if (occurrences > 1) return { ok: false, content: `ERROR: old_text appears ${occurrences} times — must be unique. Add more context to make it unambiguous.` }
      state.html = state.html.replace(oldT, newT)
      return { ok: true, content: `Patched. HTML now ${state.html.length.toLocaleString()} chars. Re-run audit_build to verify.` }
    }
    case 'append_html': {
      if (!state.html) return { ok: false, content: 'ERROR: no HTML yet — call write_full_html first (start with a skeleton, then append).' }
      const chunk = String(input?.chunk || '')
      const anchor = String(input?.anchor || '')
      if (!chunk) return { ok: false, content: 'ERROR: chunk is empty.' }
      if (!anchor) return { ok: false, content: 'ERROR: anchor is empty.' }
      const occurrences = state.html.split(anchor).length - 1
      if (occurrences === 0) return { ok: false, content: `ERROR: anchor "${anchor}" not found in HTML. Common anchors: </main>, </body>, </style>, </script>, </head>. Use get_current_html to see what's available.` }
      if (occurrences > 1) return { ok: false, content: `ERROR: anchor "${anchor}" appears ${occurrences} times — must be unique. Use a more specific anchor.` }
      state.html = state.html.replace(anchor, chunk + '\n' + anchor)
      return { ok: true, content: `Appended ${chunk.length.toLocaleString()} chars before "${anchor}". HTML now ${state.html.length.toLocaleString()} chars total.` }
    }
    case 'get_current_html': {
      if (!state.html) return { ok: true, content: '(no HTML written yet)' }
      const max = 30000
      if (state.html.length <= max) return { ok: true, content: state.html }
      return { ok: true, content: state.html.slice(0, max) + `\n\n[...truncated. Total length: ${state.html.length} chars]` }
    }
    case 'finalize': {
      if (!state.html) return { ok: false, content: 'ERROR: no HTML yet — call write_full_html first.' }
      // v9.2: In module mode, audit is advisory — orchestrator will run final audit after all modules.
      // In full-app mode (default), audit must be clean before finalize.
      if (!ctx.moduleMode) {
        const v = validateBuild(state.html, ctx.needsAuth)
        if (!v.valid) {
          return { ok: false, content: `ERROR: Cannot finalize — audit_build still reports errors:\n${v.errors.map(e => '  • ' + e).join('\n')}\n\nFix these first using add_function_to_script or patch_html, then call audit_build again, then finalize.` }
        }
      }
      state.finalized = true
      state.finalSummary = String(input?.summary || 'Build complete.')
      return { ok: true, content: ctx.moduleMode
        ? `MODULE COMPLETE. Orchestrator will run the next module. (Final audit happens after all modules.)`
        : 'BUILD FINALIZED. Returning to user.' }
    }
    default:
      return { ok: false, content: `ERROR: unknown tool "${name}".` }
  }
}

// ──────────────────────────────────────────────────────────────
// AGENT LOOP — runs Claude turn-by-turn with tools until finalized
// ──────────────────────────────────────────────────────────────
export interface ModuleSpec {
  id: string
  name: string
  purpose: string
  index: number  // 1-based: 1, 2, 3, ...
  total: number  // total number of modules in this build
  deps?: string[]
}

export interface AgentLoopOptions {
  ctx: AgentContext
  needsAuth: boolean
  callClaudeAgentic: (params: {
    system: string
    messages: any[]
    tools: any[]
    max_tokens: number
    model?: string
  }) => Promise<{ content: any[]; stop_reason?: string }>
  onProgress?: (event: { iteration: number; toolName?: string; toolInput?: any; toolResult?: string; thinking?: string }) => void
  maxIterations?: number
  // v9.2: Modular execution support
  initialHtml?: string  // Carry HTML state from previous module
  moduleSpec?: ModuleSpec  // If provided: this is a module run, not a full-app run
  // v9.6 speed-2: override Builder model (e.g. Haiku for simple modules like foundation/polish)
  modelOverride?: string
}

export async function runBuilderAgent(opts: AgentLoopOptions): Promise<BuilderState> {
  const { ctx, needsAuth, callClaudeAgentic, onProgress, maxIterations = 20, initialHtml, moduleSpec, modelOverride } = opts
  const state = createBuilderState()
  const moduleMode = !!moduleSpec
  // v9.4: Integration mode — initialHtml present but no moduleSpec means we are running
  // AFTER all modules to fix cross-module bugs. We must NOT rewrite the assembled HTML.
  const integrationMode = !moduleSpec && !!initialHtml
  if (initialHtml) state.html = initialHtml

  // System prompt addendum — different framing for module-mode vs full-app mode
  const fullAppAddendum = `

═══ AGENTIC BUILD LOOP — YOU HAVE TOOLS ═══
You build apps in phases using tools, NOT in one shot.

PHASE 1 — WRITE
For SIMPLE apps (1-3 screens, ~5,000 tokens of HTML): call write_full_html with the complete app.
For MEDIUM/COMPLEX apps (4+ screens, multi-role, ~15k+ tokens): use chunked writes:
  1. Call write_full_html with a SKELETON (DOCTYPE, head with title and base styles, body with empty <main id="app"></main> shell, base <script> with helper functions like showOnly/toast/api). Keep skeleton under 6,000 tokens.
  2. Call append_html for EACH screen, anchored before "</main>".
  3. Call append_html for additional CSS, anchored before "</style>".
  4. Call append_html (or add_function_to_script) for EACH helper function group, anchored before "</script>".

PHASE 2 — AUDIT & FIX
  5. Call audit_build to see what's broken.
  6. For each issue: add_function_to_script (missing onclick functions), patch_html (replace localStorage with Jarvis), or append_html (add missing screens).
  7. Call audit_build again to verify.
  8. Repeat until audit_build returns CLEAN.

PHASE 3 — FINALIZE
  9. Call finalize.

HARD RULES:
- Never call finalize until audit_build is CLEAN.
- If write_full_html fails with TRUNCATED error, switch to chunked writes (skeleton + append_html).
- If a single chunk would be more than ~10,000 tokens, split it further.
- The audit is mechanical (regex) — fix every issue it lists, no exceptions.`

  // v9.6 speed-4 — modular mode prompt, trimmed to essentials. Saves ~1.5k tokens per module call.
  const moduleAddendum = moduleSpec ? `

═══ MODULE ${moduleSpec.index}/${moduleSpec.total} — ${moduleSpec.name} ═══

ONE-TURN JOB: add this module's content to the existing app. Do NOT build the whole app.

PURPOSE: ${moduleSpec.purpose}

${moduleSpec.index === 1
  ? `WORKFLOW (you are MODULE 1, the foundation):
1. Call write_full_html with a SKELETON: DOCTYPE, head (title + meta + font imports + base CSS), body with empty <main id="app"></main>, <div id="toast"></div>, <script> with helpers (showOnly, toast, init w/ 5s timeout fallback). NO login/dashboard/feature content yet. Keep under 6,000 tokens.
2. Call finalize.

Skip audit_build — orchestrator does final audit after all modules.`
  : `WORKFLOW (you are MODULE ${moduleSpec.index}, appending to existing skeleton):
1. Use append_html for each chunk you add — anchor "</main>" for screens, "</style>" for CSS, "</script>" for functions.
2. Use add_function_to_script for individual functions if simpler.
3. Call finalize.

DO NOT call write_full_html (skeleton exists). DO NOT call audit_build (orchestrator runs final audit later).`}

${(moduleSpec.deps || []).length > 0 ? `DEPS already in HTML: ${(moduleSpec.deps || []).join(', ')}.` : ''}` : ''

  // v9.4 Integration-mode addendum — the modules are done, your job is to STITCH them.
  const integrationAddendum = `

═══ INTEGRATION MODE — STITCH, DO NOT REWRITE ═══

The 8+ modules have ALREADY built the app's structure. The complete assembled HTML is in your state.

YOUR ONLY JOB:
1. Call audit_build to find cross-module bugs (undefined onclick functions referenced from one module but defined in another that hasn't been written yet, broken init flow, missing showOnly() routes between screens, localStorage abuse, demo creds).
2. Fix each issue using:
   • add_function_to_script — for missing function definitions
   • patch_html — for surgical replacements (e.g., replacing localStorage with Jarvis API)
   • append_html — for adding missing screens or sections
3. Re-run audit_build to verify clean.
4. Call finalize.

⛔ DO NOT call write_full_html. It is NOT in your tool list this turn — calling it will fail. The modular work would be erased.

The accumulated HTML is large (potentially 60k+ chars). Use get_current_html SPARINGLY (returns up to 30k chars). Most of the time, audit_build will tell you exactly what's wrong and where.`

  const sys = BUILDER.buildSystemPrompt(ctx) + (moduleMode ? moduleAddendum : integrationMode ? integrationAddendum : fullAppAddendum)

  // Build the user message based on which mode we're in
  let userMsg: string
  if (moduleSpec) {
    // v9.2: Per-module mode — agent extends the running app with this module's content
    userMsg = `MODULE ${moduleSpec.index} OF ${moduleSpec.total}: ${moduleSpec.name}

PROPOSAL (overall app contract):
${JSON.stringify(ctx.proposal, null, 2)}

ARCHITECT'S DESIGN SPEC (your blueprint for the WHOLE app):
${JSON.stringify(ctx.designSpec, null, 2)}

THIS MODULE'S PURPOSE (what you must add THIS turn):
${moduleSpec.purpose}

${state.html
  ? `EXISTING APP HTML (so far — ${state.html.length.toLocaleString()} chars). Use append_html to extend it.\n\n${state.html.length > 8000 ? state.html.slice(0, 8000) + `\n\n[...truncated. Total ${state.html.length} chars. Use get_current_html if you need to see more.]` : state.html}`
  : 'No HTML yet — you are MODULE 1, the foundation. Call write_full_html with the complete skeleton.'}`
  } else if (integrationMode) {
    // v9.4: Integration pass — fix cross-module bugs in the assembled HTML
    const htmlPreview = state.html.length > 12000
      ? state.html.slice(0, 12000) + `\n\n[...truncated. Total ${state.html.length} chars. Use get_current_html sparingly to see more.]`
      : state.html
    userMsg = `INTEGRATION PASS — the 8 modules already built the app. Fix bugs at the seams.

PROPOSAL (overall app contract):
${JSON.stringify(ctx.proposal, null, 2)}

ARCHITECT'S DESIGN SPEC:
${JSON.stringify(ctx.designSpec, null, 2)}

ASSEMBLED HTML (${state.html.length.toLocaleString()} chars — DO NOT REWRITE, only patch/extend/add functions):
${htmlPreview}

YOUR JOB:
1. Call audit_build first.
2. For each issue: add_function_to_script (missing onclick handlers), patch_html (replace bad code), append_html (add missing screens).
3. Re-audit. Loop until clean.
4. Call finalize.

You CANNOT call write_full_html in this mode. Don't try.`
  } else {
    userMsg = BUILDER.buildUserMessage(ctx)
  }
  const messages: any[] = [{ role: 'user', content: userMsg }]

  // v9.4: In integration mode, REMOVE write_full_html from the tools so the agent
  // physically cannot rewrite the assembled HTML. The 8 modules' work must be preserved.
  const toolsForThisRun = integrationMode
    ? BUILDER_TOOLS.filter(t => t.name !== 'write_full_html')
    : BUILDER_TOOLS

  for (let i = 1; i <= maxIterations; i++) {
    state.iterations = i
    const response = await callClaudeAgentic({
      system: sys,
      messages,
      tools: toolsForThisRun,
      // v8.1: bumped from 16k → 32k. Complex apps (BrainyBunch-scale) need ~25k tokens
      // of HTML in a single tool_use call. 16k was getting truncated mid-string.
      max_tokens: 32000,
      model: modelOverride || BUILDER.model,
    })

    const blocks = response.content || []

    // Append assistant turn (full content array — text + tool_use)
    messages.push({ role: 'assistant', content: blocks })

    // Capture any thinking / text the model emitted alongside tool calls
    const thinking = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim()
    if (thinking && onProgress) onProgress({ iteration: i, thinking })

    const toolUses = blocks.filter((b: any) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      // Model stopped without using tools — push it to call finalize or audit
      if (response.stop_reason === 'end_turn' && !state.finalized) {
        messages.push({
          role: 'user',
          content: 'You stopped without using tools. If your build is complete, call finalize. Otherwise call audit_build and fix any issues.',
        })
        continue
      }
      break
    }

    const toolResults: any[] = []
    for (const tu of toolUses) {
      // v8.1: Detect server-side flagged truncation BEFORE running the tool.
      // If Anthropic cut off mid-tool-input, the tool will receive empty input and
      // silently succeed/fail. Surface the truncation explicitly to the model.
      if ((tu as any)._truncated) {
        const trunc = `ERROR: Your tool_use response was TRUNCATED at ${(tu as any)._partialJsonLength || 'unknown'} chars before completing the input JSON. The tool DID NOT execute. Your HTML was too long to fit in one write_full_html call.\n\nFIX: Use append_html to build the app in chunks instead:\n  1. Call write_full_html with a SKELETON (DOCTYPE, head, body shell, empty <main id="app"></main>, base <style>, base <script> with helpers). Keep it under 8,000 tokens.\n  2. Call append_html for each role's screens, anchored before "</main>".\n  3. Call append_html for additional CSS, anchored before "</style>".\n  4. Call append_html (or add_function_to_script) for each helper function, anchored before "</script>".\n  5. audit_build → fix → finalize.`
        state.toolCalls.push({ name: tu.name, ok: false, note: 'TRUNCATED' })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: trunc, is_error: true })
        if (onProgress) onProgress({ iteration: i, toolName: tu.name, toolResult: 'TRUNCATED — telling Builder to chunk' })
        continue
      }
      const result = executeBuilderTool(tu.name, tu.input || {}, state, { needsAuth, moduleMode })
      state.toolCalls.push({ name: tu.name, ok: result.ok, note: result.content.slice(0, 200) })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.content,
        ...(result.ok ? {} : { is_error: true }),
      })
      if (onProgress) {
        onProgress({ iteration: i, toolName: tu.name, toolInput: tu.input, toolResult: result.content.slice(0, 300) })
      }
    }

    messages.push({ role: 'user', content: toolResults })

    if (state.finalized) break
  }

  return state
}
