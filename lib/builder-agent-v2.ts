// ============================================================
// JARVISFACTORY v11 / Phase 7.1 — Multi-file Builder agent loop
// ============================================================
// Sister to v8 builder-agent.ts. Uses BUILDER_TOOLS_V2 and a Record<string, string>
// file map instead of a single html string. Runs Claude turn-by-turn until finalize.
//
// Modes:
//   - full-app: Builder constructs an entire multi-file project in one agent run
//   - moduleMode: Builder adds one module's files to an existing tree (cumulative)
//   - integrationMode: Builder fixes cross-file bugs in an already-assembled tree
//                      (write_file is filtered out — only edits, no creates)
// ============================================================

import { BUILDER_TOOLS_V2, executeBuilderToolV2, createBuilderStateV2 } from './builder-tools-v2'
import type { BuilderStateV2 } from './builder-tools-v2'
import type { AgentContext } from './agents'
import { BUILDER } from './agents'

export type { BuilderStateV2 } from './builder-tools-v2'

// ──────────────────────────────────────────────────────────────
// Module spec — same shape as v1, used for per-module agent runs
// ──────────────────────────────────────────────────────────────
export interface ModuleSpecV2 {
  id: string
  name: string
  purpose: string
  index: number
  total: number
  deps?: string[]
  // Phase 7.1+: which files this module is allowed to create/edit. Empty = unrestricted.
  // The agent is encouraged (not forced) to stay within these paths.
  filesScope?: string[]
}

export interface AgentLoopOptionsV2 {
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
  initialFiles?: Record<string, string>
  entryPoint?: string
  moduleSpec?: ModuleSpecV2
  modelOverride?: string
}

export async function runBuilderAgentV2(opts: AgentLoopOptionsV2): Promise<BuilderStateV2> {
  const { ctx, needsAuth, callClaudeAgentic, onProgress, maxIterations = 18, initialFiles, entryPoint = 'index.html', moduleSpec, modelOverride } = opts
  const state = createBuilderStateV2(entryPoint)
  const moduleMode = !!moduleSpec
  const integrationMode = !moduleSpec && !!initialFiles && Object.keys(initialFiles || {}).length > 0
  if (initialFiles) state.files = { ...initialFiles }

  // ──────────────────────────────────────────────────────────────
  // System prompt — v2 framing teaches the model the file_tree convention
  // ──────────────────────────────────────────────────────────────
  const multiFileAddendum = `

═══ MULTI-FILE AGENTIC BUILD LOOP — YOU HAVE TOOLS ═══
You build apps as multi-file projects. The user will see a real file tree, not one giant HTML blob.

FILE TREE CONVENTION (Phase 7.1, pre-React):
  index.html              entry point — DOCTYPE, head, body shell. <link>s and <script>s reference other files in the tree.
  styles/main.css         all base styles (variables, layout, components)
  styles/screens.css      (optional) per-screen overrides
  scripts/app.js          main controller — init, routing (showOnly), helpers (toast, api)
  scripts/auth.js         (optional) signup/login/logout if app has auth
  scripts/<feature>.js    one file per major feature (dashboard, tasks, messaging, etc.)
  README.md               (optional) one-paragraph summary

EVERY <link> and <script> tag in index.html MUST reference a file you created in the tree (or an external CDN like fonts.googleapis.com).

WORKFLOW (full-app mode):

  PHASE 1 — SCAFFOLD
  1. Call write_file for "index.html" with a complete skeleton: DOCTYPE, <head> (title + meta + Google Fonts import + <link rel="stylesheet" href="styles/main.css">), <body> with screen containers (<div id="screen-login"></div>, <div id="screen-dash"></div>, etc.), <div id="toast"></div>, and <script src="scripts/app.js"></script>. Keep it under 3,000 tokens — just the shell.

  PHASE 2 — STYLES
  2. Call write_file for "styles/main.css" with full visual system: CSS variables from the Designer spec, screen layout rules, component classes (.btn, .card, .input, .toast), responsive media queries.

  PHASE 3 — SCRIPTS
  3. Call write_file for "scripts/app.js" with init function, showOnly router, toast helper, and any feature handlers. For auth-required apps, split auth into "scripts/auth.js" (signup/login/logout) and reference it with <script src="scripts/auth.js"></script> in index.html.

  PHASE 4 — AUDIT & FIX
  4. Call audit_build. For each [file]-tagged error, use write_file to overwrite that specific file with the fix, OR use append_to_file to add missing pieces.
  5. Re-run audit_build until CLEAN.

  PHASE 5 — FINALIZE
  6. Call finalize.

HARD RULES:
- Never call finalize until audit_build is CLEAN.
- Keep individual files under ~6,000 tokens each. If a file gets too big, split it (e.g., scripts/dashboard.js + scripts/dashboard-charts.js).
- All <script src="..."> and <link href="..."> in index.html must resolve to files you created (or external https:// URLs).
- The Jarvis library is auto-injected at runtime by the preview shell — DO NOT include a <script> tag for it.
- Use list_files to verify your tree before audit_build if you've created many files.`

  // ──────────────────────────────────────────────────────────────
  // Module mode addendum — adds files for one module to existing tree
  // ──────────────────────────────────────────────────────────────
  const moduleAddendum = moduleSpec ? `

═══ MODULE ${moduleSpec.index}/${moduleSpec.total} — ${moduleSpec.name} ═══

ONE-TURN JOB: add this module's files (or extend existing files) to the project tree.

PURPOSE: ${moduleSpec.purpose}

${moduleSpec.index === 1
  ? `WORKFLOW (you are MODULE 1, the foundation):
1. write_file "index.html" — skeleton: DOCTYPE, head (title + Google Fonts + <link rel="stylesheet" href="styles/main.css">), body with empty screen containers + toast + <script src="scripts/app.js"></script>. Keep under 3,000 tokens.
2. write_file "styles/main.css" — full design system (CSS variables from Designer, base layout, component classes).
3. write_file "scripts/app.js" — init() with 5s loader timeout fallback, showOnly() router, toast() helper, api() fetch wrapper. NO feature handlers yet.
4. Call finalize.

Skip audit_build — orchestrator does final audit after all modules.`
  : `WORKFLOW (you are MODULE ${moduleSpec.index}, extending existing tree):
1. Use list_files first to see what's there.
2. For new functionality: write_file for new feature scripts ("scripts/${moduleSpec.id}.js"), append_to_file for additions to existing files (index.html screen containers, styles/main.css feature styles).
3. If you create new scripts, also append_to_file to "index.html" to add <script src="scripts/${moduleSpec.id}.js"></script> just before "</body>".
4. Call finalize.

DO NOT call audit_build (orchestrator runs final audit later).`}

${(moduleSpec.deps || []).length > 0 ? `DEPS already in tree: ${(moduleSpec.deps || []).join(', ')}.` : ''}` : ''

  // ──────────────────────────────────────────────────────────────
  // Integration mode addendum — fix cross-file bugs only
  // ──────────────────────────────────────────────────────────────
  const integrationAddendum = `

═══ INTEGRATION MODE — PATCH ONLY, DO NOT REWRITE ═══

The modules have ALREADY built the project tree. Files exist. Your only job is to fix cross-file bugs.

YOUR JOB:
1. Call list_files to see what's there.
2. Call audit_build to find issues.
3. For each [file]-tagged error:
   • append_to_file — add missing functions or screens
   • write_file (overwrite) — only if a file needs major reworking (e.g., complete script rewrite)
4. Re-run audit_build until clean.
5. Call finalize.

PREFER append_to_file over write_file in this mode. The modular work must be preserved.`

  const sys = BUILDER.buildSystemPrompt(ctx) + (
    moduleMode ? moduleAddendum
    : integrationMode ? integrationAddendum
    : multiFileAddendum
  )

  // ──────────────────────────────────────────────────────────────
  // User message — gives Builder the proposal, spec, current tree state
  // ──────────────────────────────────────────────────────────────
  let userMsg: string
  if (moduleSpec) {
    const treePreview = Object.keys(state.files).length === 0
      ? '(empty — you are the foundation)'
      : Object.keys(state.files).sort().map(p => `  ${p}  (${state.files[p].length.toLocaleString()} chars)`).join('\n')
    userMsg = `MODULE ${moduleSpec.index} OF ${moduleSpec.total}: ${moduleSpec.name}

PROPOSAL (overall app contract):
${JSON.stringify(ctx.proposal, null, 2)}

ARCHITECT'S DESIGN SPEC (your blueprint for the WHOLE app):
${JSON.stringify(ctx.designSpec, null, 2)}

THIS MODULE'S PURPOSE (what you must add THIS turn):
${moduleSpec.purpose}

CURRENT PROJECT TREE:
${treePreview}`
  } else if (integrationMode) {
    const treePreview = Object.keys(state.files).sort().map(p => `  ${p}  (${state.files[p].length.toLocaleString()} chars)`).join('\n')
    userMsg = `INTEGRATION PASS — modules built the project tree. Fix cross-file bugs.

PROPOSAL (overall app contract):
${JSON.stringify(ctx.proposal, null, 2)}

ARCHITECT'S DESIGN SPEC:
${JSON.stringify(ctx.designSpec, null, 2)}

CURRENT PROJECT TREE:
${treePreview}

YOUR JOB:
1. list_files (verify tree)
2. audit_build (find issues)
3. Fix each issue with append_to_file (preferred) or write_file (only if a major rewrite needed)
4. Re-audit. Loop until clean.
5. finalize.`
  } else {
    // full-app mode
    const fileTreeHint = (ctx.designSpec as any)?.file_tree
    userMsg = `${BUILDER.buildUserMessage(ctx)}

${fileTreeHint ? `\nFILE TREE PLANNED BY ARCHITECT (build these):\n${JSON.stringify(fileTreeHint, null, 2)}\n` : ''}
Build the project as a multi-file tree following the workflow in your system prompt. Start with index.html scaffold.`
  }
  const messages: any[] = [{ role: 'user', content: userMsg }]

  // ──────────────────────────────────────────────────────────────
  // Tool filtering — integration mode forbids write_file (preserves module work)
  // ──────────────────────────────────────────────────────────────
  const toolsForThisRun = integrationMode
    ? BUILDER_TOOLS_V2.filter(t => t.name !== 'write_file')
    : BUILDER_TOOLS_V2

  // ──────────────────────────────────────────────────────────────
  // Main loop — runs Claude turn-by-turn, executing tools, until finalized
  // ──────────────────────────────────────────────────────────────
  for (let i = 1; i <= maxIterations; i++) {
    state.iterations = i
    const response = await callClaudeAgentic({
      system: sys,
      messages,
      tools: toolsForThisRun,
      max_tokens: 32000,
      model: modelOverride || BUILDER.model,
    })

    const blocks = response.content || []
    messages.push({ role: 'assistant', content: blocks })

    const thinking = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim()
    if (thinking && onProgress) onProgress({ iteration: i, thinking })

    const toolUses = blocks.filter((b: any) => b.type === 'tool_use')
    if (toolUses.length === 0) {
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
      // Handle truncated tool_use input (Anthropic cut off mid-JSON)
      if ((tu as any)._truncated) {
        const truncMsg = `ERROR: Your tool_use response was TRUNCATED at ${(tu as any)._partialJsonLength || 'unknown'} chars. The tool DID NOT execute. The file you tried to write was too large for one call.

FIX: Split into multiple write_file calls + append_to_file calls:
  1. write_file with a SKELETON of the file (header, body shell, base structure). Keep under 3,000 tokens.
  2. append_to_file with each chunk, using a unique anchor (e.g., "</main>", "/* END_STYLES */", "// END_HANDLERS").
  3. Verify with read_file or list_files, then audit_build → finalize.`
        state.toolCalls.push({ name: tu.name, ok: false, note: 'TRUNCATED' })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: truncMsg, is_error: true })
        if (onProgress) onProgress({ iteration: i, toolName: tu.name, toolResult: 'TRUNCATED — telling Builder to chunk' })
        continue
      }

      const result = executeBuilderToolV2(tu.name, tu.input || {}, state, {
        needsAuth,
        moduleMode,
        integrationMode,
      })
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
