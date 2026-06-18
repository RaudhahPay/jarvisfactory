import { Circle, ExternalLink } from 'lucide-react';
import { PreviewLoadingState } from '@/web/src/app/code/PreviewLoadingState';
import type { BuildState } from '@/web/src/app/code/types';

/** Preview tab: live iframe of the running Vite dev server (when ready), a loading
 *  state while building/reloading, or a readable error — never a blank screen. */
export function PreviewPane({ build }: { build: BuildState }) {
  const { status, previewUrl, error, seq } = build;
  const src = previewUrl ? previewUrl + (previewUrl.includes('?') ? '&' : '?') + 'v=' + seq : '';
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <div className="ml-1 flex flex-1 items-center gap-2 truncate rounded-md bg-secondary px-3 py-1 text-xs text-muted-foreground">
          <Circle className={`h-2 w-2 ${status === 'ready' ? 'fill-emerald-500 text-emerald-500' : status === 'error' ? 'fill-red-500 text-red-500' : 'fill-amber-500 text-amber-500'}`} />
          <span className="truncate">{previewUrl || 'preview will appear here'}</span>
        </div>
        <a href={previewUrl || undefined} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded hover:bg-secondary" title="Open in new tab">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      </div>
      <div className="relative flex-1 bg-background">
        {status === 'ready' && src && <iframe title="preview" src={src} className="h-full w-full border-0" />}
        {status === 'building' && (
          <PreviewLoadingState
            label={seq > 0 ? 'Reloading preview…' : 'Building…'}
            detail="Generating the code, installing dependencies, and starting the dev server in a Blaxel sandbox. This can take up to a minute."
          />
        )}
        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium">Couldn't build the app</p>
            <pre className="max-h-64 max-w-xl overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-left text-xs text-muted-foreground">{error}</pre>
            <p className="text-xs text-muted-foreground">Ask for a change in the chat to rebuild.</p>
          </div>
        )}
      </div>
    </div>
  );
}
