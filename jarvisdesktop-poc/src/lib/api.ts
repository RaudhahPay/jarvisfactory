// Thin wrappers around Tauri's invoke() for the Rust backend commands.
// Keep command names in sync with src-tauri/src/lib.rs.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  AgentRunSummary,
  MemoryFact,
  Project,
  ProgressEvent,
} from './types'

// ── Setup / configuration ──
export async function isApiKeySet(): Promise<boolean> {
  return invoke<boolean>('is_api_key_set')
}
export async function saveApiKey(key: string): Promise<void> {
  return invoke('save_api_key', { key })
}

// ── Agent run (the main event) ──
// Frontend pre-generates the runId so it can subscribe BEFORE invoking the run —
// this avoids dropping the first few progress events on the floor.
export async function startAgentRun(runId: string, prompt: string, projectId?: string): Promise<void> {
  return invoke('start_agent_run', { runId, prompt, projectId })
}

export async function abortAgentRun(runId: string): Promise<void> {
  return invoke('abort_agent_run', { runId })
}

// Subscribe to streaming progress events for a given run.
// Returns an unlisten function — call it on cleanup.
export async function onAgentProgress(
  runId: string,
  handler: (event: ProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<ProgressEvent>(`agent:progress:${runId}`, (e) => handler(e.payload))
}

// Subscribe to the final result of a run.
export async function onAgentDone(
  runId: string,
  handler: (summary: AgentRunSummary) => void,
): Promise<UnlistenFn> {
  return listen<AgentRunSummary>(`agent:done:${runId}`, (e) => handler(e.payload))
}

// Subscribe to errors.
export async function onAgentError(
  runId: string,
  handler: (error: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(`agent:error:${runId}`, (e) => handler(e.payload))
}

// ── Projects ──
export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>('list_projects')
}
export async function getActiveProject(): Promise<Project | null> {
  return invoke<Project | null>('get_active_project')
}
export async function setActiveProject(id: string): Promise<void> {
  return invoke('set_active_project', { id })
}
export async function openProjectInBrowser(id: string): Promise<void> {
  return invoke('open_project_in_browser', { id })
}

// ── Memory ──
export async function listMemoryFacts(): Promise<MemoryFact[]> {
  return invoke<MemoryFact[]>('list_memory_facts')
}
export async function forgetMemoryFact(key: string): Promise<void> {
  return invoke('forget_memory_fact', { key })
}
