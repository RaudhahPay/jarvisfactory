import { TooltipProvider } from '@/web/src/app/ui/tooltip';
import { Sidebar } from '@/web/src/app/Sidebar';
import { ChatView } from '@/web/src/app/ChatView';
import { CoworkView } from '@/web/src/app/CoworkView';
import { CodeView } from '@/web/src/app/CodeView';
import { useAppState } from '@/web/src/app/useAppState';

/**
 * ezClaude desktop-style shell — two panes (collapsible sidebar + main content),
 * Chat / Cowork / Code tabs that swap the right pane with no page reload. Active
 * tab and sidebar collapse persist across reloads (useAppState). Built with shadcn
 * primitives + Tailwind, scoped under `.ezc-app` so legacy inline-style pages are
 * untouched.
 */
export default function AppShell() {
  const { tab, setTab, collapsed, toggleCollapsed, hasProject, setHasProject } = useAppState();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ezc-app flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar
          tab={tab}
          setTab={setTab}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
          hasProject={hasProject}
          setHasProject={setHasProject}
        />
        <main className="min-w-0 flex-1">
          {tab === 'chat' && <ChatView />}
          {tab === 'cowork' && <CoworkView />}
          {tab === 'code' && <CodeView hasProject={hasProject} setHasProject={setHasProject} />}
        </main>
      </div>
    </TooltipProvider>
  );
}
