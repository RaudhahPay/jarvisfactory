#!/usr/bin/env node
// LIVE end-to-end test of CloudflareSandboxDriver against the deployed bridge +
// a real Cloudflare container. Run: `npx -y tsx scripts/test-cloudflare-live.mjs`
import { readFileSync } from 'node:fs'

process.env.SANDBOX_BRIDGE_URL = 'https://jarvisfactory-sandbox.ariavibecoderlab.workers.dev'
process.env.SANDBOX_BRIDGE_TOKEN = readFileSync('/tmp/bridge_token.txt', 'utf8').trim()

const { CloudflareSandboxDriver } = await import('../lib/sandbox/cloudflare-driver.ts')
const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (pass++, console.log(`${G}✓${X} ${n}`)) : (fail++, console.log(`${R}✗${X} ${n}`)))

const d = new CloudflareSandboxDriver()
console.log(`${C}── live Cloudflare container (cold start may take ~30s) ──${X}`)

const sb = await d.create({ projectId: 'live-smoke', files: [{ path: 'index.html', content: '<h1>built in a real sandbox</h1>' }] })
ok(!!sb.id, `create → sandbox ${sb.id}`)

const ex = await sb.exec('echo HELLO && cat index.html && node --version')
ok(ex.exitCode === 0, `exec ran (exit ${ex.exitCode})`)
ok(/HELLO/.test(ex.stdout) && /real sandbox/.test(ex.stdout), 'exec sees the file we wrote')
ok(/v\d+\./.test(ex.stdout), `node present in container: ${(ex.stdout.match(/v\d+\.\d+\.\d+/) || ['?'])[0]}`)

await sb.writeFiles([{ path: 'scripts/app.js', content: 'console.log(1)' }])
const snap = await sb.snapshot()
const paths = snap.files.map(f => f.path).sort()
ok(paths.includes('index.html') && paths.includes('scripts/app.js'), `snapshot has the tree: ${paths.join(', ')}`)

await sb.destroy()
ok(true, 'destroy ok')

console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
process.exit(fail === 0 ? 0 : 1)
