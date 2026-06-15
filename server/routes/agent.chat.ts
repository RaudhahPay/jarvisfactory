// ============================================================
// JARVISFACTORY v2 — Phase B: Chat mode (streaming, persisted) — Hono port
// ============================================================
// POST /api/agent/chat  { conversationId?, message }
// Conversational Claude over the Messages API (no sandbox/tools). Persists the thread
// to conversations/messages, streams text deltas as SSE, meters usage. Auth + RLS via
// getAuthedDb(); quota enforced before the call. Ported 1:1 from the Next.js route —
// only the framework wrapper changed (NextRequest → Hono context).
// ============================================================

import { Hono } from 'hono'
import { getAuthedDb } from '@/lib/supabase/authed'
import { validatePrompt } from '@/lib/agent/policy'
import { recordUsage, checkQuota } from '@/lib/metering'
import { resolveModel } from '@/lib/models'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// Rough Sonnet 4.6 pricing ($/token) for the usage ledger; refine centrally later.
const IN_COST = 3 / 1_000_000
const OUT_COST = 15 / 1_000_000

const now = () => new Date().toISOString()

const agentChatApp = new Hono()

agentChatApp.post('/api/agent/chat', async (c) => {
  const { user, db } = await getAuthedDb()
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const pv = validatePrompt(body?.message)
  if (!pv.ok) return c.json({ error: pv.reason }, 400)
  const message = pv.value
  const model = resolveModel(body?.model)
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []

  const quota = await checkQuota(db, user.id)
  if (!quota.ok) return c.json({ error: quota.reason }, 402)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return c.json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500)

  // Ensure a conversation (create on first message).
  let conversationId: string | undefined = body?.conversationId
  if (!conversationId) {
    const { data: conv, error } = await db
      .from('conversations')
      .insert({ user_id: user.id, mode: 'chat', title: message.slice(0, 80) })
      .select('id')
      .single()
    if (error || !conv) return c.json({ error: `Could not start conversation: ${error?.message || 'unknown'}` }, 500)
    conversationId = conv.id as string
  }

  // Persist the user turn, then load the full history for context.
  await db.from('messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'user', content: message })
  const { data: history } = await db
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  const messages = (history || [])
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({ role: m.role, content: m.content }))
  if (attachments.length && messages.length) {
    const last = messages[messages.length - 1]
    const blocks: any[] = [{ type: 'text', text: last.content }]
    for (const a of attachments) {
      if (typeof a?.type === 'string' && a.type.startsWith('image/') && a.data) blocks.push({ type: 'image', source: { type: 'base64', media_type: a.type, data: a.data } })
      else if (a?.type === 'application/pdf' && a.data) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } })
    }
    last.content = blocks as any
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      send({ type: 'conversation', conversationId })

      let full = ''
      let inTok = 0
      let outTok = 0
      try {
        const upstream = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model, max_tokens: 4096, messages, stream: true }),
        })
        if (!upstream.ok || !upstream.body) {
          let msg = `Anthropic ${upstream.status}`
          try {
            const j = await upstream.json()
            msg = j?.error?.message || msg
          } catch {}
          send({ type: 'error', message: msg })
          controller.close()
          return
        }
        const reader = upstream.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const events = buf.split('\n\n')
          buf = events.pop() || ''
          for (const block of events) {
            const line = block.split('\n').find(l => l.startsWith('data: '))
            if (!line) continue
            try {
              const p = JSON.parse(line.slice(6))
              if (p.type === 'content_block_delta' && p.delta?.type === 'text_delta') {
                full += p.delta.text
                send({ type: 'text', text: p.delta.text })
              } else if (p.type === 'message_start' && p.message?.usage) {
                inTok = p.message.usage.input_tokens || 0
              } else if (p.type === 'message_delta' && p.usage) {
                outTok = p.usage.output_tokens || outTok
              }
            } catch {
              /* ignore malformed event */
            }
          }
        }
      } catch (err: any) {
        send({ type: 'error', message: err?.message || 'Chat failed' })
      } finally {
        const costUsd = inTok * IN_COST + outTok * OUT_COST
        // Persist the assistant turn + meter usage (best-effort).
        if (full) {
          await db
            .from('messages')
            .insert({ conversation_id: conversationId, user_id: user.id, role: 'assistant', content: full, meta: { model: model, input_tokens: inTok, output_tokens: outTok } })
        }
        await db.from('conversations').update({ updated_at: now() }).eq('id', conversationId)
        await recordUsage(db, [
          { user_id: user.id, app_id: null, build_job_id: null, model: model, input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd },
        ])
        send({ type: 'done' })
        controller.close()
      }
    },
  })

  return c.body(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
})

export { agentChatApp }
