#!/usr/bin/env node
// Unit test for the SSE parser in lib/build-client.ts. Mocks fetch with a canned
// event-stream (incl. a frame split across chunks) and asserts every AgentEvent is
// parsed, in order, with no auth/DB/network. Run: `npx -y tsx scripts/test-build-client.mjs`

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (console.log(`${G}✓${X} ${n}`), pass++) : (console.log(`${R}✗${X} ${n}`), fail++))

const frames = [
  'data: {"type":"thinking","text":"planning"}\n\n',
  'data: {"type":"tool_use","tool":"write_file","input":{"path":"index.html"}}\n\n',
  'data: {"type":"file_edit","path":"index.html","action":"create"}\n\n',
  'data: {"type":"usage","inputTokens":10,"outputTokens":5,"model":"m","costUsd":0.01}\n\n',
  'data: {"type":"done","reason":"end_turn"}\n\n',
]
// Concatenate, then re-chunk at odd boundaries to prove cross-chunk frame buffering.
const whole = frames.join('')
const chunks = [whole.slice(0, 30), whole.slice(30, 95), whole.slice(95)]

globalThis.fetch = async () => {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const { streamBuild } = await import('../lib/build-client.ts')

console.log(`${C}── SSE parser ──${X}`)
const got = []
await streamBuild({ appId: 'a', prompt: 'p' }, e => got.push(e))

ok(got.length === 5, `parsed all 5 events (got ${got.length})`)
ok(got[0]?.type === 'thinking', 'order preserved: first is thinking')
ok(got[1]?.type === 'tool_use' && got[1].tool === 'write_file', 'tool_use parsed with fields')
ok(got[3]?.type === 'usage' && got[3].costUsd === 0.01, 'usage parsed with numeric cost')
ok(got[4]?.type === 'done', 'last is done')

// error-path: non-OK response throws with the server error message
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
let threw = null
try {
  await streamBuild({ appId: 'a', prompt: 'p' }, () => {})
} catch (e) {
  threw = e
}
ok(threw && /Not authenticated/.test(threw.message), 'throws server error message on non-OK response')

console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
process.exit(fail === 0 ? 0 : 1)
