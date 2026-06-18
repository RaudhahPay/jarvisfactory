import { FileText } from 'lucide-react';

/** "Pages" view — placeholder. Generated apps are single-page today; this lists
 *  the routes once multi-page generation lands. */
export function PagesPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center gap-2 border-b border-border bg-card px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" /> Pages
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <FileText className="h-8 w-8 opacity-40" />
        <p>This app has a single page.</p>
        <p className="text-xs">Multi-page routing is coming soon.</p>
      </div>
    </div>
  );
}
