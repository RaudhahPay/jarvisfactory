import { useState } from 'react'
import { Sparkles, Lock } from 'lucide-react'
import { saveApiKey } from '@/lib/api'

interface Props {
  onSaved: () => void
}

export function ApiKeyDialog({ onSaved }: Props) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!key.startsWith('sk-ant-')) {
      setError('That doesn\'t look like an Anthropic API key (should start with sk-ant-)')
      return
    }
    setBusy(true)
    try {
      await saveApiKey(key.trim())
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save key')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/95 backdrop-blur-xl animate-fade-in">
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-teal-glow" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Welcome to JarvisDesktop</h2>
            <p className="text-sm text-mist">Let&apos;s get you set up</p>
          </div>
        </div>

        <p className="text-sm text-cloud/80 leading-relaxed">
          JARVIS uses Claude (Anthropic) as its brain. Paste your API key once and
          it&apos;s stored securely in macOS Keychain — never leaves your Mac.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-xs font-medium uppercase tracking-wider text-mist flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Anthropic API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoComplete="off"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg bg-ink border border-slate/50 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none text-cloud font-mono text-sm placeholder:text-mist/40 transition-all"
            />
          </div>

          {error ? (
            <p className="text-sm text-coral" role="alert">{error}</p>
          ) : null}

          <button type="submit" disabled={busy || !key} className="btn-primary w-full">
            {busy ? 'Saving...' : 'Continue'}
          </button>

          <p className="text-xs text-mist text-center">
            Don&apos;t have one? Get one at{' '}
            <span className="text-teal-glow underline">console.anthropic.com</span>
          </p>
        </form>
      </div>
    </div>
  )
}
