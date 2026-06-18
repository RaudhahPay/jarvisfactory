// Sandbox driver factory — the single place product code resolves a SandboxDriver.
// Selected by SANDBOX_PROVIDER:
//   • 'blaxel'     → BlaxelSandboxDriver (Firecracker microVMs; primary provider)
//   • 'cloudflare' → CloudflareSandboxDriver (bridge fallback; needs SANDBOX_BRIDGE_URL)
//   • otherwise    → in-memory StubSandboxDriver (default / local / CI)
// Product code never imports a concrete driver — only getSandboxDriver(). This
// module is server-only (Node); the web/ SPA never imports it, so importing
// @blaxel/core here doesn't reach the browser bundle.

import type { SandboxDriver } from './types'
import { StubSandboxDriver } from './stub-driver'
import { CloudflareSandboxDriver } from './cloudflare-driver'
import { BlaxelSandboxDriver } from './blaxel-driver'

let singleton: SandboxDriver | null = null

export function getSandboxDriver(): SandboxDriver {
  if (!singleton) {
    const provider = process.env.SANDBOX_PROVIDER
    if (provider === 'blaxel' && process.env.BL_API_KEY) {
      singleton = new BlaxelSandboxDriver()
    } else if (provider === 'cloudflare' && process.env.SANDBOX_BRIDGE_URL) {
      singleton = new CloudflareSandboxDriver()
    } else {
      singleton = new StubSandboxDriver()
    }
  }
  return singleton
}

export type { SandboxDriver, SandboxHandle, SandboxFile, SandboxSnapshot } from './types'
