import { useRef, useState, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { VoiceButton } from './VoiceButton'

interface Props {
  onSubmit: (text: string) => void
  onAbort?: () => void
  busy?: boolean
  placeholder?: string
}

export function ChatInput({ onSubmit, onAbort, busy, placeholder }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-grow up to ~6 lines
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [text])

  function submit() {
    const t = text.trim()
    if (!t || busy) return
    onSubmit(t)
    setText('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="glass rounded-2xl px-4 py-3 flex items-end gap-3 transition-all focus-within:ring-2 focus-within:ring-teal/30">
      <VoiceButton onTranscript={(t) => setText(text ? text + ' ' + t : t)} disabled={busy} />
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={placeholder ?? 'What do you want to build?'}
        disabled={busy}
        className="input-pill flex-1 py-2 max-h-[180px]"
      />
      {busy ? (
        <button onClick={onAbort} className="w-10 h-10 rounded-full bg-coral/15 hover:bg-coral/25 text-coral flex items-center justify-center transition-colors" title="Stop">
          <Square className="w-4 h-4 fill-current" />
        </button>
      ) : (
        <button onClick={submit} disabled={!text.trim()} className="w-10 h-10 rounded-full bg-teal hover:bg-teal-glow disabled:bg-slate/40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all" title="Send (↵)">
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
