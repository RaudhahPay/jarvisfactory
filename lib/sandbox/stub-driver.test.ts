import { runSandboxDriverConformance } from './driver-conformance'
import { StubSandboxDriver } from './stub-driver'

// The in-memory stub must satisfy the same contract as every real provider.
// When the Blaxel driver lands, it calls the same suite (gated on credentials).
runSandboxDriverConformance(() => new StubSandboxDriver(), 'stub')
