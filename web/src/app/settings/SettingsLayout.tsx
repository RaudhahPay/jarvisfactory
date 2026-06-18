import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TooltipProvider } from '@/web/src/app/ui/tooltip';
import { SettingsNav } from '@/web/src/app/settings/SettingsNav';

/** Full-page settings shell: persistent left nav + routed content pane. */
export function SettingsLayout() {
  const navigate = useNavigate();
  return (
    <TooltipProvider delayDuration={200}>
      <div className="ezc-app flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-sm font-semibold">Settings</span>
        </header>
        <div className="flex min-h-0 flex-1">
          <SettingsNav />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-8 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
