// ============================================================
// JARVISFACTORY v2 / Stage 4 — S2: AgentRunner (provider-agnostic)
// ============================================================
// One Claude Agent SDK session per project, executing INSIDE a SandboxHandle.
// This is the v2 engine that replaces the v1 browser-side build loop
// (lib/build-pipeline.ts — the temporary scaffold, deleted at S3 once this lands).
//
// Hard rules (CLAUDE.md §6/§7):
//   • Authenticate the Agent SDK with ANTHROPIC_API_KEY (prepaid API credits) —
//     NEVER a subscription/OAuth login. This is a multi-user product on API billing.
//   • The SDK's bash + file-edit tools are backed by the SandboxHandle, never the
//     host. The orchestrator process never runs user-generated code.
//   • Model routing for unit economics: default Sonnet 4.6; escalate to Opus 4.8
//     only for hard multi-file/architectural tasks. Route by difficulty.
//   • Meter EVERYTHING: every model call emits a 'usage' event → Supabase
//     {user_id, project_id, in/out tokens, model, cost_usd} (Layer 10). No un-metered call.
//   • Gate destructive/sensitive ops (deletes, deploys, installs, new-host network)
//     behind explicit policy — never auto-run rm -rf / key exfiltration / deploys.
//
// Types only — no runtime. The concrete runner (lib/agent/claude-runner.ts) is
// written after consulting the Claude Agent SDK docs.
// ============================================================

import type { SandboxHandle } from '../sandbox/types'

// Streamed to the chat UI as the agent works. Mirrors what the v1 pipeline emitted
// as addLog/addChat, but sourced from a real agent loop instead of a fixed script.
export type AgentEvent =
  | { type: 'thinking'; text: string } // extended-thinking trace (optional surface)
  | { type: 'text'; text: string } // assistant message chunk → chat bubble
  | { type: 'tool_use'; tool: string; input: any } // agent invoked a tool
  | { type: 'tool_result'; tool: string; ok: boolean; summary: string }
  | { type: 'file_edit'; path: string; action: 'create' | 'edit' | 'delete' } // drives the files pane
  | { type: 'exec'; command: string } // a shell command ran in the sandbox
  // Billing/metering signal — one per model call. MUST be persisted (Layer 10).
  | { type: 'usage'; inputTokens: number; outputTokens: number; model: string; costUsd: number }
  | { type: 'done'; reason: 'end_turn' | 'max_tokens' | 'stop' | 'interrupted' }
  | { type: 'error'; message: string }

export interface AgentRunOptions {
  projectId: string
  userId: string
  prompt: string
  // Optional explicit model override; otherwise the runner routes by task difficulty.
  model?: string
  onEvent: (e: AgentEvent) => void
  signal?: AbortSignal
}

// A live, resumable conversation bound to one project's sandbox.
export interface AgentSession {
  readonly projectId: string
  readonly sandboxId: string
  // Continue the conversation (the user typed a follow-up in chat).
  send(prompt: string, onEvent: (e: AgentEvent) => void): Promise<void>
  interrupt(): void // stop the current turn (user hit stop)
  close(): Promise<void> // end the session; sandbox lifecycle handled separately
}

export interface AgentRunner {
  // Open an Agent SDK session bound to a sandbox's filesystem and stream events.
  // Quota/cost pre-check (Layer 10) happens BEFORE this resolves — a session must
  // not start if the user is over their token/compute budget.
  start(sandbox: SandboxHandle, opts: AgentRunOptions): Promise<AgentSession>
}
