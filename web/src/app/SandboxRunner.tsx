import { Circle, ExternalLink, RefreshCw } from 'lucide-react';

/**
 * The Code-tab execution surface. When real-preview wiring lands, this renders the
 * live Blaxel sandbox dev-server URL in the iframe (the SandboxDriver we verified
 * provides it via startDevServer/getPreviewUrl). For now it shows the framed runner
 * shell with a placeholder where the live preview will mount.
 */
export function SandboxRunner({ previewUrl }: { previewUrl?: string }) {
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
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="truncate">{previewUrl || 'app.preview.ezclaude.app'}</span>
        </div>
        <button className="grid h-6 w-6 place-items-center rounded hover:bg-secondary" title="Reload">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button className="grid h-6 w-6 place-items-center rounded hover:bg-secondary" title="Open">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Preview surface */}
      <div className="relative flex-1 bg-background">
        {previewUrl ? (
          <iframe title="preview" src={previewUrl} className="h-full w-full border-0" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">Live preview mounts here</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              When a build runs, the app executes in a Blaxel sandbox and its live
              dev-server URL renders in this frame.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
