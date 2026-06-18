import { SectionHeader, Card } from '@/web/src/app/settings/parts';
import { Button } from '@/web/src/app/ui/button';
import { Input } from '@/web/src/app/ui/input';
import { Avatar, AvatarFallback } from '@/web/src/app/ui/avatar';
import { Badge } from '@/web/src/app/ui/badge';

export function MembersPanel() {
  return (
    <div>
      <SectionHeader title="Members" desc="Invite people to collaborate on your projects." />
      <Card>
        <div className="flex gap-2">
          <Input placeholder="teammate@email.com" className="flex-1" />
          <Button>Invite</Button>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">N</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">nashih@brainybunch.com</p>
            <p className="text-xs text-muted-foreground">You</p>
          </div>
          <Badge variant="secondary" className="text-[10px]">Owner</Badge>
        </div>
      </Card>
    </div>
  );
}
