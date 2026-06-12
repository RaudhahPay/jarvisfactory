// ============================================================
// JARVISFACTORY v2 / Stage 4 — Layer-4: useBuildPipeline hook
// ============================================================
// The thin React adapter between the pure orchestrator (lib/build-pipeline.ts)
// and the Builder component's state. It maps each BuildEvent the pipeline emits
// onto the component's setters (setPhase / setAgentStatus / addLog / addChat /
// setTokens) — exactly the mapping that used to be inline setState calls.
//
// runBuild() simply forwards to runBuildPipeline with this dispatch. The component
// keeps ownership of the build timer and all post-build persistence (Supabase,
// injectBackend, recordBuildOutcome, …) — those read component state/refs directly,
// so moving them here would only add coupling without changing behavior.
// ============================================================

import { useCallback } from 'react'
import { runBuildPipeline } from '@/lib/build-pipeline'
import { INITIAL_AGENT_STATUS } from '@/lib/build-types'
import type { BuildEvent, BuildInput, BuildDeps, BuildResult, AgentStatusMap } from '@/lib/build-types'

export interface BuildPipelineUI {
  setPhase: (p: any) => void
  setAgentStatus: (u: AgentStatusMap | ((s: AgentStatusMap) => AgentStatusMap)) => void
  addLog: (msg: string, type?: string) => void
  addChat: (html: string) => void
  setTokens: (v: string) => void
}

export function useBuildPipeline(ui: BuildPipelineUI) {
  // Map a pipeline event onto the component's existing state setters. Each branch
  // reproduces the exact setState call the inline orchestration used to make.
  const dispatch = useCallback(
    (ev: BuildEvent) => {
      switch (ev.type) {
        case 'phase':
          ui.setPhase(ev.phase)
          return
        case 'log':
          ui.addLog(ev.msg, ev.level)
          return
        case 'chat':
          ui.addChat(ev.html)
          return
        case 'tokens':
          ui.setTokens(ev.value)
          return
        case 'agentStatus':
          ui.setAgentStatus(s => ({ ...s, [ev.agent]: { status: ev.status, note: ev.note } }))
          return
        case 'agentReset':
          ui.setAgentStatus({ ...INITIAL_AGENT_STATUS })
          return
        case 'agentFailWorking':
          ui.setAgentStatus(s => {
            const u: AgentStatusMap = { ...s }
            for (const k of Object.keys(u)) {
              if (u[k].status === 'working') u[k] = { status: 'failed', note: ev.note }
            }
            return u
          })
          return
        // 'qaReport' / 'builtCode' are returned in BuildResult and applied by the caller.
      }
    },
    [ui]
  )

  const runBuild = useCallback(
    (input: BuildInput, deps: BuildDeps): Promise<BuildResult> => runBuildPipeline(input, deps, dispatch),
    [dispatch]
  )

  return { dispatch, runBuild }
}
