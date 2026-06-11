import { useEffect, useRef } from 'react'
import { Sparkles, FileText, FileEdit, Terminal, Brain, CheckCircle2, BookOpen } from 'lucide-react'
import type { ChatMessage, ProgressEvent } from '@/lib/types'

interface Props {
  messages: ChatMessage[]
  liveEvents?: ProgressEvent[]
  showDetails?: boolean
}

export function MessageList({ messages, liveEvents, showDetails }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, liveEvents])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
      {messages.length === 0 && !liveEvents?.length ? <EmptyState /> : null}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} showDetails={showDetails} />
      ))}
      {liveEvents && liveEvents.length > 0 ? (
        <LiveProgress events={liveEvents} />
      ) : null}
      <div ref={endRef} />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full min-h-[50vh] flex items-center justify-center animate-fade-in">
      <div className="text-center space-y-3 max-w-md">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-teal/15 items-center justify-center mb-2">
          <Sparkles className="w-8 h-8 text-teal-glow" />
        </div>
        <h1 className="font-display text-3xl font-bold text-cloud">Hi Coach, what do you want to build today?</h1>
        <p className="text-mist text-base leading-relaxed">
          Describe your idea in plain words. JARVIS will figure out the rest.<br />
          Try: <span className="text-cloud">&ldquo;A markdown notes app for my Mac&rdquo;</span>, or <span className="text-cloud">&ldquo;Automate renaming my Downloads folder&rdquo;</span>.
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message, showDetails }: { message: ChatMessage; showDetails?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] bg-teal text-white rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[85%] space-y-2">
        {message.events && message.events.length > 0 ? (
          <ProgressList events={message.events} compact />
        ) : null}
        <div className="bg-white/[0.04] border border-white/5 rounded-2xl rounded-bl-md px-4 py-3">
          <p className="whitespace-pre-wrap text-cloud leading-relaxed">{message.text}</p>
        </div>
        {showDetails && message.toolCalls && message.toolCalls.length > 0 ? (
          <details className="text-xs text-mist mt-2">
            <summary className="cursor-pointer hover:text-cloud">Show details ({message.toolCalls.length} tool calls)</summary>
            <pre className="mt-2 bg-ink/60 rounded-lg p-3 overflow-x-auto text-xs font-mono">{JSON.stringify(message.toolCalls, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </div>
  )
}

function LiveProgress({ events }: { events: ProgressEvent[] }) {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[85%] glass rounded-2xl rounded-bl-md p-4 progress-shimmer">
        <ProgressList events={events} />
      </div>
    </div>
  )
}

function ProgressList({ events, compact }: { events: ProgressEvent[]; compact?: boolean }) {
  return (
    <ul className={`space-y-1.5 ${compact ? 'text-sm text-mist' : 'text-cloud'}`}>
      {events.map((e, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <ProgressIcon event={e} />
          <span className="leading-snug">{describe(e)}</span>
        </li>
      ))}
    </ul>
  )
}

function ProgressIcon({ event }: { event: ProgressEvent }) {
  const cls = 'w-4 h-4 mt-0.5 flex-shrink-0'
  switch (event.kind) {
    case 'thinking': return <Brain className={`${cls} text-teal-glow`} />
    case 'writing': return <FileEdit className={`${cls} text-gold`} />
    case 'reading': return <FileText className={`${cls} text-mist`} />
    case 'running': return <Terminal className={`${cls} text-teal`} />
    case 'memorized': return <BookOpen className={`${cls} text-sage`} />
    case 'done': return <CheckCircle2 className={`${cls} text-sage`} />
  }
}

function describe(e: ProgressEvent): string {
  switch (e.kind) {
    case 'thinking': return e.text || 'Thinking…'
    case 'writing':  return `Writing ${e.file}`
    case 'reading':  return `Reading ${e.file}`
    case 'running':  return `Running \`${e.command}\``
    case 'memorized':return `Remembered: ${e.fact}`
    case 'done':     return e.summary
  }
}
