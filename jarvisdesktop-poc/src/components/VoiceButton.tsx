import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

// Uses macOS WebKit's native Web Speech API. No external dependency.
// In Tauri, the WebView is WebKit on Mac, so SpeechRecognition is available.
declare global {
  interface Window {
    webkitSpeechRecognition?: any
    SpeechRecognition?: any
  }
}

export function VoiceButton({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    const r = new SR()
    r.continuous = false
    r.interimResults = false
    r.lang = 'en-US'
    r.onresult = (event: any) => {
      const text = event.results[0]?.[0]?.transcript ?? ''
      if (text) onTranscript(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recognitionRef.current = r
    return () => { try { r.stop() } catch {} }
  }, [onTranscript])

  function toggle() {
    if (!recognitionRef.current || disabled) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
    } else {
      recognitionRef.current.start()
      setListening(true)
    }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop listening' : 'Speak instead of typing'}
      className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
        listening
          ? 'bg-teal text-white animate-pulse-glow shadow-lg shadow-teal/40'
          : 'bg-white/5 hover:bg-white/10 text-mist hover:text-cloud'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {listening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      {listening ? (
        <span className="absolute inset-0 rounded-full ring-2 ring-teal/40 animate-pulse-glow" />
      ) : null}
    </button>
  )
}
