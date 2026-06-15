// ============================================================
// JARVISFACTORY v2 — Phase B: Cowork route — Hono port
// ============================================================
// POST /api/agent/cowork  { conversationId?, appId?, task }
// Runs the real agent (with the Cowork briefing + skills at /opt/skills) inside a sandbox
// to produce deliverables. Reuses the spine: getAuthedDb, SandboxDriver, AgentRunner,
// build_jobs run-log, usage metering, conversations/messages threads. Files land in
// apps.files_json (downloadable). Same AgentEvent SSE shape as /api/build. Ported 1:1
// from the Next.js route — only the framework wrapper changed.
// ============================================================

import { Hono } from 'hono'
import { requireUser } from '@/server/middleware/auth'
import { getSandboxDriver } from '@/lib/sandbox'
import { getAgentRunner } from '@/lib/agent'
import { buildCoworkPrompt } from '@/lib/agent/cowork'
import { validatePrompt } from '@/lib/agent/policy'
import { recordUsage, checkQuota } from '@/lib/metering'
import type { AgentEvent } from '@/lib/agent/types'
import type { SandboxFile } from '@/lib/sandbox/types'
import { resolveModel } from '@/lib/models'

const now = () => new Date().toISOString()

function appToFiles(app: any): SandboxFile[] {
  if (app?.files_json && typeof app.files_json === 'object') {
    return Object.entries(app.files_json as Record<string, unknown>).map(([path, content]) => ({ path, content: String(content) }))
  }
  return []
}

const agentCoworkApp = new Hono()

agentCoworkApp.post('/api/agent/cowork', async (c) => {
  const { user, db } = await requireUser(c)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const pv = validatePrompt(body?.task || body?.prompt)
  if (!pv.ok) return c.json({ error: pv.reason }, 400)
  const task = pv.value
  const model = resolveModel(body?.model)
  const attachments: any[] = Array.isArray(body?.attachments) ? body.attachments : []
  const uploadsNote = attachments.length ? `\n\nThe user uploaded ${attachments.length} file(s) to /workspace/uploads/: ${attachments.map((a: any) => a.name).join(', ')}. Read/study them as needed.` : ''

  const quota = await checkQuota(db, user.id)
  if (!quota.ok) return c.json({ error: quota.reason }, 402)

  // Workspace (apps row holds the sandbox + files) — create on first task.
  let appId: string | undefined = body?.appId
  if (!appId) {
    const { data, error } = await db
      .from('apps')
      .insert({ user_id: user.id, name: `Cowork: ${task.slice(0, 50)}`, description: task.slice(0, 200) })
      .select('id, sandbox_id, files_json')
      .single()
    if (error || !data) return c.json({ error: `Could not create workspace: ${error?.message || 'unknown'}` }, 500)
    appId = data.id as string
  }
  const { data: app } = await db.from('apps').select('id, user_id, sandbox_id, files_json').eq('id', appId).single()
  if (!app) return c.json({ error: 'Workspace not found' }, 404)
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  // Conversation thread (mode=cowork).
  let conversationId: string | undefined = body?.conversationId
  if (!conversationId) {
    const { data: conv } = await db
      .from('conversations')
      .insert({ user_id: user.id, mode: 'cowork', title: task.slice(0, 80), app_id: appId })
      .select('id')
      .single()
    conversationId = conv?.id
  }
  await db.from('messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'user', content: task })

  const { data: job } = await db
    .from('build_jobs')
    .insert({ app_id: appId, user_id: user.id, status: 'running', prompt: task, started_at: now() })
    .select('id')
    .single()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const collected: AgentEvent[] = []
      const usageRows: any[] = []
      let summary = ''
      let deliverablePaths: string[] = []
      let inTok = 0
      let outTok = 0
      let cost = 0
      const send = (e: AgentEvent) => {
        collected.push(e)
        if (e.type === 'text') summary += e.text
        if (e.type === 'usage') {
          inTok += e.inputTokens
          outTok += e.outputTokens
          cost += e.costUsd
          usageRows.push({ user_id: user.id, app_id: appId, build_job_id: job?.id || null, model: e.model, input_tokens: e.inputTokens, output_tokens: e.outputTokens, cost_usd: e.costUsd })
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      send({ type: 'text', text: '' } as AgentEvent) // flush headers
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversationId, appId })}\n\n`))

      try {
        const driver = getSandboxDriver()
        const sandbox = (app.sandbox_id && (await driver.get(app.sandbox_id))) || (await driver.create({ projectId: appId, files: appToFiles(app) }))
        await db.from('apps').update({ sandbox_id: sandbox.id, sandbox_provider: driver.provider, sandbox_status: 'running', sandbox_last_active_at: now() }).eq('id', appId)

        if (attachments.length) {
          await sandbox.writeFilesBase64(attachments.map((a: any) => ({ path: 'uploads/' + a.name, content: a.data })))
        }
        const runner = await getAgentRunner()
        await runner.start(sandbox, { projectId: appId, userId: user.id, model, prompt: buildCoworkPrompt(task) + uploadsNote, onEvent: send })

        // Persist the deliverables the agent produced.
        const snap = await sandbox.snapshot()
        const filesJson: Record<string, string> = {}
        for (const f of snap.files) filesJson[f.path] = f.content
        await db.from('apps').update({ files_json: filesJson, sandbox_last_active_at: now() }).eq('id', appId)

        // Durably persist deliverables to R2 so binary outputs survive sandbox sleep.
        try {
          const persisted = await sandbox.persistDeliverables(`deliverables/${appId}`)
          deliverablePaths = persisted.files.map(f => f.path)
        } catch {
          /* non-fatal: downloads fall back to the live sandbox */
        }

        if (job?.id) {
          await db.from('build_jobs').update({ status: 'succeeded', events: collected, sandbox_id: sandbox.id, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, finished_at: now(), updated_at: now() }).eq('id', job.id)
        }
      } catch (err: any) {
        send({ type: 'error', message: err?.message || 'Cowork run failed' })
        if (job?.id) await db.from('build_jobs').update({ status: 'failed', events: collected, error: err?.message || 'unknown', finished_at: now(), updated_at: now() }).eq('id', job.id)
      } finally {
        if (summary.trim()) {
          await db.from('messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'assistant', content: summary.slice(0, 8000), meta: { app_id: appId, deliverables: deliverablePaths } })
        }
        await db.from('conversations').update({ updated_at: now() }).eq('id', conversationId)
        await recordUsage(db, usageRows)
        send({ type: 'done', reason: 'end_turn' } as AgentEvent)
        controller.close()
      }
    },
  })

  return c.body(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
})

export { agentCoworkApp }
