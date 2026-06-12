// ============================================================
// JARVISFACTORY v2 / Stage 4 — S2: SandboxDriver (provider-agnostic)
// ============================================================
// The single seam between the product and whatever runs untrusted, AI-edited
// code. Per CLAUDE.md §5/§8 this MUST stay provider-agnostic: app code never
// imports the E2B / Cloudflare-Sandbox SDK directly — only this interface — so
// we can swap the compute provider without touching the product.
//
// Invariants (CLAUDE.md §5):
//   • One sandbox per active project. One project = one sandbox = one agent session.
//   • Every sandbox is hostile to every other: no shared FS, network, or secrets.
//   • The agent runs INSIDE the sandbox; our orchestrator never executes user code.
//   • Idle sandboxes auto-suspend; the file tree is the durable state (snapshot to
//     Supabase storage on suspend, rehydrate on resume). The running compute is
//     disposable; `SandboxSnapshot` is the source of truth — NOT apps.files_json.
//
// Concrete drivers (lib/sandbox/<provider>-driver.ts) are written AFTER consulting
// that provider's official docs. This file is types only — no runtime behavior.
// ============================================================

export type SandboxStatus = 'creating' | 'running' | 'suspended' | 'destroyed' | 'error'

// Text files only for now (matches the v1 file-map model). Binary assets come later
// as a separate concern (data URLs / object storage), not through this hot path.
export interface SandboxFile {
  path: string // relative, no leading slash (e.g. 'app/page.tsx')
  content: string
}

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  // Stream output as it arrives (for piping into the chat UI / build log).
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  signal?: AbortSignal
}

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

// A dev server running INSIDE the sandbox, exposed to a per-project preview URL
// (the preview proxy lands here — CLAUDE.md §4, the third ADD layer).
export interface DevServer {
  port: number
  previewUrl: string
  stop(): Promise<void>
}

// The full, portable state of a project. This is what we persist to Supabase
// storage on suspend and replay on resume — the durable source of truth.
export interface SandboxSnapshot {
  projectId: string
  files: SandboxFile[]
  createdAt: string // ISO; stamped by the caller, not inside the driver
  meta?: Record<string, any>
}

export interface CreateSandboxOptions {
  projectId: string
  template?: string // provider base image / toolchain id (CLAUDE.md §10 open question)
  envVars?: Record<string, string> // injected into the sandbox, never logged
  files?: SandboxFile[] // initial tree (e.g. a starter template)
}

// A handle to one live sandbox. All file/exec/preview ops go through here so the
// Agent SDK's bash + file tools (AgentRunner) are backed by the sandbox, not the host.
export interface SandboxHandle {
  readonly id: string
  readonly projectId: string

  status(): Promise<SandboxStatus>

  // ── Files ──
  writeFiles(files: SandboxFile[]): Promise<void>
  writeFilesBase64(files: { path: string; content: string }[]): Promise<void>
  persistDeliverables(prefix: string): Promise<{ files: { path: string; size: number }[] }>
  readFile(path: string): Promise<string>
  readFileBase64(path: string): Promise<string>
  listFiles(dir?: string): Promise<string[]>
  deleteFile(path: string): Promise<void>

  // ── Exec ── (package installs, builds, arbitrary commands — all inside the sandbox)
  exec(command: string, opts?: ExecOptions): Promise<ExecResult>

  // ── Dev server + preview ──
  startDevServer(command: string, port: number): Promise<DevServer>
  getPreviewUrl(port: number): Promise<string>

  // ── Lifecycle ──
  snapshot(): Promise<SandboxSnapshot> // export the full tree for persistence
  suspend(): Promise<void> // tear down compute, keep snapshot recoverable (cost control)
  destroy(): Promise<void> // permanent
}

// The provider-agnostic factory. Exactly one concrete implementation is active at a
// time, chosen by config; product code depends only on this interface.
export interface SandboxDriver {
  readonly provider: string // 'e2b' | 'cloudflare' | ...

  create(opts: CreateSandboxOptions): Promise<SandboxHandle>
  // Rehydrate a previously-suspended project from its snapshot (resume a build).
  resume(snapshot: SandboxSnapshot, opts?: Partial<CreateSandboxOptions>): Promise<SandboxHandle>
  // Reconnect to a still-running sandbox by id (e.g. after a server restart).
  get(sandboxId: string): Promise<SandboxHandle | null>
}
