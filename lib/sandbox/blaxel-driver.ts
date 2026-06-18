// ============================================================
// JARVISFACTORY v2 / Stage 4 — Blaxel SandboxDriver
// ============================================================
// Real sandbox provider built on Blaxel (Firecracker microVMs, @blaxel/core).
// Chosen 2026-06-17 (see docs/plans/2026-06-17-runtime-and-deploy-architecture.md):
// Blaxel ships perpetual standby (near-zero idle cost — our top cost risk) and
// built-in per-port preview URLs, so we skip building the sandbox-worker bridge +
// lifecycle + proxy ourselves.
//
// Auth: BL_WORKSPACE + BL_API_KEY in the environment (never logged).
// This file is the ONLY place that imports @blaxel/core — product code depends on
// the SandboxDriver interface only (CLAUDE.md §5). Loose typing on SDK payloads is
// intentional and documented (CLAUDE.md §8).
// ============================================================

import { SandboxInstance } from '@blaxel/core'
import type {
  SandboxDriver, SandboxHandle, SandboxFile, SandboxStatus, SandboxSnapshot,
  CreateSandboxOptions, ExecOptions, ExecResult, DevServer,
} from './types'

// Working root inside the sandbox. All project paths are relative to this.
const WORKDIR = '/blaxel/app'
const DEFAULT_IMAGE = process.env.BLAXEL_SANDBOX_IMAGE || 'blaxel/prod-base:latest'

// Blaxel sandbox names must be stable + safe. One sandbox per project.
function sandboxName(projectId: string): string {
  const safe = projectId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  return `ez-${safe || 'proj'}`
}

const abs = (p: string) => `${WORKDIR}/${p.replace(/^\/+/, '')}`
const rel = (p: string) => p.replace(new RegExp(`^${WORKDIR}/?`), '')

class BlaxelHandle implements SandboxHandle {
  readonly id: string
  readonly projectId: string
  private inst: SandboxInstance
  // Local lifecycle override so suspend()/destroy() are deterministic regardless
  // of how Blaxel reports transient status.
  private override: SandboxStatus | null = null

  constructor(inst: SandboxInstance, projectId: string) {
    this.inst = inst
    this.projectId = projectId
    this.id = sandboxName(projectId)
  }

  async status(): Promise<SandboxStatus> {
    if (this.override) return this.override
    const s = String((this.inst as any).status || '').toUpperCase()
    if (s.includes('FAIL') || s.includes('ERROR')) return 'error'
    if (s.includes('SUSPEND') || s.includes('STANDBY') || s.includes('PAUSE')) return 'suspended'
    if (s.includes('DELET') || s.includes('TERMINAT')) return 'destroyed'
    return 'running'
  }

  // ── Files ──
  async writeFiles(files: SandboxFile[]): Promise<void> {
    if (!files.length) return
    await this.inst.fs.writeTree(files.map(f => ({ path: f.path.replace(/^\/+/, ''), content: f.content })), WORKDIR)
  }

  async writeFilesBase64(files: { path: string; content: string }[]): Promise<void> {
    await this.writeFiles(files.map(f => ({ path: f.path, content: Buffer.from(f.content, 'base64').toString('utf-8') })))
  }

  async persistDeliverables(prefix: string): Promise<{ files: { path: string; size: number }[] }> {
    const res: any = await this.inst.fs.find(abs(prefix), { type: 'file' })
    const matches: any[] = res?.matches || []
    return { files: matches.map(m => ({ path: rel(m.path), size: 0 })) }
  }

  async readFile(path: string): Promise<string> {
    return this.inst.fs.read(abs(path))
  }

  async readFileBase64(path: string): Promise<string> {
    return Buffer.from(await this.readFile(path), 'utf-8').toString('base64')
  }

  async listFiles(dir?: string): Promise<string[]> {
    const root = dir ? abs(dir) : WORKDIR
    const res: any = await this.inst.fs.find(root, { type: 'file' })
    const matches: any[] = res?.matches || []
    return matches.map(m => rel(m.path))
  }

  async deleteFile(path: string): Promise<void> {
    await this.inst.fs.rm(abs(path))
  }

  // ── Exec ──
  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const r: any = await this.inst.process.exec({
      command,
      workingDir: WORKDIR,
      waitForCompletion: true,
      timeout: opts?.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : undefined,
      env: opts?.env,
      onStdout: opts?.onStdout,
      onStderr: opts?.onStderr,
    } as any)
    const stdout = r?.stdout ?? r?.logs ?? ''
    const stderr = r?.stderr ?? ''
    if (stdout && opts?.onStdout) opts.onStdout(stdout)
    return { exitCode: typeof r?.exitCode === 'number' ? r.exitCode : 0, stdout, stderr }
  }

  // ── Dev server + preview ──
  async startDevServer(command: string, port: number): Promise<DevServer> {
    await this.inst.process.exec({
      command,
      name: `dev-${port}`,
      workingDir: WORKDIR,
      keepAlive: true,
      waitForCompletion: false,
      waitForPorts: [port],
    } as any)
    const previewUrl = await this.getPreviewUrl(port)
    return {
      port,
      previewUrl,
      stop: async () => { try { await this.inst.process.kill(`dev-${port}`) } catch { /* already gone */ } },
    }
  }

  async getPreviewUrl(port: number): Promise<string> {
    const preview: any = await this.inst.previews.createIfNotExists({
      metadata: { name: `p-${port}` },
      spec: { port, public: true },
    } as any)
    return preview?.spec?.url || ''
  }

  // ── Lifecycle ──
  async snapshot(): Promise<SandboxSnapshot> {
    const paths = await this.listFiles()
    const files: SandboxFile[] = []
    for (const p of paths) {
      try { files.push({ path: p, content: await this.readFile(p) }) } catch { /* skip unreadable */ }
    }
    return { projectId: this.projectId, files, createdAt: '' }
  }

  async suspend(): Promise<void> {
    // Blaxel auto-standbys idle sandboxes; mark locally so status() is deterministic.
    this.override = 'suspended'
  }

  async destroy(): Promise<void> {
    this.override = 'destroyed'
    try { await this.inst.delete() } catch { /* already deleted */ }
  }
}

export class BlaxelSandboxDriver implements SandboxDriver {
  readonly provider = 'blaxel'

  private async ensure(projectId: string, opts?: Partial<CreateSandboxOptions>): Promise<SandboxInstance> {
    const inst = await SandboxInstance.createIfNotExists({
      name: sandboxName(projectId),
      image: opts?.template || DEFAULT_IMAGE,
      envs: opts?.envVars ? Object.entries(opts.envVars).map(([name, value]) => ({ name, value })) : undefined,
      ports: [{ target: 3000, protocol: 'HTTP' }],
    } as any)
    await inst.wait({ maxWait: 60_000, interval: 1_000 })
    return inst
  }

  async create(opts: CreateSandboxOptions): Promise<SandboxHandle> {
    const inst = await this.ensure(opts.projectId, opts)
    const handle = new BlaxelHandle(inst, opts.projectId)
    if (opts.files?.length) await handle.writeFiles(opts.files)
    return handle
  }

  async resume(snapshot: SandboxSnapshot, opts?: Partial<CreateSandboxOptions>): Promise<SandboxHandle> {
    const projectId = opts?.projectId || snapshot.projectId
    const inst = await this.ensure(projectId, opts)
    const handle = new BlaxelHandle(inst, projectId)
    if (snapshot.files?.length) await handle.writeFiles(snapshot.files)
    return handle
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    try {
      const inst = await SandboxInstance.get(sandboxId)
      // Recover projectId from the ez-<projectId> name convention.
      const projectId = sandboxId.replace(/^ez-/, '')
      return new BlaxelHandle(inst, projectId)
    } catch {
      return null
    }
  }
}
