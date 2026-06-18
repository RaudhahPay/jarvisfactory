import { useEffect, useState } from 'react';
import { Circle, ExternalLink, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/web/src/lib/api';
import { PreviewLoadingState } from '@/web/src/app/code/PreviewLoadingState';

type Status = 'building' | 'ready' | 'error';
export type BuildReq = { prompt: string; seq: number };

/**
 * Right pane: generate the app from the prompt via the agent (/api/code/build),
 * which writes the generated index.html into the project's Blaxel sandbox, runs it,
 * and returns the live preview URL — rendered in the iframe. Each new build request
 * (initial prompt, then chat edits) re-runs and shows the loading state.
 */
export function PreviewPane({
  projectId, req, getCurrentHtml, onBuilt,
}: {
  projectId: string;
  req: BuildReq;
  getCurrentHtml: () => string | undefined;
  onBuilt: (html: string) => void;
}) {
  const [status, setStatus] = useState<Status>('building');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('building');
    setError('');
    (async () => {
      try {
        const res = await apiFetch('/api/code/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, prompt: req.prompt, currentHtml: getCurrentHtml() }),
        });
        const text = await res.text();
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
        if (cancelled) return;
        if (!text) throw new Error('API server not reachable — is the backend (port 3000) running? Try `bun run dev`.');
        if (!res.ok || !json.previewUrl) throw new Error(json.error || `HTTP ${res.status}`);
        if (json.html) onBuilt(json.html);
        // Cache-bust the iframe so each rebuild reloads the new output.
        setPreviewUrl(json.previewUrl + (json.previewUrl.includes('?') ? '&' : '?') + 'v=' + req.seq);
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Build failed');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, req.seq]);

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
            label={req.seq > 0 ? 'Applying your changes…' : 'Building your app…'}
            detail="ezClaude is generating the code and running it in a Blaxel sandbox. This can take ~10–30s."
          />
        )}
        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">Couldn't build the app</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> Ask for changes in the chat to rebuild.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
