import { useEffect, useState } from 'react'
import { Settings2, FolderOpen } from 'lucide-react'
import { ApiKeyDialog } from './components/ApiKeyDialog'
import { ChatInput } from './components/ChatInput'
import { MessageList } from './components/MessageList'
import {
  isApiKeySet,
  startAgentRun,
  abortAgentRun,
  onAgentProgress,
  onAgentDone,
  onAgentError,
  openProjectInBrowser,
  getActiveProject,
} from './lib/api'
import type { ChatMessage, ProgressEvent, Project } from './lib/types'

export default function App() {
  const [needsKey, setNeedsKey] = useState<boolean | null>(null) // null = checking
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [liveEvents, setLiveEvents] = useState<ProgressEvent[]>([])
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [activeProject, setActiveProject] = useState<Project | null>(null)

  // First-launch key check
  useEffect(() => {
    isApiKeySet().then((set) => setNeedsKey(!set)).catch(() => setNeedsKey(true))
  }, [])

  // Load active project context
  useEffect(() => {
    if (needsKey === false) {
      getActiveProject().then(setActiveProject).catch(() => {})
    }
  }, [needsKey])

  async function send(prompt: string) {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', text: prompt, createdAt: Date.now(),
    }
    setMessages((m) => [...m, userMsg])
    setLiveEvents([])

    // ── KEY FIX ── pre-generate runId and subscribe to events BEFORE invoking
    // the agent. Tauri's emit() drops events with no listener attached, so
    // subscribing after the invoke was racing the first emit. The Rust side
    // ALSO sleeps 80ms before the first emit as a belt-and-braces safeguard.
    const runId = crypto.randomUUID()
    setCurrentRunId(runId)

    const liveBuffer: ProgressEvent[] = []
    const unlistenAll: Array<() => void> = []

    unlistenAll.push(await onAgentProgress(runId, (event) => {
      liveBuffer.push(event)
      setLiveEvents([...liveBuffer])
    }))
    unlistenAll.push(await onAgentDone(runId, (summary) => {
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: summary.finalMessage,
        events: [...liveBuffer],
        createdAt: Date.now(),
      }
      setMessages((m) => [...m, assistantMsg])
      setLiveEvents([])
      setCurrentRunId(null)
      for (const u of unlistenAll) u()
      if (summary.projectPath) {
        getActiveProject().then(setActiveProject).catch(() => {})
      }
    }))
    unlistenAll.push(await onAgentError(runId, (err) => {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Something went wrong: ${err}`,
        createdAt: Date.now(),
      }
      setMessages((m) => [...m, errorMsg])
      setLiveEvents([])
      setCurrentRunId(null)
      for (const u of unlistenAll) u()
    }))

    // All three listeners are now active — safe to start the run
    try {
      await startAgentRun(runId, prompt, activeProject?.id)
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Could not start the agent: ${err?.message ?? err}`,
        createdAt: Date.now(),
      }
      setMessages((m) => [...m, errorMsg])
      setCurrentRunId(null)
      for (const u of unlistenAll) u()
    }
  }

  async function abort() {
    if (!currentRunId) return
    await abortAgentRun(currentRunId)
    setCurrentRunId(null)
    setLiveEvents([])
  }

  if (needsKey === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-ink">
        <div className="text-mist text-sm">Starting JARVIS…</div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-ink bg-hero-gradient relative overflow-hidden">
      {/* Title bar with traffic light spacing */}
      <header className="flex items-center justify-between px-4 py-3 pl-20 select-none border-b border-white/5 backdrop-blur-xl bg-ink/40">
        <div className="flex items-center gap-2">
          <div className="font-display font-semibold text-cloud">JARVIS</div>
          {activeProject ? (
            <button
              onClick={() => openProjectInBrowser(activeProject.id)}
              className="btn-ghost text-sm gap-1.5"
              title="Open project folder"
            >
              <FolderOpen className="w-4 h-4" />
              {activeProject.name}
            </button>
          ) : null}
        </div>
        <button
          onClick={() => setShowDetails((s) => !s)}
          className="btn-ghost text-xs"
          title="Toggle tool-call details"
        >
          <Settings2 className="w-4 h-4" />
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
      </header>

      <MessageList messages={messages} liveEvents={liveEvents} showDetails={showDetails} />

      <div className="px-6 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSubmit={send} onAbort={abort} busy={!!currentRunId} />
          <p className="text-[11px] text-mist/60 text-center mt-2.5">
            ⌘+Enter sends. JARVIS sees only the project folder — your other files are safe.
          </p>
        </div>
      </div>

      {needsKey ? <ApiKeyDialog onSaved={() => setNeedsKey(false)} /> : null}
    </div>
  )
}
