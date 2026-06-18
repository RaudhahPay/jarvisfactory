import { Loader2 } from 'lucide-react';

export function PreviewLoadingState({ label = 'Building…', detail }: { label?: string; detail?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
      <p className="text-sm font-medium">{label}</p>
      {detail && <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
