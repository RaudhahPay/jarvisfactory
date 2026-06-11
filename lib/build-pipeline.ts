// ============================================================
// JARVISFACTORY v2 / Stage 4 — Layer-3: pure build orchestrator
// ============================================================
// The body of approveBuild() (app/builder/page.tsx, commit 608649f, lines
// ~1556–1875) lifted into a pure async function. NO React, NO setState, NO DOM.
//
// Translation rules (behavior-frozen — every log/chat string is verbatim):
//   addLog(msg, level)             -> emit({ type: 'log', msg, level })
//   addChat(html)                  -> emit({ type: 'chat', html })
//   setAgentStatus(s => ({...}))   -> emit({ type: 'agentStatus', agent, status, note })
//   callClaude / callClaudeAgentic -> deps.callClaude / deps.callClaudeAgentic
//   captureAppScreenshot           -> deps.captureScreenshot
//   finalPlan/jarvis/brand/etc.    -> input.*
//
// What stays in the React layer (the hook), NOT here:
//   - setPhase('building'), the timer, the agentReset, the "Plan approved" chat
//     (these run BEFORE this function)
//   - setQaReport, setTokens, setPhase('done'), the done logs, Supabase persistence,
//     injectBackend, recordBuildOutcome, extractLessonsFromQA, setBuiltCode
//     (these run AFTER this function resolves, using the returned BuildResult)
//   - the outer try/catch error UI — this function lets errors throw so the hook
//     catches them. Internal per-agent try/catches are preserved here as-is.
// ============================================================

import { ARCHITECT, DESIGNER, BUILDER, QA, parseAgentOutput, type AgentContext } from './agents'
import { runBuilderAgent } from './builder-agent'
import { validateBuild, promptRequiresAuth } from './jarvis-patterns'
import { loadJarvisLessons, formatLessonsForPrompt } from './jarvis-memory'
import type { BuildInput, BuildDeps, BuildResult, EmitFn } from './build-types'

export async function runBuildPipeline(input: BuildInput, deps: BuildDeps, emit: EmitFn): Promise<BuildResult> {
  const { finalPlan, prompt, questions, qAnswers } = input
  const { callClaude, callClaudeAgentic, captureScreenshot } = deps

  // local helpers mirroring the component's addLog/addChat/setAgentStatus
  const addLog = (msg: string, type = 'info') => emit({ type: 'log', msg, level: type })
  const addChat = (html: string) => emit({ type: 'chat', html })
  const setAgent = (agent: string, status: 'pending' | 'working' | 'done' | 'failed', note?: string) =>
    emit({ type: 'agentStatus', agent, status, note })

  const answers = questions.map((q: any, i: number) => `${q.q}: ${qAnswers[i] || q.options[0]}`).join(', ')
  const needsAuth = promptRequiresAuth(prompt, answers)

  // ── v9: Load JARVIS memory — every prior lesson informs this build ──
  const lessons = await loadJarvisLessons(input.jarvisId, 30)
  const lessonsPrompt = formatLessonsForPrompt(lessons)
  if (lessons.length > 0) {
    addLog(`🧠 JARVIS memory: ${lessons.length} lesson${lessons.length === 1 ? '' : 's'} loaded into agent prompts.`, 'ok')
    addChat(`🧠 <strong>JARVIS is using ${lessons.length} learned lessons</strong> from previous builds to avoid known mistakes.`)
  } else {
    addLog(`🧠 JARVIS memory: no lessons yet (run supabase-schema-v9 migration to enable).`, 'warn')
  }

  // Build the shared context every agent reads from
  const baseCtx: AgentContext = {
    jarvisName: input.jarvisName,
    industry: input.industry,
    proposal: finalPlan,
    brandName: input.brandName || undefined,
    brandColour: input.brandColour || undefined,
    attachments: input.attachments.map(a => ({ name: a.name, type: a.type })),
    lessons: lessonsPrompt,
  }

  // ── AGENTS 1+2: ARCHITECT + DESIGNER (in parallel — v9.6 speed-1) ──────────
  // Designer is decoupled from Architect output; both run simultaneously.
  // Saves 15-30s per build by overlapping their Anthropic round-trips.
  setAgent('architect', 'working')
  setAgent('designer', 'working')
  addLog(`${ARCHITECT.emoji} ${ARCHITECT.name}: ${ARCHITECT.description}... (running in parallel with ${DESIGNER.name})`, 'build')
  addChat(`${ARCHITECT.emoji} <strong>${ARCHITECT.name}</strong> + ${DESIGNER.emoji} <strong>${DESIGNER.name}</strong> are working in parallel — Architect plans the structure while Designer defines the visual system.`)

  let designSpec: any = null
  let designSystem: any = null

  // Run both agent calls in parallel
  const [archResult, designResult] = await Promise.allSettled([
    callClaude(ARCHITECT.buildSystemPrompt(baseCtx), ARCHITECT.buildUserMessage(baseCtx), ARCHITECT.maxTokens, false, ARCHITECT.model),
    callClaude(DESIGNER.buildSystemPrompt(baseCtx), DESIGNER.buildUserMessage(baseCtx), DESIGNER.maxTokens, false, DESIGNER.model),
  ])

  // Process Architect result
  if (archResult.status === 'fulfilled') {
    try {
      designSpec = parseAgentOutput(ARCHITECT, archResult.value)
      const componentCount = designSpec?.components?.length || 0
      const tableCount = designSpec?.data_model?.length || 0
      const moduleCount = designSpec?.build_modules?.length || 0
      setAgent('architect', 'done', `${componentCount} screens · ${moduleCount} modules`)
      addLog(`${ARCHITECT.emoji} Architect: ${componentCount} screens · ${tableCount} tables · ${designSpec?.flows?.length || 0} flows · ${moduleCount} build modules`, 'ok')
      let archMsg = `✓ <strong>Architect done.</strong> Spec: ${componentCount} screens, ${tableCount} tables, ${designSpec?.flows?.length || 0} flows.`
      if (moduleCount > 0) {
        const moduleList = designSpec.build_modules.map((m: any, i: number) => `&nbsp;&nbsp;${i + 1}. <strong style="color:#00e5b0">${m.name}</strong> — <span style="color:#a8a9b3">${(m.purpose || '').slice(0, 90)}${(m.purpose || '').length > 90 ? '…' : ''}</span>`).join('<br>')
        archMsg += `<br><br><strong style="color:#7c5cff">📦 Build plan — ${moduleCount} modules</strong><br>${moduleList}`
      }
      addChat(archMsg)
    } catch (err: any) {
      setAgent('architect', 'failed', err.message)
      addLog(`${ARCHITECT.emoji} Architect parse failed: ${err.message}`, 'err')
      designSpec = { components: finalPlan.screens || [], data_model: finalPlan.data_model || [], flows: finalPlan.user_flows || [], edge_cases: [], design_principles: [] }
    }
  } else {
    setAgent('architect', 'failed', archResult.reason?.message)
    addLog(`${ARCHITECT.emoji} Architect failed: ${archResult.reason?.message}`, 'err')
    addChat(`⚠️ Architect failed: ${archResult.reason?.message}. Falling back to direct build with proposal only.`)
    designSpec = { components: finalPlan.screens || [], data_model: finalPlan.data_model || [], flows: finalPlan.user_flows || [], edge_cases: [], design_principles: [] }
  }

  // Process Designer result
  if (designResult.status === 'fulfilled') {
    try {
      designSystem = parseAgentOutput(DESIGNER, designResult.value)
      const paletteCount = Object.keys(designSystem?.color_palette || {}).length
      const componentCount2 = Object.keys(designSystem?.components || {}).length
      setAgent('designer', 'done', `${paletteCount} colors · ${componentCount2} component patterns`)
      addLog(`${DESIGNER.emoji} Designer: ${paletteCount} colors · ${componentCount2} patterns · vibe: "${(designSystem?.vibe || '').slice(0, 60)}"`, 'ok')
      addChat(`✓ <strong>Designer done.</strong> Vibe: <em>${designSystem?.vibe || 'clean & professional'}</em>. ${paletteCount} brand colours + ${componentCount2} component patterns.`)
    } catch (err: any) {
      setAgent('designer', 'failed', err.message)
      addLog(`${DESIGNER.emoji} Designer parse failed: ${err.message}`, 'err')
      designSystem = null
    }
  } else {
    setAgent('designer', 'failed', designResult.reason?.message)
    addLog(`${DESIGNER.emoji} Designer failed: ${designResult.reason?.message}`, 'err')
    designSystem = null
  }

  // ── AGENT 3: BUILDER — v9.2 MODULAR tool-using agent loop ──
  // If Architect produced build_modules: loop over them, each is its own agent run
  // that appends to the growing state.html. Otherwise: single agent run (legacy).
  setAgent('builder', 'working', 'Starting...')
  addLog(`${BUILDER.emoji} ${BUILDER.name}: starting agentic build loop...`, 'build')

  const builderCtx: AgentContext = { ...baseCtx, designSpec, designSystem }
  const friendly: Record<string, string> = {
    write_full_html: 'writing initial HTML',
    audit_build: 'auditing the build',
    add_function_to_script: 'adding a missing function',
    patch_html: 'patching the HTML',
    append_html: 'appending HTML',
    get_current_html: 'reviewing current state',
    finalize: 'finalizing',
  }

  const buildModules = Array.isArray(designSpec?.build_modules) ? designSpec.build_modules : []
  // v9.7 speed: skip modular path for SIMPLE apps — single Builder run is much faster
  // and modular overhead doesn't pay off until 5+ real features.
  const complexityLower = String(finalPlan?.complexity || '').toLowerCase()
  const featureCount = (finalPlan?.features_mvp || finalPlan?.features || []).length
  const isSimpleApp = (complexityLower === 'simple' || complexityLower === 'low') && featureCount <= 6 && buildModules.length <= 4
  const useModular = !isSimpleApp && buildModules.length > 0
  if (isSimpleApp) {
    addLog(`Simple app detected (${complexityLower}, ${featureCount} features) — using direct Builder run for speed.`, 'info')
  }
  let accumulatedHtml = ''
  let totalIterations = 0
  let totalToolCalls = 0

  if (useModular) {
    // ── MODULAR EXECUTION ──
    addChat(`${BUILDER.emoji} <strong>${BUILDER.name}</strong> is building module-by-module across ${buildModules.length} modules. Each module appends to the growing app — no monolithic write.`)
    for (let mi = 0; mi < buildModules.length; mi++) {
      const mod = buildModules[mi]
      const moduleNum = mi + 1
      setAgent('builder', 'working', `Module ${moduleNum}/${buildModules.length}: ${mod.name}`)
      addLog(`${BUILDER.emoji} → module ${moduleNum}/${buildModules.length}: ${mod.name}`, 'build')
      addChat(`📦 <strong>Module ${moduleNum}/${buildModules.length}: ${mod.name}</strong> — ${(mod.purpose || '').slice(0, 120)}${(mod.purpose || '').length > 120 ? '…' : ''}`)
      // v9.6 speed-2: foundation + polish modules run on Haiku (much faster, plenty good for skeleton/refinement)
      const isSimpleModule = /^(foundation|polish|polish_refinement|skeleton|setup)$/i.test(mod.id || '') || /foundation|polish|skeleton|refinement/i.test(mod.name || '')
      const modState = await runBuilderAgent({
        ctx: builderCtx,
        needsAuth,
        callClaudeAgentic,
        maxIterations: 7, // v9.6 speed-3: was 12. Most modules complete in 3-5 iters.
        initialHtml: accumulatedHtml,
        moduleSpec: { id: mod.id, name: mod.name, purpose: mod.purpose, index: moduleNum, total: buildModules.length, deps: mod.deps },
        modelOverride: isSimpleModule ? 'claude-haiku-4-5-20251001' : undefined,
        onProgress: e => {
          if (e.toolName) {
            const verb = friendly[e.toolName] || e.toolName
            addLog(`${BUILDER.emoji}   m${moduleNum} iter ${e.iteration}: ${verb}`, 'info')
          }
        },
      })
      accumulatedHtml = modState.html
      totalIterations += modState.iterations
      totalToolCalls += modState.toolCalls?.length || 0
      addLog(`${BUILDER.emoji}   ✓ module ${moduleNum} done (${modState.iterations} iters, html now ${(accumulatedHtml.length / 4).toFixed(0)} tokens)`, 'ok')
    }
    addLog(`${BUILDER.emoji} All ${buildModules.length} modules complete. Total ${totalIterations} iterations across ${totalToolCalls} tool calls.`, 'ok')
    addChat(`✓ <strong>All ${buildModules.length} modules built.</strong> Final size: ~${(accumulatedHtml.length / 4).toFixed(0)} tokens. Now running integration pass to wire modules together.`)

    // ── v9.4: FINAL INTEGRATION PASS ──
    // Modules built independently. Now run a Builder pass on the FULL union
    // with moduleMode=false (strict audit gate) to find + fix cross-module bugs:
    // undefined functions referenced across modules, broken init flow, missing
    // showOnly() routes between screens, etc.
    setAgent('builder', 'working', 'Integration pass: auditing & fixing cross-module bugs')
    addLog(`${BUILDER.emoji} Integration pass — auditing the assembled app & fixing cross-module bugs...`, 'build')
    try {
      const integrationState = await runBuilderAgent({
        ctx: builderCtx,
        needsAuth,
        callClaudeAgentic,
        maxIterations: 12,
        initialHtml: accumulatedHtml,
        // No moduleSpec → full-app mode, audit_build is a hard gate before finalize
        onProgress: e => {
          if (e.toolName) {
            const verb = friendly[e.toolName] || e.toolName
            addLog(`${BUILDER.emoji}   integ iter ${e.iteration}: ${verb}`, 'info')
          }
        },
      })
      accumulatedHtml = integrationState.html
      totalIterations += integrationState.iterations
      totalToolCalls += integrationState.toolCalls?.length || 0
      addLog(`${BUILDER.emoji} Integration pass done. ${integrationState.iterations} iters, ${integrationState.finalized ? 'audit clean' : 'shipped with warnings'}.`, integrationState.finalized ? 'ok' : 'warn')
      addChat(`✓ <strong>Integration pass complete.</strong> ${integrationState.finalized ? 'Audit clean — modules wired together correctly.' : 'Some warnings remain — QA will flag them.'} Final size: ~${(accumulatedHtml.length / 4).toFixed(0)} tokens. QA Engineer is up next.`)
    } catch (err: any) {
      addLog(`${BUILDER.emoji} Integration pass error: ${err.message}. Shipping module-only output.`, 'warn')
      addChat(`⚠️ Integration pass failed: ${err.message}. App may have cross-module bugs — QA will flag them.`)
    }
  } else {
    // ── LEGACY SINGLE-RUN EXECUTION ──
    addChat(`${BUILDER.emoji} <strong>${BUILDER.name}</strong> is writing the code, then auditing and patching it iteratively...`)
    const builderState = await runBuilderAgent({
      ctx: builderCtx,
      needsAuth,
      callClaudeAgentic,
      maxIterations: 25,
      onProgress: e => {
        if (e.toolName) {
          const verb = friendly[e.toolName] || e.toolName
          addLog(`${BUILDER.emoji} iter ${e.iteration}: ${verb}`, 'build')
          setAgent('builder', 'working', `iter ${e.iteration}: ${verb}`)
        } else if (e.thinking) {
          addLog(`${BUILDER.emoji} thinking: ${e.thinking.slice(0, 90)}`, 'info')
        }
      },
    })
    accumulatedHtml = builderState.html
    totalIterations = builderState.iterations
    totalToolCalls = builderState.toolCalls?.length || 0
  }

  // For backward compat with the rest of the function, expose a "builderState"-like object
  const builderState = {
    html: accumulatedHtml,
    iterations: totalIterations,
    toolCalls: Array(totalToolCalls).fill({} as any),
    finalized: true,
    finalSummary: '',
  }
  let code = builderState.html
  let qaReport: any = null
  addLog(`${BUILDER.emoji} Builder finalized after ${builderState.iterations} iterations · ${builderState.toolCalls.length} tool calls · ${(code.length / 4).toFixed(0)} tokens`, 'ok')

  // After the agent loop, run QA agent once for an independent audit
  // (the agent's internal audit_build is regex-based; QA is semantic)
  const MAX_BUILD_PASSES = 1 // agent already self-iterated; this is just the QA gate
  for (let pass = 1; pass <= MAX_BUILD_PASSES; pass++) {
    // ── HARD GATE 1: regex validator — catches localStorage abuse + demo creds ──
    // This runs BEFORE the AI QA agent so we never let bad code slip past.
    const fastVal = validateBuild(code, needsAuth)
    const fastFails: string[] = fastVal.errors.map(e => `[Regex] ${e}`)

    if (pass === 1) {
      setAgent('builder', 'done', `${(code.length / 4).toFixed(0)} tokens`)
      setAgent('qa', 'working')
      addLog(`${QA.emoji} ${QA.name}: ${QA.description}...`, 'build')
      addChat(`✓ <strong>Builder pass 1 done.</strong> ${QA.emoji} <strong>${QA.name}</strong> is auditing now...`)
    }

    // ── AGENT 4: QA ENGINEER (semantic + visual audit — v9.7 Phase 4) ──────
    // Capture rendered screenshot, pass to QA as Claude vision input alongside code.
    // QA reviews BOTH structure and visual aesthetics.
    try {
      const qaCtx: AgentContext = { ...baseCtx, designSpec, builtCode: code }
      addLog(`${QA.emoji} Capturing app screenshot for vision-guided audit...`, 'info')
      const screenshot = await captureScreenshot(code)
      if (screenshot) {
        addLog(`${QA.emoji} Screenshot captured (${(screenshot.length / 1024).toFixed(0)}KB). Running vision QA...`, 'ok')
        addChat(`📸 <strong>Visual snapshot captured.</strong> QA is reviewing the rendered UI alongside the code...`)
      } else {
        addLog(`${QA.emoji} Screenshot capture failed. Falling back to text-only QA.`, 'warn')
      }
      const visualNote = screenshot
        ? '\n\nIMAGE ABOVE: rendered screenshot of the app at 1280×800. Audit VISUALLY too — flag: low-contrast text, broken layout, cramped spacing, missing visual hierarchy, illegible buttons, mobile-unfriendly elements, generic-looking UI that doesn\'t match the proposal\'s vibe. Add visual issues to "failed" or "warnings" with specific descriptions.'
        : ''
      const qaRaw = await callClaude(
        QA.buildSystemPrompt(qaCtx),
        QA.buildUserMessage(qaCtx) + visualNote,
        QA.maxTokens,
        false,
        QA.model,
        screenshot || undefined
      )
      qaReport = parseAgentOutput(QA, qaRaw)
    } catch (err: any) {
      addLog(`QA agent error: ${err.message}. Falling back to regex check only.`, 'warn')
      qaReport = { score: fastVal.valid ? 75 : 30, certified: fastVal.valid, passed: [], failed: fastFails, warnings: ['QA agent errored'], critical_fixes: fastFails }
    }

    // ── COMBINE: regex fails + QA fails. Regex is the truth source for the forbidden patterns. ──
    if (fastFails.length > 0) {
      // Even if QA was happy, regex caught a violation — DECERTIFY and force a retry.
      // Pair each fail with relevant fix guidance based on the error type.
      qaReport.certified = false
      qaReport.score = Math.min(qaReport.score || 30, 35)
      const enriched = fastFails.map(f => {
        const lower = f.toLowerCase()
        if (lower.includes('localstorage') || lower.includes('self-rolled') || lower.includes('demo cred')) {
          return `${f}\n  → FIX: replace this with the Jarvis API. Use Jarvis.signup, Jarvis.login, Jarvis.saveData, Jarvis.loadData. The ONLY localStorage allowed is 'theme', 'darkMode', and any key prefixed 'jarvis_' (the library's own session keys).`
        }
        if (lower.includes('undefined onclick') || lower.includes('referenceerror')) {
          return `${f}\n  → FIX: For EACH function name listed, add a corresponding "function NAME() { ... }" definition in the <script>. Example: if HTML has onclick="showSignup()", you must add "function showSignup() { showOnly('screen-signup') }" to the script. Trace every onclick/onsubmit/onchange in the HTML and confirm each function exists. NO function reference may be left undefined.`
        }
        if (lower.includes('jarvis.signup') || lower.includes('jarvis.login')) {
          return `${f}\n  → FIX: Wire your signup form button onclick to call "await Jarvis.signup(email, pw, name, role)" wrapped in try/catch. Wire login form button onclick to "await Jarvis.login(email, pw)". On success, route to dashboard. On error, show toast.`
        }
        return `${f}\n  → FIX: Address this issue per the Builder system prompt rules.`
      })
      qaReport.critical_fixes = [...enriched, ...(qaReport.critical_fixes || [])]
      addLog(`Hard gate FAILED on pass ${pass}: ${fastFails.join('; ')}`, 'err')
    }

    const score = qaReport.score || 0
    const certified = !!qaReport.certified
    const criticalCount = (qaReport.critical_fixes || []).length
    const blocked = !certified && criticalCount > 0 && pass < MAX_BUILD_PASSES

    if (!blocked) {
      // Either certified, or out of retries — finalize
      setAgent('qa', 'done', `Score: ${score}/100${certified ? ' · Certified' : ' · Issues remain'}`)
      if (pass > 1) {
        addLog(`${BUILDER.emoji} Builder pass ${pass} complete (after QA fixes).`, 'ok')
        setAgent('builder', 'done', `${pass} passes`)
      }
      if (!certified && criticalCount > 0) {
        addChat(`⚠️ <strong>QA score ${score}/100 after ${pass} build pass${pass === 1 ? '' : 'es'}.</strong> Issues remain — review Preview and use chat feedback to refine. Issues:<br>${(qaReport.critical_fixes || []).slice(0, 3).map((f: string) => '• ' + f).join('<br>')}`)
      } else {
        addChat(`✅ <strong>QA certified.</strong> Score: ${score}/100. ${(qaReport.passed || []).length} checks passed. Build complete!`)
      }
      break
    }
    // Force another builder pass with the failure list
    addLog(`Builder needs another pass — ${criticalCount} critical issue(s) to fix.`, 'warn')
    setAgent('builder', 'working', `Pass ${pass + 1} (fixing ${criticalCount} issue${criticalCount === 1 ? '' : 's'})`)
    addChat(`🔄 <strong>QA score ${score}/100.</strong> ${BUILDER.name} is fixing ${criticalCount} issue${criticalCount === 1 ? '' : 's'}: <em>${qaReport.critical_fixes[0]}</em>`)
  }

  return { code, qaReport, iterations: totalIterations, toolCallCount: totalToolCalls }
}
