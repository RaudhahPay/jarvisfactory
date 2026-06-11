#!/usr/bin/env node
// LIVE smoke for the real ClaudeAgentRunner (Agent SDK). Makes ONE real API call
// (cheap model, tiny prompt) and asserts the agent writes a file THROUGH the sandbox
// tool — proving the SDK + sandbox-backed-tools wiring works end to end.
// Run: `npx -y tsx scripts/test-claude-runner.mjs`  (needs ANTHROPIC_API_KEY)

import { readFileSync } from 'node:fs'

// Load ANTHROPIC_API_KEY from .env.local into the process env (Next does this for us
// at runtime; the harness must do it explicitly).
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
if (!/^sk-ant/.test(process.env.ANTHROPIC_API_KEY || '')) {
  console.error('No real ANTHROPIC_API_KEY found in .env.local — skipping live test.')
  process.exit(2)
}

const { StubSandboxDriver } = await import('../lib/sandbox/stub-driver.ts')
const { ClaudeAgentRunner } = await import('../lib/agent/claude-runner.ts')

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (console.log(`${G}✓${X} ${n}`), pass++) : (console.log(`${R}✗${X} ${n}`), fail++))

const driver = new StubSandboxDriver()
const sandbox = await driver.create({ projectId: 'live-test', files: [] })
const runner = new ClaudeAgentRunner()

const events = []
console.log(`${C}── live Claude Agent SDK run (haiku) ──${X}`)
await runner.start(sandbox, {
  projectId: 'live-test',
  userId: 'u1',
  model: 'claude-haiku-4-5-20251001',
  prompt:
    'Use the write_file tool to create a file named index.html whose content is exactly: <h1>Hello from the agent</h1>. Then stop — do not create any other files.',
  onEvent: e => {
    events.push(e)
    const tag = e.type.toUpperCase()
    const detail = e.type === 'tool_use' ? e.tool : e.type === 'file_edit' ? `${e.action} ${e.path}` : e.type === 'usage' ? `in=${e.inputTokens} out=${e.outputTokens} $${e.costUsd}` : e.type === 'text' ? e.text.slice(0, 60) : ''
    console.log(`  ${C}${tag}${X} ${detail}`)
  },
})

// If the account has no prepaid credits, the SDK still authenticated + streamed —
// the integration is proven, but the agent can't do work. Treat as SKIP, not FAIL.
const blob = JSON.stringify(events)
if (/Credit balance is too low|insufficient_quota|billing/i.test(blob)) {
  console.log(`\n\x1b[33mSKIPPED — Agent SDK wiring works (authenticated + streamed), but the`)
  console.log(`Anthropic account has no prepaid credits. Top up at console.anthropic.com → Billing,`)
  console.log(`then re-run to verify a real file write.\x1b[0m`)
  process.exit(2)
}

const snap = await sandbox.snapshot()
ok(events.some(e => e.type === 'tool_use' && e.tool === 'write_file'), 'agent called the write_file sandbox tool')
ok(events.some(e => e.type === 'file_edit' && e.path === 'index.html'), 'emitted file_edit for index.html')
ok(snap.files.some(f => f.path === 'index.html'), 'index.html actually landed in the sandbox')
ok(snap.files.some(f => f.path === 'index.html' && /Hello from the agent/.test(f.content)), 'file content matches the instruction')
ok(events.some(e => e.type === 'usage' && (e.inputTokens > 0 || e.outputTokens > 0)), 'real usage/metering reported')
ok(events.some(e => e.type === 'done'), 'emitted done')

console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
process.exit(fail === 0 ? 0 : 1)
