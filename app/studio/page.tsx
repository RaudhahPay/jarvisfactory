'use client'
// ============================================================
// JARVISFACTORY v2 — Phase C: unified Studio (Chat | Cowork | Build)
// ============================================================
// One web app, three modes on the shared engine:
//   Chat   → /api/agent/chat   (conversational, streaming)
//   Cowork → /api/agent/cowork (agent + skills → file deliverables, in a sandbox)
//   Build  → /builder          (the v2 app builder = Code mode)
// Inline styles to match the existing shell (no Tailwind).
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Mode = 'chat' | 'cowork' | 'build'
type Line = { role: 'user' | 'assistant' | 'log'; text: string }

const C = {
  bg: '#06070b',
  panel: '#0c0d12',
  border: '#1a1c25',
  teal: '#00e5b0',
  violet: '#8b7cf8',
  text: '#e6e7ea',
  dim: '#6f7079',
  mono: "'Space Mono', ui-monospace, monospace",
}

// Minimal SSE reader: POST + stream `data: {json}` lines → onEvent.
async function streamPost(url: string, body: any, onEvent: (e: any) => void) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {}
    throw new Error(msg)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const frames = buf.split('\n\n')
    buf = frames.pop() || ''
    for (const f of frames) {
      const line = f.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(6)))
      } catch {}
    }
  }
}

export default function StudioPage() {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('chat')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [coworkAppId, setCoworkAppId] = useState<string | undefined>()
  const [deliverables, setDeliverables] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth')
      else setReady(true)
    })
  }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  function switchMode(m: Mode) {
    if (m === 'build') {
      router.push('/builder')
      return
    }
    setMode(m)
    setLines([])
    setConversationId(undefined)
    setCoworkAppId(undefined)
    setDeliverables([])
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setLines(l => [...l, { role: 'user', text }])

    try {
      if (mode === 'chat') {
        let asst = ''
        setLines(l => [...l, { role: 'assistant', text: '' }])
        await streamPost('/api/agent/chat', { conversationId, message: text }, e => {
          if (e.type === 'conversation') setConversationId(e.conversationId)
          else if (e.type === 'text') {
            asst += e.text
            setLines(l => l.map((ln, i) => (i === l.length - 1 ? { ...ln, text: asst } : ln)))
          } else if (e.type === 'error') setLines(l => [...l, { role: 'log', text: '⚠ ' + e.message }])
        })
      } else {
        // cowork
        await streamPost('/api/agent/cowork', { conversationId, appId: coworkAppId, task: text }, e => {
          if (e.type === 'meta') {
            setConversationId(e.conversationId)
            setCoworkAppId(e.appId)
          } else if (e.type === 'tool_use') setLines(l => [...l, { role: 'log', text: `🔧 ${String(e.tool).replace(/^mcp__sandbox__/, '')}` }])
          else if (e.type === 'exec') setLines(l => [...l, { role: 'log', text: `$ ${e.command}` }])
          else if (e.type === 'file_edit') {
            setLines(l => [...l, { role: 'log', text: `📄 ${e.action} ${e.path}` }])
            setDeliverables(d => (d.includes(e.path) ? d : [...d, e.path]))
          } else if (e.type === 'text' && e.text?.trim()) setLines(l => [...l, { role: 'assistant', text: e.text }])
          else if (e.type === 'error') setLines(l => [...l, { role: 'log', text: '⚠ ' + e.message }])
        })
      }
    } catch (err: any) {
      setLines(l => [...l, { role: 'log', text: '❌ ' + (err?.message || 'failed') }])
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <div style={{ minHeight: '100vh', background: C.bg, color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: 14 }}>Loading Studio…</div>

  const tabs: { id: Mode; label: string; hint: string }[] = [
    { id: 'chat', label: '💬 Ask', hint: 'Chat with Claude — ask anything' },
    { id: 'cowork', label: '✨ Create', hint: 'Make documents, decks, sheets, PDFs — no code' },
    { id: 'build', label: '⚡ Build', hint: 'Build & launch a real app — no code' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontWeight: 700, color: C.teal, letterSpacing: 1 }}>⬡ ezclaude</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => switchMode(t.id)}
              title={t.hint}
              style={{
                padding: '8px 14px',
                borderRadius: 9,
                cursor: 'pointer',
                fontFamily: C.mono,
                fontSize: 12,
                border: `1px solid ${mode === t.id ? C.teal : C.border}`,
                background: mode === t.id ? 'rgba(0,229,176,0.12)' : 'transparent',
                color: mode === t.id ? C.teal : C.dim,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: C.dim }}>{tabs.find(t => t.id === mode)?.hint}</div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lines.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: C.dim, maxWidth: 460 }}>
            <div style={{ fontSize: 40, opacity: 0.2 }}>⬡</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              {mode === 'chat' ? 'Ask Claude anything — questions, drafts, ideas, explanations.' : 'Describe what you want and Claude makes it: “a 5-slide deck on X”, “turn this data into a spreadsheet”, “draft a contract as a Word doc”. No code.'}
            </div>
          </div>
        )}
        {lines.map((ln, i) => (
          <div key={i} style={{ alignSelf: ln.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            <div
              style={{
                padding: ln.role === 'log' ? '4px 10px' : '10px 14px',
                borderRadius: 12,
                whiteSpace: 'pre-wrap',
                fontSize: ln.role === 'log' ? 11 : 13,
                lineHeight: 1.5,
                background: ln.role === 'user' ? 'rgba(139,124,248,0.15)' : ln.role === 'log' ? 'transparent' : C.panel,
                border: ln.role === 'log' ? 'none' : `1px solid ${C.border}`,
                color: ln.role === 'log' ? C.dim : C.text,
              }}
            >
              {ln.text || '…'}
            </div>
          </div>
        ))}
      </div>

      {mode === 'cowork' && deliverables.length > 0 && (
        <div style={{ padding: '8px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.teal }}>📦 Deliverables:</span>
          {deliverables.map(d => (
            <a
              key={d}
              href={coworkAppId ? `/api/agent/file?appId=${coworkAppId}&path=${encodeURIComponent(d)}` : '#'}
              style={{ fontSize: 11, color: C.violet, textDecoration: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '3px 8px' }}
            >
              ↓ {d}
            </a>
          ))}
        </div>
      )}

      <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={mode === 'chat' ? 'Message Claude…' : 'Describe the deliverable you want…'}
          rows={2}
          style={{ flex: 1, resize: 'none', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '12px 14px', fontFamily: C.mono, fontSize: 13, outline: 'none' }}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          style={{ padding: '0 22px', borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer', background: busy ? C.border : C.teal, color: busy ? C.dim : '#000', fontFamily: C.mono, fontWeight: 700, fontSize: 13 }}
        >
          {busy ? '…' : 'Send ↑'}
        </button>
      </div>
    </div>
  )
}
