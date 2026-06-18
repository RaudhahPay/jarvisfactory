import { Database, Github } from 'lucide-react';
import { SectionHeader, Card } from '@/web/src/app/settings/parts';
import { Button } from '@/web/src/app/ui/button';
import { Badge } from '@/web/src/app/ui/badge';

const CONNECTORS = [
  { id: 'supabase', name: 'Supabase', desc: 'Database, auth and storage for your apps.', icon: Database, connected: false },
  { id: 'github', name: 'GitHub', desc: 'Push your project to a repository.', icon: Github, connected: false },
];

export function ConnectorsPanel() {
  return (
    <div>
      <SectionHeader title="Connectors" desc="Integrations available to your projects." />
      <div className="space-y-3">
        {CONNECTORS.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-secondary"><c.icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {c.connected
                    ? <Badge variant="secondary" className="text-[10px] text-emerald-600">Connected</Badge>
                    : <Badge variant="outline" className="text-[10px]">Not connected</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </div>
              <Button variant={c.connected ? 'outline' : 'default'} size="sm">
                {c.connected ? 'Disconnect' : 'Connect'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
