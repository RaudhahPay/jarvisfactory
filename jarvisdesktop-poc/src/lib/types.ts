// Shared TS types between frontend and Rust backend.
// Keep in sync with src-tauri/src/*.rs structs.

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  /** Human-readable text shown in the bubble. */
  text: string
  /** Progress events that happened while this assistant message was generating. */
  events?: ProgressEvent[]
  /** Raw tool calls (hidden by default; visible when "show details" toggled on). */
  toolCalls?: ToolCall[]
  createdAt: number
}

export type ProgressEvent =
  | { kind: 'thinking'; text: string }
  | { kind: 'writing'; file: string }
  | { kind: 'reading'; file: string }
  | { kind: 'running'; command: string }
  | { kind: 'memorized'; fact: string }
  | { kind: 'done'; summary: string }

export interface ToolCall {
  name: string
  input: Record<string, unknown>
  result: string
  ok: boolean
}

export interface Project {
  id: string
  name: string
  /** Absolute path on disk, e.g. /Users/you/JarvisDesktop/Projects/markdown-notes */
  path: string
  /** Last user prompt for this project. */
  lastPrompt?: string
  createdAt: number
  updatedAt: number
}

export interface MemoryFact {
  key: string
  value: string
  /** Where the fact came from — user-stated vs JARVIS-inferred. */
  source: 'user' | 'inferred'
  createdAt: number
}

export interface UsageStats {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface AgentRunSummary {
  finalMessage: string
  usage: UsageStats
  projectPath?: string
  openedInBrowser?: boolean
}
