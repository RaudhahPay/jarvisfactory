// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: build orchestrator route — Hono port
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
// so the whole flow is exercisable without Cloudflare or the real Agent SDK. Ported 1:1
// from the Next.js route — only the framework wrapper changed.
// ============================================================

import { Hono } from 'hono'
import { requireUser } from '@/server/middleware/auth'
import { getSandboxDriver } from '@/lib/sandbox'
import { getAgentRunner } from '@/lib/agent'
import type { AgentEvent } from '@/lib/agent/types'
import type { SandboxFile } from '@/lib/sandbox/types'
import { validatePrompt } from '@/lib/agent/policy'
import { recordUsage, checkQuota } from '@/lib/metering'
import { resolveModel } from '@/lib/models'
import { buildBuildPrompt, PREVIEW_COMMAND, PREVIEW_PORT } from '@/lib/agent/build'

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

const buildApp = new Hono()

buildApp.post('/api/build', async (c) => {
  const { user, db } = await requireUser(c)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const appId: string | undefined = body?.appId || body?.app_id
  if (!appId) return c.json({ error: 'appId is required' }, 400)
  const pv = validatePrompt(body?.prompt)
  if (!pv.ok) return c.json({ error: pv.reason }, 400)
  const prompt = pv.value
  const model = resolveModel(body?.model)
  const attachments: any[] = Array.isArray(body?.attachments) ? body.attachments : []
  const uploadsNote = attachments.length ? `\n\nThe user uploaded ${attachments.length} file(s) to /workspace/uploads/: ${attachments.map((a: any) => a.name).join(', ')}.` : ''

  // S6: enforce the per-user monthly spend cap BEFORE starting a session.
  const quota = await checkQuota(db, user.id)
  if (!quota.ok) return c.json({ error: quota.reason }, 402)

  // RLS restricts to the owner; the explicit check just yields a cleaner 403/404.
  const { data: app } = await db
    .from('apps')
    .select('id, user_id, sandbox_id, files_json, html_code, entry_point')
    .eq('id', appId)
    .single()
  if (!app) return c.json({ error: 'App not found' }, 404)
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const { data: job, error: jobErr } = await db
    .from('build_jobs')
    .insert({ app_id: appId, user_id: user.id, status: 'running', prompt, started_at: now() })
    .select('id')
    .single()
  if (jobErr || !job) {
    return c.json({ error: `Could not create build job: ${jobErr?.message || 'unknown'}` }, 500)
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

        if (attachments.length) {
          await sandbox.writeFilesBase64(attachments.map((a: any) => ({ path: 'uploads/' + a.name, content: a.data })))
        }
        const runner = await getAgentRunner()
        await runner.start(sandbox, { projectId: appId, userId: user.id, model, prompt: buildBuildPrompt(prompt) + uploadsNote, onEvent: send })

        // Persist the resulting file tree (source of truth).
        const snap = await sandbox.snapshot()
        const filesJson: Record<string, string> = {}
        for (const f of snap.files) filesJson[f.path] = f.content

        // Serve the built static app for live preview. Port 3000 is reserved by the
        // sandbox SDK, so we use a static server on PREVIEW_PORT (8080).
        let previewUrl = ''
        try {
          const dev = await sandbox.startDevServer(PREVIEW_COMMAND, PREVIEW_PORT)
          previewUrl = dev.previewUrl
          send({ type: 'text', text: `\n\n🔗 Live preview: ${previewUrl}` })
        } catch (e: any) {
          send({ type: 'text', text: `\n\n(Preview server could not start: ${e?.message || 'unknown'})` })
        }

        // Mirror index.html into html_code so the app also shows in the dashboard/preview.
        const indexHtml = filesJson['index.html'] || ''
        await db
          .from('apps')
          .update({ files_json: filesJson, html_code: indexHtml || null, builder_version: 'v11', preview_url: previewUrl || null, sandbox_last_active_at: now() })
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

  return c.body(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
})

export { buildApp }
