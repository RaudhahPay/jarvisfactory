import { PreviewLoadingState } from '@/web/src/app/code/PreviewLoadingState';
import type { BuildPhase, BuildState } from '@/web/src/app/code/types';

const PHASE_DETAIL: Partial<Record<BuildPhase, string>> = {
  queued: 'Queued — waiting to start…',
  generating: 'Claude is writing the code…',
  writing: 'Uploading files to sandbox…',
  installing: 'Running npm install…',
  starting: 'Starting Vite dev server…',
};

/** Preview tab: live iframe of the running Vite dev server. `deviceWidth` (px)
 *  constrains the frame for the mobile device toggle; null = full width. */
export function PreviewPane({ build, deviceWidth }: { build: BuildState; deviceWidth: number | null }) {
  const { status, phase, previewUrl, error, seq } = build;
  const src = previewUrl ? previewUrl + (previewUrl.includes('?') ? '&' : '?') + 'v=' + seq : '';

  return (
    <div className="relative flex h-full w-full justify-center bg-muted/30">
      {status === 'ready' && src && (
        <iframe
          title="preview"
          src={src}
          className={deviceWidth ? 'h-full border-x border-border bg-background shadow-sm' : 'h-full w-full border-0 bg-background'}
          style={deviceWidth ? { width: deviceWidth } : undefined}
        />
      )}
      {status === 'building' && (
        <div className="flex h-full w-full items-center justify-center">
          <PreviewLoadingState
            label={seq > 0 ? 'Rebuilding…' : 'Building…'}
            detail={PHASE_DETAIL[phase] || 'Setting things up…'}
          />
        </div>
      )}
      {status === 'error' && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium">Couldn't build the app</p>
          <pre className="max-h-64 max-w-xl overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-left text-xs text-muted-foreground">{error}</pre>
          <p className="text-xs text-muted-foreground">Ask for a change in the chat to rebuild.</p>
        </div>
      )}
    </div>
  );
}
