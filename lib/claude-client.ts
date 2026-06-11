// ============================================================
// JARVISFACTORY v2 / Stage 4 — Layer-2: Claude client
// ============================================================
// Lifted verbatim from app/builder/page.tsx (commit 3bf4e45): callClaudeOnce,
// callClaude (retry wrapper), and callClaudeAgentic (tool-loop variant).
//
// Two component couplings were turned into injected dependencies — behavior is
// otherwise byte-identical:
//   - addLog(...)        → opts.onRetryLog(msg, level)   (transient-retry notices)
//   - buildMessages(...) → opts.buildMessages(userText)  (attachments/vision path;
//                          stays in the component because it reads `attachments` state)
//
// Exposed as a factory so the component builds it once with its own addLog +
// buildMessages, while the build pipeline receives { callClaude, callClaudeAgentic }
// through BuildDeps. All call sites keep their existing signatures.
// ============================================================

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export interface ClaudeClientOptions {
  // Called when a transient error triggers a retry. Maps to addLog(msg, level).
  onRetryLog?: (msg: string, level: string) => void
  // Builds the messages array for the attachments/vision path. When omitted,
  // useAttachments falls back to a plain text message (the pipeline never sets it).
  buildMessages?: (userText: string) => any[]
}

export interface ClaudeClient {
  callClaude: (sys: string, msg: string, maxTok?: number, useAttachments?: boolean, model?: string, imageDataUrl?: string) => Promise<string>
  callClaudeAgentic: (params: { system: string; messages: any[]; tools: any[]; max_tokens: number; model?: string }) => Promise<{ content: any[]; stop_reason?: string }>
}

export function createClaudeClient(opts: ClaudeClientOptions = {}): ClaudeClient {
  const { onRetryLog, buildMessages } = opts

  async function callClaudeOnce(sys: string, msg: string, maxTok: number, useAttachments: boolean, model?: string, imageDataUrl?: string): Promise<string> {
    let messages: any[]
    if (imageDataUrl) {
      // v9.7 Phase 4 — vision message: screenshot + text
      const m = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
      const mediaType = m?.[1] || 'image/jpeg'
      const base64 = m?.[2] || imageDataUrl.split(',')[1]
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: msg },
          ],
        },
      ]
    } else if (useAttachments && buildMessages) {
      messages = buildMessages(msg)
    } else {
      messages = [{ role: 'user', content: msg }]
    }
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: maxTok,
        system: sys,
        messages,
      }),
      keepalive: false,
    })

    let data: any
    try {
      data = await r.json()
    } catch {
      throw new Error(`Server returned non-JSON (${r.status} ${r.statusText})`)
    }

    if (!r.ok) {
      const e: any = new Error(data?.error?.message || `API error ${r.status}`)
      e.transient = r.status >= 500 || r.status === 429
      throw e
    }
    if (!data?.content?.[0]?.text) {
      throw new Error(`Claude returned an empty response: ${JSON.stringify(data).slice(0, 200)}`)
    }
    return data.content[0].text
  }

  // ── v7.4: Retry-on-transient-error wrapper.
  // Network blips, Anthropic 5xx, rate limits, and stream resets get up to 2 retries
  // with exponential backoff before bubbling the error up to approveBuild. ──
  async function callClaude(sys: string, msg: string, maxTok = 10000, useAttachments = false, model?: string, imageDataUrl?: string) {
    const MAX_ATTEMPTS = 3 // 1 initial + 2 retries
    let lastErr: any = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await callClaudeOnce(sys, msg, maxTok, useAttachments, model, imageDataUrl)
      } catch (err: any) {
        lastErr = err
        const isNetwork = /Failed to fetch|NetworkError|TypeError: Load failed|network error|stream|ECONN|ETIMED|read.*ECONNRESET|fetch failed|getaddrinfo|EAI_AGAIN|socket hang up/i.test(
          err?.message || ''
        )
        const retriable = isNetwork || err?.transient === true
        if (!retriable || attempt === MAX_ATTEMPTS) break
        const delayMs = 1500 * attempt // 1.5s, then 3s
        onRetryLog?.(`Transient error: ${err?.message?.slice(0, 80)} — retrying in ${(delayMs / 1000).toFixed(1)}s (${attempt}/${MAX_ATTEMPTS - 1})...`, 'warn')
        await new Promise(res => setTimeout(res, delayMs))
      }
    }
    // Exhausted retries — surface a clear message
    if (lastErr && /Failed to fetch|NetworkError|TypeError: Load failed|network error/i.test(lastErr?.message || '')) {
      throw new Error('Lost connection to JARVIS server after retries. Check your dev server is running and try again.')
    }
    throw lastErr || new Error('Claude call failed after retries.')
  }

  // ── v8.0: Agentic Claude call — supports tools and returns FULL content array ──
  // Used by the multi-turn Builder agent loop. Same retry semantics as callClaude.
  async function callClaudeAgentic(params: { system: string; messages: any[]; tools: any[]; max_tokens: number; model?: string }) {
    const MAX_ATTEMPTS = 3
    let lastErr: any = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: params.model || DEFAULT_MODEL,
            max_tokens: params.max_tokens,
            system: params.system,
            messages: params.messages,
            tools: params.tools,
          }),
        })
        let data: any
        try {
          data = await r.json()
        } catch {
          throw new Error(`Server returned non-JSON (${r.status})`)
        }
        if (!r.ok) {
          const e: any = new Error(data?.error?.message || `API error ${r.status}`)
          e.transient = r.status >= 500 || r.status === 429
          throw e
        }
        if (!Array.isArray(data?.content)) throw new Error('Server returned no content blocks')
        return { content: data.content, stop_reason: data.stop_reason }
      } catch (err: any) {
        lastErr = err
        const isNetwork = /Failed to fetch|NetworkError|TypeError: Load failed|network error|stream|ECONN|ETIMED|fetch failed|getaddrinfo|EAI_AGAIN|socket hang up/i.test(err?.message || '')
        const retriable = isNetwork || err?.transient === true
        if (!retriable || attempt === MAX_ATTEMPTS) break
        const delayMs = 1500 * attempt
        onRetryLog?.(`Agentic call transient error: ${err?.message?.slice(0, 80)} — retrying in ${(delayMs / 1000).toFixed(1)}s...`, 'warn')
        await new Promise(res => setTimeout(res, delayMs))
      }
    }
    throw lastErr || new Error('Agentic Claude call failed after retries.')
  }

  return { callClaude, callClaudeAgentic }
}
