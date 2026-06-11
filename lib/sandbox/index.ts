// Sandbox driver factory — the single place product code resolves a SandboxDriver.
// CloudflareSandboxDriver when SANDBOX_PROVIDER=cloudflare and the bridge is configured;
// otherwise the in-memory StubSandboxDriver (default / local / CI). Product code never
// imports a concrete driver — only getSandboxDriver().

import type { SandboxDriver } from './types'
import { StubSandboxDriver } from './stub-driver'
import { CloudflareSandboxDriver } from './cloudflare-driver'

let singleton: SandboxDriver | null = null

export function getSandboxDriver(): SandboxDriver {
  if (!singleton) {
    if (process.env.SANDBOX_PROVIDER === 'cloudflare' && process.env.SANDBOX_BRIDGE_URL) {
      singleton = new CloudflareSandboxDriver()
    } else {
      singleton = new StubSandboxDriver()
    }
  }
  return singleton
}

export type { SandboxDriver, SandboxHandle, SandboxFile, SandboxSnapshot } from './types'
