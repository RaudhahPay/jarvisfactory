// ============================================================
// JARVISFACTORY v2 / Stage 4 — S4: CloudflareSandboxDriver (Node side)
// ============================================================
// Implements SandboxDriver by calling the `sandbox-worker` bridge over HTTPS.
// WHY a bridge: @cloudflare/sandbox runs ONLY in the Workers runtime, but our agent
// runner runs in Node (the Agent SDK needs Node). So a thin Worker wraps the SDK
// behind HTTP endpoints (see sandbox-worker/), and this driver — which runs in the
// same Node process as the AgentRunner — calls those endpoints. The product depends
// only on the SandboxDriver interface, so this stays swappable.
//
// Config (env):
//   SANDBOX_PROVIDER=cloudflare     — select this driver in lib/sandbox/index.ts
//   SANDBOX_BRIDGE_URL=https://...  — deployed sandbox-worker URL
//   SANDBOX_BRIDGE_TOKEN=...        — shared secret; the worker rejects calls without it
//
// UNVERIFIED until the bridge is deployed (needs a Cloudflare Workers Paid plan with
// Containers + `wrangler deploy`). Typechecks here (transport is plain fetch).
// ============================================================

import type { SandboxDriver, SandboxHandle, SandboxFile, SandboxStatus, SandboxSnapshot, CreateSandboxOptions, ExecOptions, ExecResult, DevServer } from './types'

const baseUrl = () => (process.env.SANDBOX_BRIDGE_URL || '').replace(/\/$/, '')
const token = () => process.env.SANDBOX_BRIDGE_TOKEN || ''

async function call(path: string, body: any): Promise<any> {
  if (!baseUrl()) throw new Error('SANDBOX_BRIDGE_URL is not configured')
  const res = await fetch(baseUrl() + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error(json?.error || `sandbox bridge ${path} failed (${res.status})`)
  return json
}

// Derive a DNS/subdomain-safe sandbox id from the project id (preview URLs use it).
function sandboxIdFor(projectId: string): string {
  return ('proj-' + projectId)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 60)
}

class CloudflareSandboxHandle implements SandboxHandle {
  readonly id: string
  readonly projectId: string

  constructor(id: string, projectId: string) {
    this.id = id
    this.projectId = projectId
  }

  async status(): Promise<SandboxStatus> {
    const r = await call('/status', { id: this.id })
    return (r.status || 'running') as SandboxStatus
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    await call('/write', { id: this.id, files })
  }

  async readFile(path: string): Promise<string> {
    const r = await call('/read', { id: this.id, path })
    return r.content ?? ''
  }

  async writeFilesBase64(files: { path: string; content: string }[]): Promise<void> {
    await call('/write-b64', { id: this.id, files })
  }

  async readFileBase64(path: string): Promise<string> {
    const r = await call('/read-b64', { id: this.id, path })
    return r.content || ''
  }

  async listFiles(dir?: string): Promise<string[]> {
    const r = await call('/list', { id: this.id, dir })
    return r.files || []
  }

  async deleteFile(path: string): Promise<void> {
    await call('/delete', { id: this.id, path })
  }

  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const r = await call('/exec', {
      id: this.id,
      command,
      cwd: opts?.cwd,
      env: opts?.env,
    })
    return {
      exitCode: r.exitCode ?? 1,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
    }
  }

  async startDevServer(command: string, port: number): Promise<DevServer> {
    const r = await call('/start-dev', { id: this.id, command, port })
    return {
      port,
      previewUrl: r.previewUrl,
      stop: async () => {
        await call('/stop-dev', { id: this.id, port })
      },
    }
  }

  async getPreviewUrl(port: number): Promise<string> {
    const r = await call('/preview', { id: this.id, port })
    return r.previewUrl
  }

  async snapshot(): Promise<SandboxSnapshot> {
    const r = await call('/snapshot', { id: this.id })
    return { projectId: this.projectId, files: r.files || [], createdAt: '' }
  }

  async suspend(): Promise<void> {
    await call('/suspend', { id: this.id })
  }

  async destroy(): Promise<void> {
    await call('/destroy', { id: this.id })
  }
}

export class CloudflareSandboxDriver implements SandboxDriver {
  readonly provider = 'cloudflare'

  async create(opts: CreateSandboxOptions): Promise<SandboxHandle> {
    const id = sandboxIdFor(opts.projectId)
    await call('/create', { id, files: opts.files || [] })
    return new CloudflareSandboxHandle(id, opts.projectId)
  }

  async resume(snapshot: SandboxSnapshot, opts?: Partial<CreateSandboxOptions>): Promise<SandboxHandle> {
    const projectId = opts?.projectId || snapshot.projectId
    const id = sandboxIdFor(projectId)
    await call('/create', { id, files: snapshot.files || [] })
    return new CloudflareSandboxHandle(id, projectId)
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    // Cloudflare sandboxes persist by id; a handle can always be reconstructed.
    return new CloudflareSandboxHandle(sandboxId, sandboxId.replace(/^proj-/, ''))
  }
}
