import { Globe, FileText, Code2, Layers } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/web/src/app/ui/tooltip';
import type { ViewMode } from '@/web/src/app/code/workspace';

const TABS: { id: ViewMode; label: string; icon: typeof Globe }[] = [
  { id: 'preview', label: 'Preview', icon: Globe },
  { id: 'file', label: 'Pages', icon: FileText },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'layers', label: 'Layers', icon: Layers },
];

/** Center cluster: view-mode tabs as icon buttons. Active is highlighted. */
export function ViewModeTabs({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5">
      {TABS.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => onChange(id)}
              aria-pressed={value === id}
              className={cn(
                'grid h-7 w-8 place-items-center rounded-md transition-colors',
                value === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
