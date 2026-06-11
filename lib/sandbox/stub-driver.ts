// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: StubSandboxDriver
// ============================================================
// An in-memory SandboxDriver so the orchestrator + AgentRunner flow can be built
// and tested end-to-end BEFORE the Cloudflare Sandbox runtime is wired up. No real
// compute: files live in a Map, exec is a no-op echo, preview URL is synthetic.
// Swapped for lib/sandbox/cloudflare-driver.ts once Workers/Containers are ready.
// ============================================================

import type { SandboxDriver, SandboxHandle, SandboxFile, SandboxStatus, SandboxSnapshot, CreateSandboxOptions, ExecOptions, ExecResult, DevServer } from './types'

function uuid(): string {
  // crypto.randomUUID exists in Node 18+ and the browser/edge runtimes we target.
  return (globalThis.crypto as Crypto).randomUUID()
}

class StubSandboxHandle implements SandboxHandle {
  readonly id: string
  readonly projectId: string
  private files = new Map<string, string>()
  private state: SandboxStatus = 'running'

  constructor(id: string, projectId: string, initial?: SandboxFile[]) {
    this.id = id
    this.projectId = projectId
    for (const f of initial || []) this.files.set(f.path, f.content)
  }

  async status(): Promise<SandboxStatus> {
    return this.state
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    for (const f of files) this.files.set(f.path, f.content)
  }

  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) throw new Error(`stub-sandbox: file not found: ${path}`)
    return this.files.get(path)!
  }

  async listFiles(dir?: string): Promise<string[]> {
    const all = Array.from(this.files.keys())
    return dir ? all.filter(p => p.startsWith(dir.replace(/\/?$/, '/'))) : all
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const out = `(stub) $ ${command}\n`
    opts?.onStdout?.(out)
    return { exitCode: 0, stdout: out, stderr: '' }
  }

  async startDevServer(command: string, port: number): Promise<DevServer> {
    const previewUrl = `https://stub-${this.id.slice(0, 8)}-${port}.preview.local`
    return { port, previewUrl, stop: async () => {} }
  }

  async getPreviewUrl(port: number): Promise<string> {
    return `https://stub-${this.id.slice(0, 8)}-${port}.preview.local`
  }

  async snapshot(): Promise<SandboxSnapshot> {
    return {
      projectId: this.projectId,
      files: Array.from(this.files.entries()).map(([path, content]) => ({
        path,
        content,
      })),
      createdAt: '', // caller stamps the time (Date.* is intentionally not used here)
    }
  }

  async suspend(): Promise<void> {
    this.state = 'suspended'
  }

  async destroy(): Promise<void> {
    this.state = 'destroyed'
    this.files.clear()
  }
}

export class StubSandboxDriver implements SandboxDriver {
  readonly provider = 'stub'
  // Process-local registry so `get()` can reconnect within one server instance.
  private live = new Map<string, StubSandboxHandle>()

  async create(opts: CreateSandboxOptions): Promise<SandboxHandle> {
    const handle = new StubSandboxHandle(uuid(), opts.projectId, opts.files)
    this.live.set(handle.id, handle)
    return handle
  }

  async resume(snapshot: SandboxSnapshot, opts?: Partial<CreateSandboxOptions>): Promise<SandboxHandle> {
    const handle = new StubSandboxHandle(uuid(), opts?.projectId || snapshot.projectId, snapshot.files)
    this.live.set(handle.id, handle)
    return handle
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    return this.live.get(sandboxId) ?? null
  }
}
