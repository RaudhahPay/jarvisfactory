import { Database } from 'lucide-react';

/** Cloud tab: Supabase view. Placeholder until DB wiring lands. */
export function CloudPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-secondary">
        <Database className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-lg font-semibold">Cloud</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Soon</span>
        </div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Connect a Supabase database, auth, and storage to your app. Ask in the
          chat to "add a database" — the connection status will show here.
        </p>
      </div>
    </div>
  );
}
