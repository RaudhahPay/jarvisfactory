#!/usr/bin/env node
// THE money shot: real Claude Agent SDK + real Cloudflare container, together —
// the exact production path of /api/build (minus HTTP/auth). Run:
//   npx -y tsx scripts/test-full-live.mjs
import { readFileSync } from 'node:fs'

// env from .env.local + the deployed bridge
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
process.env.SANDBOX_BRIDGE_URL = 'https://jarvisfactory-sandbox.ariavibecoderlab.workers.dev'
process.env.SANDBOX_BRIDGE_TOKEN = readFileSync('/tmp/bridge_token.txt', 'utf8').trim()

const { CloudflareSandboxDriver } = await import('../lib/sandbox/cloudflare-driver.ts')
const { ClaudeAgentRunner } = await import('../lib/agent/claude-runner.ts')

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (pass++, console.log(`${G}✓${X} ${n}`)) : (fail++, console.log(`${R}✗${X} ${n}`)))

const driver = new CloudflareSandboxDriver()
const runner = new ClaudeAgentRunner()

console.log(`${C}── real Claude agent → real Cloudflare container ──${X}`)
const sb = await driver.create({ projectId: 'full-live', files: [] })

const events = []
await runner.start(sb, {
  projectId: 'full-live',
  userId: 'u1',
  model: 'claude-haiku-4-5-20251001',
  prompt:
    'Create two files with the write_file tool: index.html containing <h1>Hello from the real agent</h1>, and styles/main.css containing "body { font-family: sans-serif }". Then stop.',
  onEvent: e => {
    events.push(e)
    if (['tool_use', 'file_edit', 'usage', 'text', 'error'].includes(e.type)) {
      const d = e.type === 'file_edit' ? `${e.action} ${e.path}` : e.type === 'usage' ? `$${e.costUsd}` : e.type === 'tool_use' ? e.tool : (e.text || '').slice(0, 50)
      console.log(`  ${C}${e.type}${X} ${d}`)
    }
  },
})

// snapshot reads from the REAL container
const snap = await sb.snapshot()
const paths = snap.files.map(f => f.path).sort()
ok(events.some(e => e.type === 'tool_use' && /write_file/.test(e.tool)), 'agent used the write_file tool')
ok(paths.includes('index.html'), `index.html in the real container`)
ok(snap.files.some(f => f.path === 'index.html' && /real agent/.test(f.content)), 'index.html content correct')
ok(paths.includes('styles/main.css'), 'styles/main.css in the real container (nested path)')
ok(events.some(e => e.type === 'usage' && e.costUsd > 0), 'real metering reported')
console.log(`  ${C}tree:${X} ${paths.join(', ')}`)

await sb.destroy()
console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
process.exit(fail === 0 ? 0 : 1)
