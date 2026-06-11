#!/usr/bin/env node
// Unit test for lib/metering.ts quota math, with a fake Supabase client. No network.
// Run: `npx -y tsx scripts/test-metering.mjs`

import { checkQuota, recordUsage } from '../lib/metering.ts'

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', X = '\x1b[0m'
let pass = 0, fail = 0
const ok = (c, n) => (c ? (pass++, console.log(`${G}✓${X} ${n}`)) : (fail++, console.log(`${R}✗${X} ${n}`)))

// limit = profiles.monthly_cost_limit_usd; used = array of prior cost_usd this month
function fakeSupabase({ limit, used }) {
  return {
    from(table) {
      if (table === 'profiles') {
        return { select() { return this }, eq() { return this }, single: async () => ({ data: { monthly_cost_limit_usd: limit } }) }
      }
      return {
        select() { return this },
        eq() { return this },
        gte: async () => ({ data: used.map(c => ({ cost_usd: c })) }),
        insert: async () => ({ data: null, error: null }),
      }
    },
  }
}

console.log(`${C}── checkQuota ──${X}`)
let q = await checkQuota(fakeSupabase({ limit: 5, used: [1, 2] }), 'u1')
ok(q.ok === true && q.usedUsd === 3 && q.limitUsd === 5, `under limit: used $3 of $5 → ok`)

q = await checkQuota(fakeSupabase({ limit: 5, used: [3, 3] }), 'u1')
ok(q.ok === false && q.usedUsd === 6, `over limit: used $6 of $5 → blocked`)

q = await checkQuota(fakeSupabase({ limit: 5, used: [5] }), 'u1')
ok(q.ok === false, `exactly at limit → blocked`)

q = await checkQuota(fakeSupabase({ limit: 0, used: [999] }), 'u1')
ok(q.ok === true && q.limitUsd === 0, `limit 0 → unlimited`)

q = await checkQuota(fakeSupabase({ limit: null, used: [] }), 'u1')
ok(q.ok === true, `null limit → falls back to default, no usage → ok`)

console.log(`\n${C}── recordUsage ──${X}`)
let threw = false
try {
  await recordUsage(fakeSupabase({ limit: 5, used: [] }), [])
  await recordUsage(fakeSupabase({ limit: 5, used: [] }), [{ user_id: 'u', model: 'm', input_tokens: 1, output_tokens: 1, cost_usd: 0.01 }])
} catch {
  threw = true
}
ok(!threw, 'recordUsage never throws (empty + non-empty)')

console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${X}`)
process.exit(fail === 0 ? 0 : 1)
