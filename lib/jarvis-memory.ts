// ============================================================
// JARVISFACTORY v9 — JARVIS persistent memory module
// ============================================================
// JARVIS reads top lessons before every build and records outcomes after.
// The compounding effect: every build makes the next build smarter.
// Falls back gracefully if the migration hasn't been run yet.
// ============================================================

import { createClient } from '@/utils/supabase/client'

export type LessonCategory = 'forbidden' | 'required' | 'pitfall' | 'correction' | 'recipe'

export interface JarvisLesson {
  id: string
  jarvis_id: string | null
  category: LessonCategory
  pattern: string
  example_before?: string
  example_after?: string
  source?: string
  weight: number
  active: boolean
  created_at: string
}

export interface BuildOutcome {
  app_id: string
  jarvis_id?: string | null
  qa_score?: number
  qa_certified?: boolean
  iterations?: number
  duration_seconds?: number
  errors_caught_by_audit?: string[]
  features_delivered?: string[]
  features_missed?: string[]
  user_satisfaction?: 'works' | 'partial' | 'broken'
  notes?: string
}

// ── READ — load top N lessons relevant to this user/JARVIS, ordered by weight ──
export async function loadJarvisLessons(jarvisId: string | null, limit = 30): Promise<JarvisLesson[]> {
  try {
    const supabase = createClient()
    let query = supabase
      .from('jarvis_lessons')
      .select('*')
      .eq('active', true)
      .order('weight', { ascending: false })
      .limit(limit)
    if (jarvisId) {
      // Get global (jarvis_id is null) + own
      query = query.or(`jarvis_id.is.null,jarvis_id.eq.${jarvisId}`)
    } else {
      query = query.is('jarvis_id', null)
    }
    const { data, error } = await query
    if (error) {
      // If table doesn't exist yet (migration not run), fail gracefully
      if (/relation .* does not exist|table .* not found/i.test(error.message || '')) {
        console.warn('[jarvis-memory] tables not found — run supabase-schema-v9-jarvis-memory.sql to enable JARVIS memory')
        return []
      }
      console.warn('[jarvis-memory] loadJarvisLessons error:', error.message)
      return []
    }
    return (data || []) as JarvisLesson[]
  } catch (err: any) {
    console.warn('[jarvis-memory] loadJarvisLessons threw:', err?.message)
    return []
  }
}

// ── FORMAT — turn lessons into a system-prompt-ready block ──
export function formatLessonsForPrompt(lessons: JarvisLesson[]): string {
  if (!lessons || lessons.length === 0) return ''
  const byCategory: Record<LessonCategory, JarvisLesson[]> = {
    forbidden: [], required: [], pitfall: [], correction: [], recipe: [],
  }
  for (const l of lessons) {
    if (byCategory[l.category]) byCategory[l.category].push(l)
  }

  const sections: string[] = []

  if (byCategory.forbidden.length) {
    sections.push('╔═══ FORBIDDEN — these will fail your build ═══╗')
    for (const l of byCategory.forbidden) sections.push(`  ❌ ${l.pattern}`)
  }
  if (byCategory.required.length) {
    sections.push('╔═══ REQUIRED — you MUST do all of these ═══╗')
    for (const l of byCategory.required) sections.push(`  ✓ ${l.pattern}`)
  }
  if (byCategory.pitfall.length) {
    sections.push('╔═══ KNOWN PITFALLS — avoid these mistakes ═══╗')
    for (const l of byCategory.pitfall) sections.push(`  ⚠ ${l.pattern}`)
  }
  if (byCategory.correction.length) {
    sections.push('╔═══ PROVEN FIXES — when you see X, do Y ═══╗')
    for (const l of byCategory.correction) sections.push(`  → ${l.pattern}`)
  }
  if (byCategory.recipe.length) {
    sections.push('╔═══ PROVEN RECIPES — battle-tested patterns ═══╗')
    for (const l of byCategory.recipe) sections.push(`  ★ ${l.pattern}`)
  }

  return `

═══════════════════════════════════════════════════════════
  JARVIS MEMORY — ${lessons.length} LESSONS FROM PREVIOUS BUILDS
  These were learned the hard way. Honor them.
═══════════════════════════════════════════════════════════

${sections.join('\n\n')}

═══════════════════════════════════════════════════════════
`
}

// ── WRITE — record this build's outcome for future learning ──
export async function recordBuildOutcome(outcome: BuildOutcome): Promise<void> {
  try {
    const supabase = createClient()
    const { error } = await supabase.from('jarvis_build_outcomes').insert({
      app_id: outcome.app_id,
      jarvis_id: outcome.jarvis_id || null,
      qa_score: outcome.qa_score,
      qa_certified: outcome.qa_certified,
      iterations: outcome.iterations,
      duration_seconds: outcome.duration_seconds,
      errors_caught_by_audit: outcome.errors_caught_by_audit,
      features_delivered: outcome.features_delivered,
      features_missed: outcome.features_missed,
      user_satisfaction: outcome.user_satisfaction,
      notes: outcome.notes,
    })
    if (error) console.warn('[jarvis-memory] recordBuildOutcome:', error.message)
  } catch (err: any) {
    console.warn('[jarvis-memory] recordBuildOutcome threw:', err?.message)
  }
}

// ── WRITE — add a new lesson (typically after user feedback or an audit catch) ──
export async function addLesson(
  lesson: { category: LessonCategory; pattern: string; jarvis_id?: string | null; example_before?: string; example_after?: string; source?: string; weight?: number }
): Promise<void> {
  try {
    const supabase = createClient()
    const { error } = await supabase.from('jarvis_lessons').insert({
      jarvis_id: lesson.jarvis_id || null,
      category: lesson.category,
      pattern: lesson.pattern,
      example_before: lesson.example_before,
      example_after: lesson.example_after,
      source: lesson.source,
      weight: lesson.weight ?? 1.0,
    })
    if (error) console.warn('[jarvis-memory] addLesson:', error.message)
  } catch (err: any) {
    console.warn('[jarvis-memory] addLesson threw:', err?.message)
  }
}

// ── REINFORCE — bump a lesson's weight when it fires/proves useful ──
export async function reinforceLesson(lessonId: string, delta = 0.1): Promise<void> {
  try {
    const supabase = createClient()
    const { data } = await supabase.from('jarvis_lessons').select('weight').eq('id', lessonId).single()
    if (data) {
      await supabase.from('jarvis_lessons').update({
        weight: (data.weight || 1) + delta,
        updated_at: new Date().toISOString()
      }).eq('id', lessonId)
    }
  } catch (err: any) {
    console.warn('[jarvis-memory] reinforceLesson threw:', err?.message)
  }
}

// ── v9.8 Phase 3: extract reusable lessons from a QA report ──
// Uses Haiku to distill QA failures into generalized rules. Returns the new lessons (already saved).
export async function extractLessonsFromQA(opts: {
  qaReport: any
  proposal: any
  jarvisId: string | null
  // Caller-provided Claude callback so we don't import the API client here
  callClaude: (sys: string, msg: string, maxTok: number, model?: string) => Promise<string>
}): Promise<JarvisLesson[]> {
  const { qaReport, proposal, jarvisId, callClaude } = opts
  if (!qaReport) return []

  const failed = qaReport.failed || []
  const critical = qaReport.critical_fixes || []
  const warnings = qaReport.warnings || []
  const score = qaReport.score || 0
  // Skip if build was clean
  if (score >= 90 && failed.length === 0 && critical.length === 0) return []
  // Skip if literally nothing to extract from
  if (failed.length === 0 && critical.length === 0 && warnings.length === 0) return []

  const sys = `You are JARVIS's MEMORY CURATOR. Read QA findings from a recent build and extract REUSABLE lessons that will prevent the same class of mistake on future builds.

Return ONLY valid JSON (no markdown):
{
  "lessons": [
    {
      "category": "forbidden" | "required" | "pitfall" | "correction" | "recipe",
      "pattern": "Concise rule under 200 chars. GENERALIZED — applies to ANY future app, not this specific one.",
      "weight": 1.0
    }
  ]
}

CATEGORIES:
- forbidden: NEVER do X (e.g. "NEVER show a logo image larger than 80px in the navbar")
- required: ALWAYS do X (e.g. "ALWAYS test text-on-background contrast against WCAG 4.5:1 minimum")
- pitfall: known traps (e.g. "Sticky positioning breaks inside flex containers without min-height")
- correction: when you see X, do Y (e.g. "If init() awaits a Jarvis call, wrap in try/catch with hideLoader() in finally")
- recipe: proven patterns (e.g. "TOAST PATTERN — fixed top-right div, 3.5s auto-dismiss, role-based color")

RULES:
- Aim for 0-3 lessons per call. QUALITY over quantity. If issues are too app-specific to generalize, return empty array.
- Lessons must be REUSABLE across many apps, not specific to this app's domain.
- BAD: "BrainyBunch needs a parent dashboard"
- GOOD: "Dashboards must distinguish role-specific views via showOnly() pattern, not nested if/else"
- Don't repeat lessons that obviously already exist (e.g. "use Jarvis.signup not localStorage" — already known).
- Be specific and actionable. Each lesson should change how a future build is written.`

  const userMsg = `QA REPORT (score ${score}/100, certified=${qaReport.certified ? 'yes' : 'no'}):

failed:
${failed.slice(0, 8).map((f: string) => '  • ' + f).join('\n') || '  (none)'}

critical_fixes:
${critical.slice(0, 8).map((c: string) => '  • ' + c).join('\n') || '  (none)'}

warnings:
${warnings.slice(0, 5).map((w: string) => '  • ' + w).join('\n') || '  (none)'}

APP CONTEXT (for relevance — but lessons should be generic, not specific):
- App: ${proposal?.app_name || '?'}
- Complexity: ${proposal?.complexity || '?'}
- Target users: ${(proposal?.target_users || '').slice(0, 100)}

Distill 0-3 generalized lessons. Return JSON.`

  let parsed: any = { lessons: [] }
  try {
    const raw = await callClaude(sys, userMsg, 2000, 'claude-haiku-4-5-20251001')
    const cleaned = raw.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (err: any) {
    console.warn('[jarvis-memory] extractLessonsFromQA parse failed:', err?.message)
    return []
  }

  const candidates: any[] = Array.isArray(parsed.lessons) ? parsed.lessons : []
  if (candidates.length === 0) return []

  const ts = new Date().toISOString().slice(0, 10)
  const saved: JarvisLesson[] = []
  for (const c of candidates.slice(0, 3)) {
    const cat = (c.category || 'pitfall') as LessonCategory
    if (!['forbidden', 'required', 'pitfall', 'correction', 'recipe'].includes(cat)) continue
    const pattern = String(c.pattern || '').trim().slice(0, 500)
    if (pattern.length < 20) continue
    await addLesson({
      jarvis_id: jarvisId,
      category: cat,
      pattern,
      source: `auto-qa-${ts}`,
      weight: typeof c.weight === 'number' ? Math.min(c.weight, 3) : 1,
    })
    // Push a synthetic record (we don't read it back from DB to save a query)
    saved.push({
      id: '', jarvis_id: jarvisId, category: cat, pattern,
      source: `auto-qa-${ts}`, weight: c.weight || 1, active: true, created_at: ts
    })
  }
  return saved
}

// ── COUNT — how many lessons does this JARVIS know? (UI helper) ──
export async function countLessons(jarvisId: string | null): Promise<number> {
  try {
    const supabase = createClient()
    let q = supabase.from('jarvis_lessons').select('id', { count: 'exact', head: true }).eq('active', true)
    if (jarvisId) q = q.or(`jarvis_id.is.null,jarvis_id.eq.${jarvisId}`)
    else q = q.is('jarvis_id', null)
    const { count } = await q
    return count || 0
  } catch {
    return 0
  }
}
