// Agent runner factory — the single place product code resolves an AgentRunner.
// Today: stub. Next step swaps in ClaudeAgentRunner (real Claude Agent SDK, backed
// by the SandboxHandle, ANTHROPIC_API_KEY billing, Sonnet-default model routing).

import type { AgentRunner } from './types'
import { StubAgentRunner } from './stub-runner'

let singleton: AgentRunner | null = null

export function getAgentRunner(): AgentRunner {
  if (!singleton) singleton = new StubAgentRunner()
  return singleton
}

export type { AgentRunner, AgentSession, AgentEvent } from './types'
