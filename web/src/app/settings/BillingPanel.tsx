import { SectionHeader, Card } from '@/web/src/app/settings/parts';
import { Button } from '@/web/src/app/ui/button';
import { Badge } from '@/web/src/app/ui/badge';
import { Progress } from '@/web/src/app/ui/progress';

export function BillingPanel() {
  const used = 32, total = 100;
  return (
    <div>
      <SectionHeader title="Billing & Credits" desc="Your plan and remaining build credits." />
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">Current plan <Badge variant="secondary" className="text-[10px]">PRO</Badge></div>
              <p className="text-xs text-muted-foreground">Renews monthly.</p>
            </div>
            <Button size="sm">Upgrade</Button>
          </div>
        </Card>
        <Card>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Credits remaining</span>
            <span className="tabular-nums font-medium">{total - used} / {total}</span>
          </div>
          <Progress value={(used / total) * 100} className="h-2" />
          <button className="mt-3 text-xs text-primary hover:underline">Get free credits</button>
        </Card>
      </div>
    </div>
  );
}
