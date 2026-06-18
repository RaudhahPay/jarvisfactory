import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Sparkles, Code2, PanelLeft, Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Button } from '@/web/src/app/ui/button';
import { ScrollArea } from '@/web/src/app/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/web/src/app/ui/tooltip';
import type { AppTab } from '@/web/src/app/useAppState';
import { listProjects } from '@/web/src/app/code/projectStore';

const TABS: { id: AppTab; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'cowork', label: 'Cowork', icon: Sparkles },
  { id: 'code', label: 'Code', icon: Code2 },
];

// Demo context items (until real persistence is wired). Each has a stable id so it
// deep-links to /app/<section>/<id>.
const ITEMS: Record<AppTab, { id: string; name: string }[]> = {
  chat: [
    { id: 'welcome', name: 'Welcome to ezclaude' },
    { id: 'loyalty', name: 'Loyalty app ideas' },
  ],
  cowork: [{ id: 'pitch', name: 'Draft pitch deck' }],
  code: [{ id: 'my-app', name: 'my-app' }],
};

function newId() {
  return Math.random().toString(36).slice(2, 8);
}

export function Sidebar({ collapsed, toggleCollapsed }: { collapsed: boolean; toggleCollapsed: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Active section + open id from the URL: /app/<section>/<id?>
  const [, , section, openId] = pathname.split('/'); // ['', 'app', section, id]
  const active = (section as AppTab) || 'chat';

  // Code projects come from the real registry; chat/cowork stay demo for now.
  const items = active === 'code'
    ? listProjects().map((p) => ({ id: p.id, name: p.name }))
    : ITEMS[active];

  // "+" — Code opens the landing form (describe → build); others open a new id.
  const onNew = () => navigate(active === 'code' ? '/app/code' : `/app/${active}/${newId()}`);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn('flex h-14 items-center gap-2 px-3', collapsed && 'justify-center px-0')}>
        <button onClick={() => navigate('/app')} className="h-6 w-6 shrink-0 rounded-md bg-gradient-to-br from-accent to-[#7b6fff] shadow-sm" aria-label="ezclaude home" />
        {!collapsed && <span className="flex-1 text-[15px] font-bold tracking-tight">ezclaude</span>}
        <Button variant="ghost" size="iconSm" onClick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
          <PanelLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Section tabs → routes */}
      <nav className="flex flex-col gap-1 px-2">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const btn = (
            <Button
              variant={isActive ? 'secondary' : 'ghost'}
              size={collapsed ? 'icon' : 'default'}
              onClick={() => navigate(`/app/${id}`)}
              className={cn('w-full', !collapsed && 'justify-start', isActive && 'font-semibold')}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-accent' : 'text-muted-foreground')} />
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

      {/* Per-section context (hidden when collapsed) */}
      {!collapsed && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-border pt-3">
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {active === 'chat' ? 'Conversations' : active === 'cowork' ? 'Workspaces' : 'Projects'}
            </span>
            <Button
              variant="ghost"
              size="iconSm"
              title={active === 'code' ? 'New project' : active === 'cowork' ? 'New workspace' : 'New chat'}
              onClick={onNew}
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-2">
            <div className="flex flex-col gap-1 pb-3">
              {items.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {active === 'code' ? 'No projects yet.' : 'Nothing here yet.'}
                </p>
              )}
              {items.map((it) => {
                const open = openId === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => navigate(`/app/${active}/${it.id}`)}
                    className={cn(
                      'truncate rounded-md px-3 py-2 text-left text-sm hover:bg-secondary',
                      open ? 'bg-secondary font-medium text-foreground' : 'text-foreground/80',
                    )}
                  >
                    {it.name}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </aside>
  );
}
