// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: ClaudeAgentRunner (real Agent SDK)
// ============================================================
// Drives @anthropic-ai/claude-agent-sdk's query() loop. All filesystem/exec the
// agent performs is redirected to the SandboxHandle via custom in-process MCP tools;
// the built-in Write/Edit/Bash/Read tools are DISALLOWED so nothing touches the host.
// Auth is ANTHROPIC_API_KEY (prepaid API credits) — never a subscription/OAuth login.
//
// Runtime: full Node only (the SDK bundles native binaries; it does NOT run on
// Cloudflare Workers/edge). So this runner lives in a Node host (the /api/build route
// today; a Node container / Cloudflare Containers later) — separate from the sandbox.
//
// Architecture note vs CLAUDE.md §5 ("agent runs inside the sandbox"): the agent LOOP
// runs in our Node process, but every file write + command executes INSIDE the sandbox
// through these tools — the orchestrator never runs user code on the host. Running the
// loop itself inside the container is a later option once Containers are wired.
// ============================================================

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SandboxHandle } from '../sandbox/types'
import type { AgentRunner, AgentSession, AgentRunOptions, AgentEvent } from './types'

const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Only our sandbox-backed tools are allowed; every built-in FS/exec tool is denied.
const SANDBOX_TOOLS = ['mcp__sandbox__write_file', 'mcp__sandbox__read_file', 'mcp__sandbox__exec', 'mcp__sandbox__list_files']
const BLOCKED_BUILTINS = ['Write', 'Edit', 'MultiEdit', 'Bash', 'Read', 'Glob', 'Grep', 'NotebookEdit']

// Build the in-process MCP server whose tools proxy to the sandbox. The handlers
// emit tool_result / file_edit / exec events so the UI + metering see real activity.
function buildSandboxTools(sandbox: SandboxHandle, emit: (e: AgentEvent) => void) {
  const writeFile = tool(
    'write_file',
    'Create or overwrite a file in the project sandbox. path is relative (e.g. "app/page.tsx").',
    { path: z.string(), content: z.string() },
    async (args: { path: string; content: string }) => {
      const existed = await sandbox
        .listFiles()
        .then(fs => fs.includes(args.path))
        .catch(() => false)
      await sandbox.writeFiles([{ path: args.path, content: args.content }])
      emit({ type: 'file_edit', path: args.path, action: existed ? 'edit' : 'create' })
      emit({ type: 'tool_result', tool: 'write_file', ok: true, summary: `wrote ${args.path} (${args.content.length} chars)` })
      return { content: [{ type: 'text', text: `Wrote ${args.path}.` }] }
    }
  )

  const readFile = tool('read_file', 'Read a file from the project sandbox.', { path: z.string() }, async (args: { path: string }) => {
    try {
      const text = await sandbox.readFile(args.path)
      emit({ type: 'tool_result', tool: 'read_file', ok: true, summary: `read ${args.path}` })
      return { content: [{ type: 'text', text }] }
    } catch (err: any) {
      emit({ type: 'tool_result', tool: 'read_file', ok: false, summary: err?.message || 'read failed' })
      return { content: [{ type: 'text', text: `Error: ${err?.message || err}` }], isError: true }
    }
  })

  const execCmd = tool('exec', 'Run a shell command inside the project sandbox (installs, builds, scripts).', { command: z.string() }, async (args: { command: string }) => {
    emit({ type: 'exec', command: args.command })
    const r = await sandbox.exec(args.command)
    emit({ type: 'tool_result', tool: 'exec', ok: r.exitCode === 0, summary: `exit ${r.exitCode}` })
    const out = `exit ${r.exitCode}\n${r.stdout}${r.stderr ? '\n' + r.stderr : ''}`
    return { content: [{ type: 'text', text: out }], isError: r.exitCode !== 0 }
  })

  const listFiles = tool('list_files', 'List file paths in the project sandbox (optionally under a directory).', { dir: z.string().optional() }, async (args: { dir?: string }) => {
    const files = await sandbox.listFiles(args.dir)
    return { content: [{ type: 'text', text: files.join('\n') || '(empty)' }] }
  })

  return createSdkMcpServer({ name: 'sandbox', version: '1.0.0', tools: [writeFile, readFile, execCmd, listFiles] })
}

// Run one query() turn, mapping SDK messages → AgentEvents and surfacing usage.
async function runTurn(sandbox: SandboxHandle, prompt: string, model: string, emit: (e: AgentEvent) => void): Promise<void> {
  const sandboxServer = buildSandboxTools(sandbox, emit)
  // Isolated cwd so the SDK never reads THIS repo's CLAUDE.md/settings as project context.
  const cwd = await mkdtemp(join(tmpdir(), 'jf-agent-'))

  const stream = query({
    prompt,
    options: {
      model,
      cwd,
      mcpServers: { sandbox: sandboxServer },
      allowedTools: SANDBOX_TOOLS,
      disallowedTools: BLOCKED_BUILTINS,
      permissionMode: 'bypassPermissions', // only sandbox tools are allowed; built-ins denied above
      maxTurns: 40,
      settingSources: [], // do not load host filesystem settings/CLAUDE.md
    } as any,
  })

  for await (const message of stream as any) {
    if (message.type === 'assistant') {
      for (const block of message.message?.content || []) {
        if (block.type === 'text' && block.text) emit({ type: 'text', text: block.text })
        else if (block.type === 'thinking' && block.thinking) emit({ type: 'thinking', text: block.thinking })
        else if (block.type === 'tool_use') emit({ type: 'tool_use', tool: block.name, input: block.input })
      }
    } else if (message.type === 'result') {
      const u = message.usage || {}
      emit({
        type: 'usage',
        inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        outputTokens: u.output_tokens || 0,
        model,
        costUsd: message.total_cost_usd || 0,
      })
      const reason = message.subtype === 'success' ? 'end_turn' : message.subtype === 'truncated' ? 'max_tokens' : 'stop'
      emit({ type: 'done', reason })
    }
  }
}

class ClaudeAgentSession implements AgentSession {
  readonly projectId: string
  readonly sandboxId: string
  private sandbox: SandboxHandle
  private model: string
  private closed = false

  constructor(sandbox: SandboxHandle, projectId: string, model: string) {
    this.sandbox = sandbox
    this.projectId = projectId
    this.sandboxId = sandbox.id
    this.model = model
  }

  async send(prompt: string, onEvent: (e: AgentEvent) => void): Promise<void> {
    if (this.closed) {
      onEvent({ type: 'done', reason: 'interrupted' })
      return
    }
    try {
      await runTurn(this.sandbox, prompt, this.model, onEvent)
    } catch (err: any) {
      onEvent({ type: 'error', message: err?.message || 'Agent run failed' })
    }
  }

  // Single-turn for now; SDK session continuity (resume/session_id) is a later refinement.
  interrupt(): void {
    this.closed = true
  }
  async close(): Promise<void> {
    this.closed = true
  }
}

export class ClaudeAgentRunner implements AgentRunner {
  async start(sandbox: SandboxHandle, opts: AgentRunOptions): Promise<AgentSession> {
    const model = opts.model || DEFAULT_MODEL
    const session = new ClaudeAgentSession(sandbox, opts.projectId, model)
    await session.send(opts.prompt, opts.onEvent)
    return session
  }
}
