import { useEffect, useState } from 'react';
import { Circle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/web/src/lib/api';

type Status = 'starting' | 'ready' | 'error';

/**
 * Code-tab execution surface. Calls POST /api/sandbox/start, which spins a real
 * Blaxel sandbox (when SANDBOX_PROVIDER=blaxel), runs a dev server, and returns the
 * live preview URL — rendered here in an iframe. The SandboxDriver seam is verified
 * by the conformance suite, so this works against stub or Blaxel unchanged.
 */
export function SandboxRunner({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status>('starting');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0); // bump to restart

  useEffect(() => {
    let cancelled = false;
    setStatus('starting');
    setError('');
    (async () => {
      try {
        const res = await apiFetch('/api/sandbox/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.previewUrl) throw new Error(json.error || `HTTP ${res.status}`);
        setPreviewUrl(json.previewUrl);
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to start sandbox');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, nonce]);

  return (
    <div className="flex h-full flex-col">
      {/* Browser-style toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex gap-1.5">
          <Circle className="h-3 w-3 fill-[#ff5f57] text-[#ff5f57]" />
          <Circle className="h-3 w-3 fill-[#febc2e] text-[#febc2e]" />
          <Circle className="h-3 w-3 fill-[#28c840] text-[#28c840]" />
        </div>
        <div className="ml-2 flex flex-1 items-center gap-2 truncate rounded-md bg-secondary px-3 py-1 text-xs text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'ready' ? 'bg-accent' : status === 'error' ? 'bg-[#ff5f57]' : 'bg-[#febc2e]'}`} />
          <span className="truncate">{previewUrl || 'app.preview.ezclaude.app'}</span>
        </div>
        <button onClick={() => setNonce((n) => n + 1)} className="grid h-6 w-6 place-items-center rounded hover:bg-secondary" title="Restart">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <a
          href={previewUrl || undefined}
          target="_blank"
          rel="noreferrer"
          className="grid h-6 w-6 place-items-center rounded hover:bg-secondary"
          title="Open in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>

      {/* Preview surface */}
      <div className="relative flex-1 bg-background">
        {status === 'ready' && previewUrl && (
          <iframe title="preview" src={previewUrl} className="h-full w-full border-0" />
        )}
        {status === 'starting' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <p className="text-sm font-medium">Booting sandbox…</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Starting a Blaxel sandbox and your dev server. First boot can take a few seconds.
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">Couldn't start the sandbox</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            <button onClick={() => setNonce((n) => n + 1)} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
