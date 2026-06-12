'use client'
// ============================================================
// ezclaude — Studio workspace (Ask | Create | Build), Replit-style
// ============================================================
// One web app, three no-code modes on the shared engine. Layout is a Replit-like
// workspace: history rail · chat/agent column · right workspace panel with
// Preview / Code / Files tabs (live iframe for builds, file tree + viewer from
// apps.files_json, deliverable downloads for Create). All three modes stream from
// the server (SSE) and send the user's access token explicitly so RLS resolves
// to them.
//   Ask    → /api/agent/chat   (conversation)
//   Create → /api/agent/cowork (agent + skills → downloadable deliverables)
//   Build  → /api/build        (agent builds a real app in a sandbox + preview)
// ============================================================

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { MODELS, DEFAULT_MODEL } from '@/lib/models'

type Mode = 'chat' | 'cowork' | 'build'
type Line = { role: 'user' | 'assistant' | 'log'; text: string }
type Attachment = { name: string; type: string; data: string }
type Convo = { id: string; mode: Mode; title: string; app_id?: string; updated_at: string }
type RightTab = 'preview' | 'code' | 'out'
// DB stores build threads as mode 'code'; the UI calls that tab 'build'.
const uiMode = (m: string): Mode => (m === 'code' ? 'build' : (m as Mode))
type SessionState = {
  lines?: Line[]
  conversationId?: string
  appId?: string
  deliverables?: string[]
  previewUrl?: string
  files?: Record<string, string>
  activeFile?: string
}

// ---- Replit-inspired dark palette, ezclaude teal accent ----
const C = {
  bg: '#0e1525',
  panel: '#1c2333',
  panel2: '#171d2d',
  hover: '#2b3245',
  border: '#2b3245',
  border2: '#3c445c',
  teal: '#00e5b0',
  violet: '#8b7cf8',
  amber: '#f5a623',
  text: '#f5f9fc',
  dim: '#9da2b3',
  ui: "'DM Sans', system-ui, sans-serif",
  mono: "'Space Mono', ui-monospace, monospace",
}

const STARTERS: Record<Mode, string[]> = {
  chat: ['Explain my business idea back to me and poke holes in it', 'Draft a WhatsApp reply to a customer asking for a refund', 'Summarize the difference between SST and GST in Malaysia'],
  cowork: ['A 5-slide pitch deck for a halal food delivery startup', 'A monthly budget spreadsheet with charts for a small cafe', 'A one-page PDF proposal for social media management services'],
  build: ['A habit tracker with streaks and a dark theme', 'A landing page for my coffee brand with a menu section', 'An intermittent fasting timer with stage-by-stage info'],
}

// Read a browser File into the {name, type, base64} shape the routes expect.
function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve({ name: file.name, type: file.type || 'application/octet-stream', data: s.slice(s.indexOf(',') + 1) })
    }
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function fileIcon(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (['html', 'htm'].includes(ext)) return '🌐'
  if (ext === 'css') return '🎨'
  if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return '📜'
  if (['json', 'md', 'txt', 'csv'].includes(ext)) return '📄'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'].includes(ext)) return '🖼'
  if (['docx', 'pptx', 'xlsx', 'pdf'].includes(ext)) return '📦'
  return '📄'
}

// Minimal SSE reader: POST + stream `data: {json}` lines → onEvent. Sends the user's
// access token so server routes resolve RLS to this user.
async function streamPost(url: string, body: any, token: string | undefined, onEvent: (e: any) => void) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
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
  const [appId, setAppId] = useState<string | undefined>()
  const [deliverables, setDeliverables] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [convos, setConvos] = useState<Convo[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | undefined>()
  const [rightTab, setRightTab] = useState<RightTab>('preview')
  const [panelOpen, setPanelOpen] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Per-mode session buckets so switching tabs keeps each thread + workspace intact.
  const sessionsRef = useRef<Record<Mode, SessionState>>({ chat: {}, cowork: {}, build: {} })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth')
      else {
        setReady(true)
        fetchConvos()
      }
    })
  }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const snapshotSession = (): SessionState => ({ lines, conversationId, appId, deliverables, previewUrl, files, activeFile })

  function restoreSession(s: SessionState) {
    setLines(s.lines || [])
    setConversationId(s.conversationId)
    setAppId(s.appId)
    setDeliverables(s.deliverables || [])
    setPreviewUrl(s.previewUrl)
    setFiles(s.files || {})
    setActiveFile(s.activeFile)
  }

  function switchMode(m: Mode) {
    if (m === mode || busy) return
    sessionsRef.current[mode] = snapshotSession()
    setMode(m)
    restoreSession(sessionsRef.current[m] || {})
  }

  async function token(): Promise<string | undefined> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  async function fetchConvos() {
    const tok = await token()
    try {
      const res = await fetch('/api/conversations', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      if (res.ok) setConvos((await res.json()).conversations || [])
    } catch {}
  }

  // Pull the workspace artifacts (preview URL + file tree) the run produced.
  async function refreshWorkspace(id: string, opts?: { focusPreview?: boolean }) {
    const { data: app } = await supabase.from('apps').select('preview_url, files_json').eq('id', id).single()
    const fj = (app?.files_json as Record<string, string>) || {}
    setFiles(fj)
    const first = fj['index.html'] ? 'index.html' : Object.keys(fj).sort()[0]
    setActiveFile(a => a && fj[a] ? a : first)
    if (app?.preview_url) {
      setPreviewUrl(app.preview_url)
      setIframeKey(k => k + 1)
      if (opts?.focusPreview) setRightTab('preview')
    } else if (Object.keys(fj).length) {
      setRightTab(t => (t === 'preview' ? 'code' : t))
    }
    setPanelOpen(true)
  }

  function newChat() {
    setLines([])
    setConversationId(undefined)
    setAppId(undefined)
    setDeliverables([])
    setPreviewUrl(undefined)
    setFiles({})
    setActiveFile(undefined)
    setInput('')
    setAttachments([])
  }

  // Reload a past thread: restore mode, ids, messages, deliverables, and workspace.
  async function loadConvo(c: Convo) {
    if (busy) return
    sessionsRef.current[mode] = snapshotSession()
    const tok = await token()
    try {
      const res = await fetch(`/api/conversations/${c.id}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      if (!res.ok) return
      const data = await res.json()
      const m = uiMode(data.mode || c.mode)
      setMode(m)
      setConversationId(c.id)
      const aid = data.app_id || c.app_id
      setAppId(aid)
      setPreviewUrl(undefined)
      setFiles({})
      setActiveFile(undefined)
      const msgs: Line[] = (data.messages || [])
        .filter((x: any) => x.role === 'user' || x.role === 'assistant')
        .map((x: any) => ({ role: x.role, text: x.content }))
      setLines(msgs)
      const lastMeta = [...(data.messages || [])].reverse().find((x: any) => x.role === 'assistant' && x.meta?.deliverables)
      setDeliverables(lastMeta?.meta?.deliverables || [])
      if (lastMeta?.meta?.deliverables?.length) setRightTab('out')
      if (aid && m !== 'chat') await refreshWorkspace(aid)
    } catch {}
  }

  const addLine = (role: Line['role'], text: string) => setLines(l => [...l, { role, text }])

  async function copyText(text: string, i: number) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {}
      document.body.removeChild(ta)
    }
    setCopiedIdx(i)
    setTimeout(() => setCopiedIdx(c => (c === i ? null : c)), 1300)
  }

  async function pickFiles(list: FileList | null) {
    if (!list || !list.length) return
    const next = await Promise.all(Array.from(list).map(fileToAttachment))
    setAttachments(a => [...a, ...next])
    if (fileRef.current) fileRef.current.value = ''
  }

  function downloadActiveFile() {
    if (!activeFile) return
    const blob = new Blob([files[activeFile] || ''], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = activeFile.split('/').pop() || 'file.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if ((!text && attachments.length === 0) || busy) return
    const atts = attachments
    setInput('')
    setAttachments([])
    setBusy(true)
    addLine('user', atts.length ? `${text}${text ? '\n' : ''}📎 ${atts.map(a => a.name).join(', ')}` : text)
    const tok = await token()

    try {
      if (mode === 'chat') {
        let asst = ''
        addLine('assistant', '')
        await streamPost('/api/agent/chat', { conversationId, message: text, model, attachments: atts }, tok, e => {
          if (e.type === 'conversation') setConversationId(e.conversationId)
          else if (e.type === 'text') {
            asst += e.text
            setLines(l => l.map((ln, i) => (i === l.length - 1 ? { ...ln, text: asst } : ln)))
          } else if (e.type === 'error') addLine('log', '⚠ ' + e.message)
        })
      } else if (mode === 'cowork') {
        let coAppId = appId
        await streamPost('/api/agent/cowork', { conversationId, appId, task: text, model, attachments: atts }, tok, e => {
          if (e.type === 'meta') {
            setConversationId(e.conversationId)
            setAppId(e.appId)
            coAppId = e.appId
          } else if (e.type === 'tool_use') addLine('log', `🔧 ${String(e.tool).replace(/^mcp__sandbox__/, '')}`)
          else if (e.type === 'exec') addLine('log', `$ ${e.command}`)
          else if (e.type === 'file_edit') {
            addLine('log', `📄 ${e.action} ${e.path}`)
            setDeliverables(d => (d.includes(e.path) ? d : [...d, e.path]))
          } else if (e.type === 'text' && e.text?.trim()) addLine('assistant', e.text)
          else if (e.type === 'error') addLine('log', '⚠ ' + e.message)
        })
        if (coAppId) {
          setRightTab('out')
          await refreshWorkspace(coAppId)
        }
      } else {
        // build — create an app (project) then run the agent build, all in-page
        let id = appId
        if (!id) {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const { data, error } = await supabase
            .from('apps')
            .insert({ user_id: user!.id, name: text.slice(0, 60), description: text.slice(0, 200) })
            .select('id')
            .single()
          if (error || !data) {
            addLine('log', '❌ Could not create project: ' + (error?.message || 'unknown'))
            setBusy(false)
            return
          }
          id = data.id as string
          setAppId(id)
        }
        await streamPost('/api/build', { appId: id, prompt: text, model, attachments: atts, conversationId }, tok, e => {
          if (e.type === 'meta') {
            setConversationId(e.conversationId)
          } else if (e.type === 'tool_use') addLine('log', `🔧 ${String(e.tool).replace(/^mcp__sandbox__/, '')}`)
          else if (e.type === 'exec') addLine('log', `$ ${e.command}`)
          else if (e.type === 'file_edit') addLine('log', `📝 ${e.action} ${e.path}`)
          else if (e.type === 'text' && e.text?.trim()) addLine('assistant', e.text)
          else if (e.type === 'error') addLine('log', '⚠ ' + e.message)
        })
        await refreshWorkspace(id, { focusPreview: true })
        addLine('log', '✅ Build finished.')
      }
    } catch (err: any) {
      addLine('log', '❌ ' + (err?.message || 'failed'))
    } finally {
      setBusy(false)
      fetchConvos()
    }
  }

  if (!ready)
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.mono, fontSize: 14 }}>
        Loading ezclaude…
      </div>
    )

  const tabs: { id: Mode; label: string; hint: string; ph: string; empty: string }[] = [
    { id: 'chat', label: '💬 Ask', hint: 'Chat with Claude — ask anything', ph: 'Message Claude…', empty: 'Ask Claude anything — questions, drafts, ideas, explanations.' },
    { id: 'cowork', label: '✨ Create', hint: 'Make documents, decks, sheets, PDFs — no code', ph: 'Describe the document/deck/sheet you want…', empty: 'Describe what you want and Claude makes the file — it appears in the workspace panel, ready to download.' },
    { id: 'build', label: '⚡ Build', hint: 'Build & launch a real app — no code', ph: 'Describe the app you want to build…', empty: 'Describe an app and Claude builds it live — watch the preview appear on the right.' },
  ]
  const cur = tabs.find(t => t.id === mode)!
  const fileList = Object.keys(files).sort()
  const showPanel = mode !== 'chat' && panelOpen
  const panelTabs: { id: RightTab; label: string; show: boolean }[] = [
    { id: 'preview', label: '▶ Preview', show: mode === 'build' },
    { id: 'code', label: `</> Code${fileList.length ? ` (${fileList.length})` : ''}`, show: true },
    { id: 'out', label: `📦 Files${deliverables.length ? ` (${deliverables.length})` : ''}`, show: mode === 'cowork' },
  ]

  return (
    <div style={{ height: '100vh', background: C.bg, color: C.text, fontFamily: C.ui, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
      {/* ---- History rail ---- */}
      {sidebarOpen && (
        <aside style={{ width: 230, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.panel2 }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
            <button
              onClick={newChat}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1px solid ${C.teal}`, background: 'rgba(0,229,176,0.10)', color: C.teal, fontFamily: C.ui, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              + New
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {convos.length === 0 && <div style={{ color: C.dim, fontSize: 12, padding: 8 }}>No history yet.</div>}
            {convos.map(c => {
              const m = uiMode(c.mode)
              const icon = m === 'cowork' ? '✨' : m === 'build' ? '⚡' : '💬'
              const active = c.id === conversationId
              return (
                <button
                  key={c.id}
                  onClick={() => loadConvo(c)}
                  title={c.title}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: active ? C.hover : 'transparent',
                    color: active ? C.text : C.dim,
                    fontFamily: C.ui,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {icon} {c.title || 'Untitled'}
                </button>
              )
            })}
          </div>
        </aside>
      )}

      {/* ---- Main column ---- */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: C.panel2 }}>
          <button onClick={() => setSidebarOpen(o => !o)} title="Toggle history" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.dim, cursor: 'pointer', padding: '5px 10px', fontSize: 14 }}>
            ☰
          </button>
          <div style={{ fontWeight: 700, color: C.teal, letterSpacing: 1, fontFamily: C.mono }}>⬡ ezclaude</div>
          <div style={{ display: 'flex', gap: 4, background: C.bg, padding: 3, borderRadius: 10, border: `1px solid ${C.border}` }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => switchMode(t.id)}
                disabled={busy}
                title={t.hint}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: C.ui,
                  fontWeight: 600,
                  fontSize: 13,
                  border: 'none',
                  background: mode === t.id ? C.hover : 'transparent',
                  color: mode === t.id ? C.text : C.dim,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {mode !== 'chat' && (
              <button
                onClick={() => setPanelOpen(o => !o)}
                title="Toggle workspace panel"
                style={{ fontSize: 12, color: panelOpen ? C.teal : C.dim, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: C.ui }}
              >
                ◫ Workspace
              </button>
            )}
            <a
              href="/dashboard"
              target="_blank"
              rel="noreferrer"
              title="Your previously built apps (opens in a new tab)"
              style={{ fontSize: 12, color: C.violet, textDecoration: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: C.ui }}
            >
              ▤ My Apps ↗
            </a>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={busy}
              title="Choose the Claude model"
              style={{ background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontFamily: C.ui, fontSize: 12, outline: 'none', cursor: busy ? 'default' : 'pointer' }}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.blurb}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Workspace row: chat + right panel */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
          {/* ---- Chat column ---- */}
          <div style={{ flex: showPanel ? '0 0 44%' : 1, minWidth: 340, display: 'flex', flexDirection: 'column', borderRight: showPanel ? `1px solid ${C.border}` : 'none' }}>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lines.length === 0 && (
                <div style={{ margin: 'auto', textAlign: 'center', color: C.dim, maxWidth: 440 }}>
                  <div style={{ fontSize: 38, opacity: 0.25 }}>⬡</div>
                  <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{cur.empty}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
                    {STARTERS[mode].map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, color: C.text, fontFamily: C.ui, fontSize: 13, cursor: 'pointer', lineHeight: 1.4 }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {lines.map((ln, i) => (
                <div key={i} style={{ alignSelf: ln.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      padding: ln.role === 'log' ? '3px 10px' : '10px 14px',
                      borderRadius: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: ln.role === 'log' ? 11.5 : 14,
                      lineHeight: 1.55,
                      fontFamily: ln.role === 'log' ? C.mono : C.ui,
                      background: ln.role === 'user' ? 'rgba(139,124,248,0.16)' : ln.role === 'log' ? 'transparent' : C.panel,
                      border: ln.role === 'log' ? 'none' : `1px solid ${C.border}`,
                      color: ln.role === 'log' ? C.dim : C.text,
                    }}
                  >
                    {ln.text || (busy ? '…' : '')}
                  </div>
                  {ln.role !== 'log' && ln.text && (
                    <button
                      onClick={() => copyText(ln.text, i)}
                      title="Copy"
                      style={{
                        marginTop: 3,
                        alignSelf: ln.role === 'user' ? 'flex-end' : 'flex-start',
                        background: 'none',
                        border: 'none',
                        color: copiedIdx === i ? C.teal : C.dim,
                        cursor: 'pointer',
                        fontFamily: C.mono,
                        fontSize: 10,
                        padding: 0,
                      }}
                    >
                      {copiedIdx === i ? '✓ copied' : '⧉ copy'}
                    </button>
                  )}
                </div>
              ))}
              {busy && (
                <div style={{ alignSelf: 'flex-start', color: C.teal, fontSize: 12, fontFamily: C.mono }}>
                  ● {mode === 'chat' ? 'thinking…' : 'agent working…'}
                </div>
              )}
            </div>

            {/* attachments */}
            {attachments.length > 0 && (
              <div style={{ padding: '8px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {attachments.map((a, i) => (
                  <span key={i} style={{ fontSize: 11.5, color: C.violet, border: `1px solid ${C.border}`, borderRadius: 7, padding: '3px 8px', display: 'flex', gap: 6, alignItems: 'center', fontFamily: C.ui }}>
                    📎 {a.name}
                    <button onClick={() => setAttachments(list => list.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: 0 }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* input bar */}
            <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end', background: C.panel2 }}>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,.zip" onChange={e => pickFiles(e.target.files)} style={{ display: 'none' }} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                title="Attach documents, images, or a zip for Claude to study"
                style={{ padding: '0 13px', height: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: busy ? 'default' : 'pointer', fontSize: 16 }}
              >
                📎
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder={cur.ph}
                rows={2}
                style={{ flex: 1, resize: 'none', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '11px 13px', fontFamily: C.ui, fontSize: 14, outline: 'none' }}
              />
              <button
                onClick={() => send()}
                disabled={busy || (!input.trim() && attachments.length === 0)}
                style={{
                  padding: '0 20px',
                  height: 44,
                  borderRadius: 10,
                  border: 'none',
                  cursor: busy ? 'default' : 'pointer',
                  background: busy ? C.border : C.teal,
                  color: busy ? C.dim : '#04211a',
                  fontFamily: C.ui,
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {busy ? '…' : 'Send ↑'}
              </button>
            </div>
          </div>

          {/* ---- Right workspace panel (Replit-style) ---- */}
          {showPanel && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
              {/* panel tab bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 10px', borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
                {panelTabs
                  .filter(t => t.show)
                  .map(t => (
                    <button
                      key={t.id}
                      onClick={() => setRightTab(t.id)}
                      style={{
                        padding: '7px 13px',
                        borderRadius: 8,
                        border: 'none',
                        background: rightTab === t.id ? C.hover : 'transparent',
                        color: rightTab === t.id ? C.text : C.dim,
                        fontFamily: C.ui,
                        fontWeight: 600,
                        fontSize: 12.5,
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {rightTab === 'preview' && previewUrl && (
                    <>
                      <button onClick={() => setIframeKey(k => k + 1)} title="Reload preview" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, color: C.dim, cursor: 'pointer', padding: '4px 9px', fontSize: 12 }}>
                        ⟳
                      </button>
                      <a href={previewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, textDecoration: 'none', fontFamily: C.ui }}>
                        Open ↗
                      </a>
                    </>
                  )}
                  {rightTab === 'code' && activeFile && (
                    <>
                      <button onClick={() => copyText(files[activeFile] || '', -1)} title="Copy file" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, color: C.dim, cursor: 'pointer', padding: '4px 9px', fontSize: 12 }}>
                        ⧉
                      </button>
                      <button onClick={downloadActiveFile} title="Download file" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, color: C.dim, cursor: 'pointer', padding: '4px 9px', fontSize: 12 }}>
                        ↓
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* panel body */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {rightTab === 'preview' &&
                  (previewUrl ? (
                    <iframe key={iframeKey} src={previewUrl} style={{ flex: 1, border: 'none', background: '#fff' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
                  ) : (
                    <div style={{ margin: 'auto', color: C.dim, fontSize: 13, textAlign: 'center', padding: 30, lineHeight: 1.6 }}>
                      {busy ? '⚙ Building… the live preview appears here when it is ready.' : 'No preview yet — describe an app below and Build it. Your live app shows up here, like magic.'}
                    </div>
                  ))}

                {rightTab === 'code' &&
                  (fileList.length ? (
                    <>
                      <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 8, background: C.panel2 }}>
                        {fileList.map(f => (
                          <button
                            key={f}
                            onClick={() => setActiveFile(f)}
                            title={f}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: 'none',
                              background: activeFile === f ? C.hover : 'transparent',
                              color: activeFile === f ? C.text : C.dim,
                              fontFamily: C.mono,
                              fontSize: 11.5,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {fileIcon(f)} {f}
                          </button>
                        ))}
                      </div>
                      <pre style={{ flex: 1, margin: 0, padding: 16, overflow: 'auto', fontFamily: C.mono, fontSize: 12, lineHeight: 1.6, color: C.text, background: C.bg }}>
                        {activeFile ? files[activeFile] : 'Select a file'}
                      </pre>
                    </>
                  ) : (
                    <div style={{ margin: 'auto', color: C.dim, fontSize: 13, textAlign: 'center', padding: 30, lineHeight: 1.6 }}>
                      {busy ? '⚙ The agent is writing files — they appear here as the run finishes.' : 'Project files appear here after a run.'}
                    </div>
                  ))}

                {rightTab === 'out' &&
                  (deliverables.length ? (
                    <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {deliverables.map(d => (
                        <a
                          key={d}
                          href={appId ? `/api/agent/file?appId=${appId}&path=${encodeURIComponent(d)}` : '#'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: `1px solid ${C.border}`,
                            background: C.panel,
                            color: C.text,
                            textDecoration: 'none',
                            fontFamily: C.ui,
                            fontSize: 13.5,
                          }}
                        >
                          <span style={{ fontSize: 18 }}>{fileIcon(d)}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</span>
                          <span style={{ color: C.teal, fontSize: 12 }}>↓ Download</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ margin: 'auto', color: C.dim, fontSize: 13, textAlign: 'center', padding: 30, lineHeight: 1.6 }}>
                      {busy ? '⚙ Creating your files — downloads appear here when ready.' : 'Your documents, decks, and sheets appear here, ready to download.'}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
