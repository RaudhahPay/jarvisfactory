import { useState } from 'react';
import { Eye, Code2, Database } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { PreviewPane } from '@/web/src/app/code/PreviewPane';
import { CodeExplorer } from '@/web/src/app/code/CodeExplorer';
import { CloudPanel } from '@/web/src/app/code/CloudPanel';
import type { BuildState } from '@/web/src/app/code/types';

type Tab = 'preview' | 'code' | 'cloud';

/** Right pane: tabs (Preview default / Code / Cloud) that swap the view with no
 *  page reload. Active tab is highlighted. */
export function RightPaneTabs({ build }: { build: BuildState }) {
  const [tab, setTab] = useState<Tab>('preview');
  const tabs: { id: Tab; label: string; icon: typeof Eye; soon?: boolean }[] = [
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'cloud', label: 'Cloud', icon: Database, soon: true },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-1 border-b border-border bg-card px-2">
        {tabs.map(({ id, label, icon: Icon, soon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === id ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {soon && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">Soon</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'preview' && <PreviewPane build={build} />}
        {tab === 'code' && <CodeExplorer files={build.files} />}
        {tab === 'cloud' && <CloudPanel />}
      </div>
    </div>
  );
}
