#!/usr/bin/env node
// LIVE Cowork proof: real agent + cowork briefing + bundled skills → a real .docx in a
// real Cloudflare container. Run: `npx -y tsx scripts/test-cowork-live.mjs`
import { readFileSync } from 'node:fs'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
process.env.SANDBOX_BRIDGE_URL = 'https://jarvisfactory-sandbox.ariavibecoderlab.workers.dev'
process.env.SANDBOX_BRIDGE_TOKEN = readFileSync('/tmp/bridge_token.txt', 'utf8').trim()

const { CloudflareSandboxDriver } = await import('../lib/sandbox/cloudflare-driver.ts')
const { ClaudeAgentRunner } = await import('../lib/agent/claude-runner.ts')
const { buildCoworkPrompt } = await import('../lib/agent/cowork.ts')

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (pass++, console.log(`${G}✓${X} ${n}`)) : (fail++, console.log(`${R}✗${X} ${n}`)))

const driver = new CloudflareSandboxDriver()
const runner = new ClaudeAgentRunner()
const sb = await driver.create({ projectId: 'cowork-live', files: [] })

console.log(`${C}── Cowork: agent makes a real .docx via the bundled skill ──${X}`)
await runner.start(sb, {
  projectId: 'cowork-live',
  userId: 'u1',
  model: 'claude-sonnet-4-6',
  prompt: buildCoworkPrompt('Create a Word document at /workspace/report.docx with the title "Hello from Cowork" and one short paragraph of body text. Use the docx skill.'),
  onEvent: e => {
    if (e.type === 'tool_use') console.log(`  ${C}tool${X} ${e.tool}`)
    else if (e.type === 'exec') console.log(`  ${C}exec${X} ${e.command.slice(0, 70)}`)
    else if (e.type === 'usage') console.log(`  ${C}usage${X} $${e.costUsd}`)
    else if (e.type === 'error') console.log(`  ${R}error${X} ${e.message}`)
  },
})

const check = await sb.exec('ls -la /workspace && echo --- && file /workspace/report.docx 2>/dev/null')
console.log(`${C}sandbox /workspace:${X}\n${check.stdout}`)
ok(/report\.docx/.test(check.stdout), 'report.docx exists in the container')
ok(/OOXML|Microsoft Word|Zip archive|OpenXML|Composite Document/i.test(check.stdout), 'report.docx is a real Office/zip file (not plain text)')

await sb.destroy()
console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
process.exit(fail === 0 ? 0 : 1)
