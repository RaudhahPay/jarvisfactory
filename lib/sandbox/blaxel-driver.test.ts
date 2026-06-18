// @vitest-environment node
//
// Live conformance for the Blaxel driver. SKIPPED unless BL_API_KEY + BL_WORKSPACE
// are set, so normal CI stays green without credentials. With creds present it runs
// the SAME provider-agnostic contract the stub passes, against real Blaxel sandboxes.
//
//   set -a; . ./.env; set +a; npx vitest run lib/sandbox/blaxel-driver.test.ts
//
// Note: live runs create + delete real sandboxes (may incur small usage); each test
// uses createIfNotExists on a stable name, and destroy() deletes it.

import { describe, it } from 'vitest'
import { runSandboxDriverConformance } from './driver-conformance'
import { BlaxelSandboxDriver } from './blaxel-driver'

const hasCreds = !!process.env.BL_API_KEY && !!process.env.BL_WORKSPACE

if (hasCreds) {
  runSandboxDriverConformance(() => new BlaxelSandboxDriver(), 'blaxel (live)')
} else {
  describe.skip('SandboxDriver conformance — blaxel (live)', () => {
    it('skipped: set BL_WORKSPACE + BL_API_KEY to run live', () => {})
  })
}
