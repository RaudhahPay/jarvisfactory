import { useEffect, useState } from 'react';
import { Circle, ExternalLink, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/web/src/lib/api';
import { PreviewLoadingState } from '@/web/src/app/code/PreviewLoadingState';

type Status = 'building' | 'ready' | 'error';

/**
 * Right pane of the project workspace. Boots the project's Blaxel sandbox via
 * POST /api/sandbox/start and renders the live dev-server URL in an iframe. Shows
 * a loading state while building/reloading; re-runs when `buildNonce` changes
 * (e.g. the user edits via chat).
 */
export function PreviewPane({
  projectId, prompt, buildNonce,
}: { projectId: string; prompt: string; buildNonce: number }) {
  const [status, setStatus] = useState<Status>('building');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('building');
    setError('');
    (async () => {
      try {
        const res = await apiFetch('/api/sandbox/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, prompt }),
        });
        const text = await res.text();
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
        if (cancelled) return;
        if (!text) throw new Error('API server not reachable — is the backend (port 3000) running? Try `bun run dev`.');
        if (!res.ok || !json.previewUrl) throw new Error(json.error || `HTTP ${res.status}`);
        setPreviewUrl(json.previewUrl + (json.previewUrl.includes('?') ? '&' : '?') + 'v=' + buildNonce);
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to start sandbox');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, buildNonce]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex gap-1.5">
          <Circle className="h-3 w-3 fill-[#ff5f57] text-[#ff5f57]" />
          <Circle className="h-3 w-3 fill-[#febc2e] text-[#febc2e]" />
          <Circle className="h-3 w-3 fill-[#28c840] text-[#28c840]" />
        </div>
        <div className="ml-2 flex flex-1 items-center gap-2 truncate rounded-md bg-secondary px-3 py-1 text-xs text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'ready' ? 'bg-accent' : status === 'error' ? 'bg-[#ff5f57]' : 'bg-[#febc2e]'}`} />
          <span className="truncate">{previewUrl || `${projectId}.preview.ezclaude.app`}</span>
        </div>
        <a href={previewUrl || undefined} target="_blank" rel="noreferrer" className="grid h-6 w-6 place-items-center rounded hover:bg-secondary" title="Open in new tab">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>

      <div className="relative flex-1 bg-background">
        {status === 'ready' && previewUrl && (
          <iframe title="preview" src={previewUrl} className="h-full w-full border-0" />
        )}
        {status === 'building' && (
          <PreviewLoadingState
            label={buildNonce > 0 ? 'Reloading preview…' : 'Building…'}
            detail="Running your app in a Blaxel sandbox. First boot can take a few seconds."
          />
        )}
        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">Couldn't start the sandbox</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> Edit in chat or retry to rebuild.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
