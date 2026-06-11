// ============================================================
// JARVISFACTORY v2 — Phase B: Cowork route
// ============================================================
// POST /api/agent/cowork  { conversationId?, appId?, task }
// Runs the real agent (with the Cowork briefing + skills at /opt/skills) inside a sandbox
// to produce deliverables. Reuses the spine: getAuthedDb, SandboxDriver, AgentRunner,
// build_jobs run-log, usage metering, conversations/messages threads. Files land in
// apps.files_json (downloadable). Same AgentEvent SSE shape as /api/build.
// ============================================================

import { NextRequest } from 'next/server'
import { getAuthedDb } from '@/lib/supabase/authed'
import { getSandboxDriver } from '@/lib/sandbox'
import { getAgentRunner } from '@/lib/agent'
import { buildCoworkPrompt } from '@/lib/agent/cowork'
import { validatePrompt } from '@/lib/agent/policy'
import { recordUsage, checkQuota } from '@/lib/metering'
import type { AgentEvent } from '@/lib/agent/types'
import type { SandboxFile } from '@/lib/sandbox/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const now = () => new Date().toISOString()

function appToFiles(app: any): SandboxFile[] {
  if (app?.files_json && typeof app.files_json === 'object') {
    return Object.entries(app.files_json as Record<string, unknown>).map(([path, content]) => ({ path, content: String(content) }))
  }
  return []
}

export async function POST(req: NextRequest) {
  const { user, db } = await getAuthedDb()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const pv = validatePrompt(body?.task || body?.prompt)
  if (!pv.ok) return Response.json({ error: pv.reason }, { status: 400 })
  const task = pv.value

  const quota = await checkQuota(db, user.id)
  if (!quota.ok) return Response.json({ error: quota.reason }, { status: 402 })

  // Workspace (apps row holds the sandbox + files) — create on first task.
  let appId: string | undefined = body?.appId
  if (!appId) {
    const { data, error } = await db
      .from('apps')
      .insert({ user_id: user.id, name: `Cowork: ${task.slice(0, 50)}`, description: task.slice(0, 200) })
      .select('id, sandbox_id, files_json')
      .single()
    if (error || !data) return Response.json({ error: `Could not create workspace: ${error?.message || 'unknown'}` }, { status: 500 })
    appId = data.id as string
  }
  const { data: app } = await db.from('apps').select('id, user_id, sandbox_id, files_json').eq('id', appId).single()
  if (!app) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  if (app.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })

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

        const runner = await getAgentRunner()
        await runner.start(sandbox, { projectId: appId, userId: user.id, prompt: buildCoworkPrompt(task), onEvent: send })

        // Persist the deliverables the agent produced.
        const snap = await sandbox.snapshot()
        const filesJson: Record<string, string> = {}
        for (const f of snap.files) filesJson[f.path] = f.content
        await db.from('apps').update({ files_json: filesJson, sandbox_last_active_at: now() }).eq('id', appId)

        if (job?.id) {
          await db.from('build_jobs').update({ status: 'succeeded', events: collected, sandbox_id: sandbox.id, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, finished_at: now(), updated_at: now() }).eq('id', job.id)
        }
      } catch (err: any) {
        send({ type: 'error', message: err?.message || 'Cowork run failed' })
        if (job?.id) await db.from('build_jobs').update({ status: 'failed', events: collected, error: err?.message || 'unknown', finished_at: now(), updated_at: now() }).eq('id', job.id)
      } finally {
        if (summary.trim()) {
          await db.from('messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'assistant', content: summary.slice(0, 8000), meta: { app_id: appId } })
        }
        await db.from('conversations').update({ updated_at: now() }).eq('id', conversationId)
        await recordUsage(db, usageRows)
        send({ type: 'done', reason: 'end_turn' } as AgentEvent)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
}
