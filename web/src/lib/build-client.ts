// Copied from lib/build-client.ts during A5; lib/ original deleted at D4.
// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: build stream client
// ============================================================
// Browser-side client for POST /api/build. Streams the server's Server-Sent-Events
// (one JSON AgentEvent per `data:` frame) and invokes onEvent for each. Pure and
// transport-only — the UI mapping lives in web/src/routes/builder/useV2Build.ts.
// ============================================================

import type { AgentEvent } from '@/lib/agent/types'
import { apiFetch } from '@/web/src/lib/api'

export interface StreamBuildOpts {
  appId: string
  prompt: string
  signal?: AbortSignal
}

export async function streamBuild(opts: StreamBuildOpts, onEvent: (e: AgentEvent) => void): Promise<void> {
  const res = await apiFetch('/api/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: opts.appId, prompt: opts.prompt }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    let msg = `Build request failed (${res.status})`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {
      /* keep default */
    }
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flushFrame = (frame: string) => {
    const line = frame.split('\n').find(l => l.startsWith('data: '))
    if (!line) return
    try {
      onEvent(JSON.parse(line.slice(6)) as AgentEvent)
    } catch {
      /* ignore malformed frame */
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || '' // keep the trailing partial frame
    for (const frame of frames) flushFrame(frame)
  }
  if (buffer.trim()) flushFrame(buffer)
}
