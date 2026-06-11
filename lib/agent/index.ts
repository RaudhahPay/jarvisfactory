// Agent runner factory — the single place product code resolves an AgentRunner.
// Real ClaudeAgentRunner (Agent SDK) when ANTHROPIC_API_KEY is set; otherwise the
// scripted StubAgentRunner (CI / local-without-key / forced via AGENT_RUNNER=stub).
// Async + dynamic import so the Node-only Agent SDK never loads on the stub path.

import type { AgentRunner } from './types'

let singleton: AgentRunner | null = null

export async function getAgentRunner(): Promise<AgentRunner> {
  if (singleton) return singleton
  const useReal = !!process.env.ANTHROPIC_API_KEY && process.env.AGENT_RUNNER !== 'stub'
  if (useReal) {
    const { ClaudeAgentRunner } = await import('./claude-runner')
    singleton = new ClaudeAgentRunner()
  } else {
    const { StubAgentRunner } = await import('./stub-runner')
    singleton = new StubAgentRunner()
  }
  return singleton
}

export type { AgentRunner, AgentSession, AgentEvent } from './types'
