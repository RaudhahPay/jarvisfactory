import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@/web/src/lib/api'

// GitHub OAuth redirect lands here (?code / ?error). We POST the code to the
// Hono exchange endpoint (Bearer auth via apiFetch), then bounce to /dashboard
// with a result query param the Dashboard surfaces as a banner.
export default function GithubCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      navigate('/dashboard?github_error=' + encodeURIComponent(error))
      return
    }
    if (!code) {
      navigate('/dashboard?github_error=missing_code')
      return
    }

    let cancelled = false
    async function exchange() {
      try {
        const r = await apiFetch('/api/github/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (r.ok && data?.ok) {
          navigate('/dashboard?github=connected&as=' + encodeURIComponent(data.username || ''))
        } else {
          navigate('/dashboard?github_error=' + encodeURIComponent(data?.error || 'exchange_failed'))
        }
      } catch {
        if (!cancelled) navigate('/dashboard?github_error=exchange_failed')
      }
    }
    exchange()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Connecting GitHub…</div>
}
