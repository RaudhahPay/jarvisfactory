import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/web/src/app/ui/tooltip';
import { Sidebar } from '@/web/src/app/Sidebar';
import { useSidebar } from '@/web/src/app/useAppState';

/**
 * ezClaude desktop-style shell — shared layout (collapsible sidebar + main pane).
 * Each section (Chat / Cowork / Code) is its own route under /app, rendered into
 * the <Outlet/>; the active section is derived from the URL (see Sidebar), and
 * specific chats/projects open via id routes (/app/chat/:id, /app/code/:id).
 * Sidebar collapse persists across reloads. Scoped under `.ezc-app` so the legacy
 * inline-style pages are untouched.
 */
export default function AppShell() {
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ezc-app flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar collapsed={collapsed} toggleCollapsed={toggleCollapsed} />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
