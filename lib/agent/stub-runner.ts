// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: StubAgentRunner
// ============================================================
// A scripted AgentRunner so the orchestrator + streaming + build_jobs persistence
// can be exercised end-to-end BEFORE the real Claude Agent SDK is wired in. It emits
// a realistic AgentEvent sequence AND actually mutates the sandbox (writeFiles), so
// the preview/files surfaces have real state to show. Swapped for lib/agent/
// claude-runner.ts (ANTHROPIC_API_KEY, model routing, real tool loop) at the next step.
// ============================================================

import type { SandboxHandle } from '../sandbox/types'
import type { AgentRunner, AgentSession, AgentRunOptions, AgentEvent } from './types'

const STUB_INDEX_HTML = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Stub build</title></head>
  <body>
    <main id="app"><h1>Built by the stub agent</h1></main>
    <script src="scripts/app.js"></script>
  </body>
</html>
`

const STUB_APP_JS = `console.log('stub app booted')\n`

// Drive one scripted "turn": think → narrate → write files into the sandbox →
// start a dev server → report usage → done. Every step streams via onEvent.
async function runScriptedTurn(sandbox: SandboxHandle, prompt: string, onEvent: (e: AgentEvent) => void): Promise<void> {
  onEvent({ type: 'thinking', text: `Planning a build for: "${prompt.slice(0, 80)}"` })
  onEvent({ type: 'text', text: 'Scaffolding the project files…' })

  onEvent({ type: 'tool_use', tool: 'write_file', input: { path: 'index.html' } })
  await sandbox.writeFiles([{ path: 'index.html', content: STUB_INDEX_HTML }])
  onEvent({ type: 'tool_result', tool: 'write_file', ok: true, summary: 'wrote index.html' })
  onEvent({ type: 'file_edit', path: 'index.html', action: 'create' })

  onEvent({ type: 'tool_use', tool: 'write_file', input: { path: 'scripts/app.js' } })
  await sandbox.writeFiles([{ path: 'scripts/app.js', content: STUB_APP_JS }])
  onEvent({ type: 'tool_result', tool: 'write_file', ok: true, summary: 'wrote scripts/app.js' })
  onEvent({ type: 'file_edit', path: 'scripts/app.js', action: 'create' })

  onEvent({ type: 'exec', command: 'npm run dev' })
  await sandbox.startDevServer('npm run dev', 3000)

  // Synthetic metering — the real runner emits one of these per model call.
  onEvent({ type: 'usage', inputTokens: 1200, outputTokens: 800, model: 'claude-sonnet-4-6', costUsd: 0.0156 })
  onEvent({ type: 'text', text: 'Done — preview is live.' })
  onEvent({ type: 'done', reason: 'end_turn' })
}

class StubAgentSession implements AgentSession {
  readonly projectId: string
  readonly sandboxId: string
  private sandbox: SandboxHandle
  private aborted = false

  constructor(sandbox: SandboxHandle, projectId: string) {
    this.sandbox = sandbox
    this.projectId = projectId
    this.sandboxId = sandbox.id
  }

  async send(prompt: string, onEvent: (e: AgentEvent) => void): Promise<void> {
    if (this.aborted) {
      onEvent({ type: 'done', reason: 'interrupted' })
      return
    }
    await runScriptedTurn(this.sandbox, prompt, onEvent)
  }

  interrupt(): void {
    this.aborted = true
  }

  async close(): Promise<void> {
    this.aborted = true
  }
}

export class StubAgentRunner implements AgentRunner {
  async start(sandbox: SandboxHandle, opts: AgentRunOptions): Promise<AgentSession> {
    const session = new StubAgentSession(sandbox, opts.projectId)
    // The first turn runs the initial prompt and streams via opts.onEvent.
    await session.send(opts.prompt, opts.onEvent)
    return session
  }
}
