// ============================================================
// JARVISFACTORY v2 / Stage 4 — S6: metering + quotas
// ============================================================
// CLAUDE.md §6/§10: every model call is logged to usage_events; per-user monthly
// spend is checked BEFORE a session starts. Used by /api/build. Supabase is passed
// in (the route already has an RLS-scoped client) so this stays I/O-thin and testable.
// ============================================================

const DEFAULT_LIMIT = Number(process.env.DEFAULT_MONTHLY_COST_LIMIT_USD || '5')

export interface UsageRow {
  user_id: string
  app_id?: string | null
  build_job_id?: string | null
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

// Append per-call usage rows (the granular ledger). Best-effort: metering must never
// break a build, and build_jobs.events already holds the same usage events as backup.
export async function recordUsage(supabase: any, rows: UsageRow[]): Promise<void> {
  if (!rows.length) return
  try {
    await supabase.from('usage_events').insert(rows)
  } catch {
    /* swallow — see note above */
  }
}

export interface QuotaResult {
  ok: boolean
  usedUsd: number
  limitUsd: number
  reason?: string
}

// Sum this calendar month's spend for the user and compare to their cap.
// limit <= 0 (or NULL) means unlimited.
export async function checkQuota(supabase: any, userId: string): Promise<QuotaResult> {
  const { data: prof } = await supabase.from('profiles').select('monthly_cost_limit_usd').eq('id', userId).single()
  const limitUsd = Number(prof?.monthly_cost_limit_usd ?? DEFAULT_LIMIT)
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return { ok: true, usedUsd: 0, limitUsd: 0 }

  const since = new Date()
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)

  const { data: rows } = await supabase.from('usage_events').select('cost_usd').eq('user_id', userId).gte('created_at', since.toISOString())
  const usedUsd = (rows || []).reduce((a: number, r: any) => a + Number(r.cost_usd || 0), 0)

  if (usedUsd >= limitUsd) {
    return {
      ok: false,
      usedUsd,
      limitUsd,
      reason: `Monthly usage limit reached ($${usedUsd.toFixed(2)} of $${limitUsd.toFixed(2)}). It resets on the 1st.`,
    }
  }
  return { ok: true, usedUsd, limitUsd }
}
