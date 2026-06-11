// Sandbox driver factory — the single place product code resolves a SandboxDriver.
// Today: stub. When the Cloudflare Sandbox runtime is ready, branch here on
// SANDBOX_PROVIDER (or a binding check) and return the CloudflareSandboxDriver.
// Nothing else in the app imports a concrete driver.

import type { SandboxDriver } from './types'
import { StubSandboxDriver } from './stub-driver'

let singleton: SandboxDriver | null = null

export function getSandboxDriver(): SandboxDriver {
  if (!singleton) singleton = new StubSandboxDriver()
  return singleton
}

export type { SandboxDriver, SandboxHandle, SandboxFile, SandboxSnapshot } from './types'
