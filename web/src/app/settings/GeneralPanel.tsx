import { useState } from 'react';
import { SectionHeader, Card } from '@/web/src/app/settings/parts';
import { Input } from '@/web/src/app/ui/input';
import { Label } from '@/web/src/app/ui/label';
import { cn } from '@/web/src/lib/cn';

export function GeneralPanel() {
  const [appearance, setAppearance] = useState<'light' | 'dark' | 'system'>('system');
  const [buildMode, setBuildMode] = useState<'Build' | 'Chat'>('Build');

  return (
    <div>
      <SectionHeader title="General" desc="Account name, defaults and appearance." />
      <div className="space-y-4">
        <Card>
          <Label className="text-xs text-muted-foreground">Account name</Label>
          <Input defaultValue="Brainy Bunch" className="mt-1.5" />
        </Card>
        <Card>
          <Label className="text-xs text-muted-foreground">Default build mode</Label>
          <div className="mt-1.5 flex gap-2">
            {(['Build', 'Chat'] as const).map((m) => (
              <button key={m} onClick={() => setBuildMode(m)}
                className={cn('rounded-md border px-3 py-1.5 text-sm', buildMode === m ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:bg-secondary')}>
                {m}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <Label className="text-xs text-muted-foreground">Appearance</Label>
          <div className="mt-1.5 flex gap-2">
            {(['light', 'dark', 'system'] as const).map((a) => (
              <button key={a} onClick={() => setAppearance(a)}
                className={cn('rounded-md border px-3 py-1.5 text-sm capitalize', appearance === a ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground hover:bg-secondary')}>
                {a}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
