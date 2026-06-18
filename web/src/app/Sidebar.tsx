import { MessageSquare, Sparkles, Code2, PanelLeft, Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Button } from '@/web/src/app/ui/button';
import { ScrollArea } from '@/web/src/app/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/web/src/app/ui/tooltip';
import type { AppTab } from '@/web/src/app/useAppState';

const TABS: { id: AppTab; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'cowork', label: 'Cowork', icon: Sparkles },
  { id: 'code', label: 'Code', icon: Code2 },
];

export function Sidebar({
  tab, setTab, collapsed, toggleCollapsed, hasProject, setHasProject,
}: {
  tab: AppTab;
  setTab: (t: AppTab) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  hasProject: boolean;
  setHasProject: (v: boolean) => void;
}) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn('flex h-14 items-center gap-2 px-3', collapsed && 'justify-center px-0')}>
        <div className="h-6 w-6 shrink-0 rounded-md bg-gradient-to-br from-accent to-[#7b6fff] shadow-sm" />
        {!collapsed && <span className="flex-1 text-[15px] font-bold tracking-tight">ezclaude</span>}
        <Button variant="ghost" size="iconSm" onClick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
          <PanelLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Tabs */}
      <nav className="flex flex-col gap-1 px-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          const btn = (
            <Button
              variant={active ? 'secondary' : 'ghost'}
              size={collapsed ? 'icon' : 'default'}
              onClick={() => setTab(id)}
              className={cn('w-full', !collapsed && 'justify-start', active && 'font-semibold')}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-muted-foreground')} />
              {!collapsed && <span>{label}</span>}
            </Button>
          );
          return collapsed ? (
            <Tooltip key={id}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={id}>{btn}</div>
          );
        })}
      </nav>

      {/* Per-tab context (hidden when collapsed) */}
      {!collapsed && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-border pt-3">
          <ContextPanel tab={tab} hasProject={hasProject} setHasProject={setHasProject} />
        </div>
      )}
    </aside>
  );
}

function ContextPanel({
  tab, hasProject, setHasProject,
}: { tab: AppTab; hasProject: boolean; setHasProject: (v: boolean) => void }) {
  const heading =
    tab === 'chat' ? 'Conversations' : tab === 'cowork' ? 'Workspaces' : 'Projects';

  return (
    <>
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</span>
        {tab === 'code' && (
          <Button variant="ghost" size="iconSm" title="New project" onClick={() => setHasProject(true)}>
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-1 pb-3">
          {tab === 'chat' &&
            ['Welcome to ezclaude', 'Loyalty app ideas', 'Untitled chat'].map((c) => (
              <button key={c} className="truncate rounded-md px-3 py-2 text-left text-sm text-foreground/80 hover:bg-secondary">
                {c}
              </button>
            ))}
          {tab === 'cowork' &&
            ['Draft pitch deck', 'Q3 report.xlsx'].map((c) => (
              <button key={c} className="truncate rounded-md px-3 py-2 text-left text-sm text-foreground/80 hover:bg-secondary">
                {c}
              </button>
            ))}
          {tab === 'code' &&
            (hasProject ? (
              <button className="truncate rounded-md bg-secondary px-3 py-2 text-left text-sm font-medium">
                my-app
              </button>
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">No projects yet.</p>
            ))}
        </div>
      </ScrollArea>
    </>
  );
}
