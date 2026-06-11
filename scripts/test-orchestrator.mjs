#!/usr/bin/env node
// Smoke test for the S3 orchestration core (stub SandboxDriver + AgentRunner).
// No Supabase / auth — exercises the engine the /api/build route drives.
// Run from project root: `node scripts/test-orchestrator.mjs`

import { getSandboxDriver } from '../lib/sandbox/index.ts'
import { getAgentRunner } from '../lib/agent/index.ts'

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (console.log(`${G}✓${X} ${n}`), pass++) : (console.log(`${R}✗${X} ${n}`), fail++))

console.log(`${C}── orchestration core (stub) ──${X}`)

const driver = getSandboxDriver()
const runner = getAgentRunner()

const sandbox = await driver.create({ projectId: 'test-proj', files: [] })
ok(typeof sandbox.id === 'string' && sandbox.id.length > 0, 'driver.create returns a sandbox handle with an id')
ok((await driver.get(sandbox.id)) === sandbox, 'driver.get reconnects to the live sandbox')

const events = []
await runner.start(sandbox, {
  projectId: 'test-proj',
  userId: 'u1',
  prompt: 'build me a todo app',
  onEvent: e => events.push(e),
})

const types = events.map(e => e.type)
ok(types[0] === 'thinking', 'first event is a thinking event')
ok(types.includes('tool_use'), 'emits tool_use')
ok(events.some(e => e.type === 'file_edit' && e.path === 'index.html'), 'emits file_edit for index.html')
ok(events.some(e => e.type === 'file_edit' && e.path === 'scripts/app.js'), 'emits file_edit for scripts/app.js')
ok(events.some(e => e.type === 'usage' && e.inputTokens > 0), 'emits a usage (metering) event')
ok(types[types.length - 1] === 'done', 'last event is done')

const snap = await sandbox.snapshot()
const paths = snap.files.map(f => f.path).sort()
ok(paths.includes('index.html'), 'sandbox snapshot contains index.html (agent actually wrote files)')
ok(paths.includes('scripts/app.js'), 'sandbox snapshot contains scripts/app.js')

const preview = await sandbox.getPreviewUrl(3000)
ok(/^https:\/\/stub-.*-3000\.preview\.local$/.test(preview), 'preview URL is well-formed')

// metering aggregation (what the route persists to build_jobs)
const usage = events.filter(e => e.type === 'usage').reduce((a, e) => ({ i: a.i + e.inputTokens, o: a.o + e.outputTokens, c: a.c + e.costUsd }), { i: 0, o: 0, c: 0 })
ok(usage.i > 0 && usage.o > 0 && usage.c > 0, `metering aggregates (in=${usage.i} out=${usage.o} cost=$${usage.c})`)

console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
console.log(`${C}event sequence:${X} ${types.join(' → ')}`)
process.exit(fail === 0 ? 0 : 1)
