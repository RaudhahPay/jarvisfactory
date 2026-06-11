// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: build orchestrator route
// ============================================================
// POST /api/build  { appId, prompt }
// The server-side replacement for the v1 browser build loop. It:
//   1. authenticates the user (RLS-scoped Supabase)
//   2. creates a build_jobs row (durable run-log)
//   3. ensures a sandbox (resume from the project's file tree, or create)
//   4. opens an AgentRunner session bound to that sandbox
//   5. streams AgentEvents to the client (SSE) while accumulating the event tail
//   6. persists the resulting file tree + preview URL + metering + final status
//
// Runs today against the STUB sandbox driver + agent runner (lib/sandbox, lib/agent),
// so the whole flow is exercisable without Cloudflare or the real Agent SDK. Swap the
// two factories' return values to go live — this route does not change.
// ============================================================

import { NextRequest } from 'next/server'
import { getAuthedDb } from '@/lib/supabase/authed'
import { getSandboxDriver } from '@/lib/sandbox'
import { getAgentRunner } from '@/lib/agent'
import type { AgentEvent } from '@/lib/agent/types'
import type { SandboxFile } from '@/lib/sandbox/types'
import { validatePrompt } from '@/lib/agent/policy'
import { recordUsage, checkQuota } from '@/lib/metering'

export const runtime = 'nodejs'
// Long-running agent turns; mirrors /api/chat. NOTE (CLAUDE.md §3): on Cloudflare this
// must move to Durable Objects / Containers — a plain Worker won't hold the session.
export const maxDuration = 300

function appToFiles(app: any): SandboxFile[] {
  if (app?.files_json && typeof app.files_json === 'object') {
    return Object.entries(app.files_json as Record<string, unknown>).map(([path, content]) => ({
      path,
      content: String(content),
    }))
  }
  if (app?.html_code) return [{ path: 'index.html', content: String(app.html_code) }]
  return []
}

const now = () => new Date().toISOString()

export async function POST(req: NextRequest) {
  const { user, db } = await getAuthedDb()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const appId: string | undefined = body?.appId || body?.app_id
  if (!appId) return Response.json({ error: 'appId is required' }, { status: 400 })
  const pv = validatePrompt(body?.prompt)
  if (!pv.ok) return Response.json({ error: pv.reason }, { status: 400 })
  const prompt = pv.value

  // S6: enforce the per-user monthly spend cap BEFORE starting a session.
  const quota = await checkQuota(db, user.id)
  if (!quota.ok) return Response.json({ error: quota.reason }, { status: 402 })

  // RLS restricts to the owner; the explicit check just yields a cleaner 403/404.
  const { data: app } = await db
    .from('apps')
    .select('id, user_id, sandbox_id, files_json, html_code, entry_point')
    .eq('id', appId)
    .single()
  if (!app) return Response.json({ error: 'App not found' }, { status: 404 })
  if (app.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { data: job, error: jobErr } = await db
    .from('build_jobs')
    .insert({ app_id: appId, user_id: user.id, status: 'running', prompt, started_at: now() })
    .select('id')
    .single()
  if (jobErr || !job) {
    return Response.json({ error: `Could not create build job: ${jobErr?.message || 'unknown'}` }, { status: 500 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const collected: AgentEvent[] = []
      const usageRows: any[] = []
      let inTok = 0
      let outTok = 0
      let cost = 0
      const send = (e: AgentEvent) => {
        collected.push(e)
        if (e.type === 'usage') {
          inTok += e.inputTokens
          outTok += e.outputTokens
          cost += e.costUsd
          usageRows.push({
            user_id: user.id,
            app_id: appId,
            build_job_id: job.id,
            model: e.model,
            input_tokens: e.inputTokens,
            output_tokens: e.outputTokens,
            cost_usd: e.costUsd,
          })
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      }

      try {
        const driver = getSandboxDriver()
        const sandbox =
          (app.sandbox_id && (await driver.get(app.sandbox_id))) ||
          (await driver.create({ projectId: appId, files: appToFiles(app) }))

        await db
          .from('apps')
          .update({
            sandbox_id: sandbox.id,
            sandbox_provider: driver.provider,
            sandbox_status: 'running',
            sandbox_last_active_at: now(),
          })
          .eq('id', appId)

        const runner = await getAgentRunner()
        await runner.start(sandbox, { projectId: appId, userId: user.id, prompt, onEvent: send })

        // Persist the resulting file tree (source of truth) + live preview URL.
        const snap = await sandbox.snapshot()
        const filesJson: Record<string, string> = {}
        for (const f of snap.files) filesJson[f.path] = f.content
        const previewUrl = await sandbox.getPreviewUrl(3000)

        await db
          .from('apps')
          .update({ files_json: filesJson, preview_url: previewUrl, sandbox_last_active_at: now() })
          .eq('id', appId)

        await db
          .from('build_jobs')
          .update({
            status: 'succeeded',
            events: collected,
            sandbox_id: sandbox.id,
            input_tokens: inTok,
            output_tokens: outTok,
            cost_usd: cost,
            finished_at: now(),
            updated_at: now(),
          })
          .eq('id', job.id)
      } catch (err: any) {
        send({ type: 'error', message: err?.message || 'Build failed' })
        await db
          .from('build_jobs')
          .update({
            status: 'failed',
            events: collected,
            error: err?.message || 'unknown',
            finished_at: now(),
            updated_at: now(),
          })
          .eq('id', job.id)
      } finally {
        await recordUsage(db, usageRows)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
