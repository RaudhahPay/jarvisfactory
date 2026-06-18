// Sandbox driver factory — the single place product code resolves a SandboxDriver.
// Selected by SANDBOX_PROVIDER:
//   • 'blaxel'     → BlaxelSandboxDriver (Firecracker microVMs; primary provider)
//   • 'cloudflare' → CloudflareSandboxDriver (bridge fallback; needs SANDBOX_BRIDGE_URL)
//   • otherwise    → in-memory StubSandboxDriver (default / local / CI)
// Product code never imports a concrete driver — only getSandboxDriver(). The Blaxel
// SDK (@blaxel/core, http2) is loaded lazily so it never enters other runtimes.

import type { SandboxDriver } from './types'
import { StubSandboxDriver } from './stub-driver'
import { CloudflareSandboxDriver } from './cloudflare-driver'

let singleton: SandboxDriver | null = null

export function getSandboxDriver(): SandboxDriver {
  if (!singleton) {
    const provider = process.env.SANDBOX_PROVIDER
    if (provider === 'blaxel' && process.env.BL_API_KEY) {
      // Lazy require so @blaxel/core is only loaded when actually selected.
      const { BlaxelSandboxDriver } = require('./blaxel-driver') as typeof import('./blaxel-driver')
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
