import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ArrowLeft, Settings, Plug, Copy, Pencil, Star, FolderInput,
  Info, Palette, HelpCircle, ExternalLink,
} from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/web/src/app/ui/dropdown-menu';
import { Badge } from '@/web/src/app/ui/badge';
import { Progress } from '@/web/src/app/ui/progress';

/**
 * Top-bar project name + dropdown. Functional items: Dashboard, Rename, Star,
 * Settings, Connectors. The rest are honest placeholders (no backend yet).
 */
export function ProjectMenu({
  name, statusText, starred, onRename, onToggleStar,
}: {
  name: string;
  statusText: string;
  starred?: boolean;
  onRename: () => void;
  onToggleStar: () => void;
}) {
  const navigate = useNavigate();
  // Placeholder credits until metering surfaces real numbers.
  const creditsUsed = 32, creditsTotal = 100;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-secondary">
          <div className="flex flex-col leading-tight">
            <span className="flex items-center gap-1 text-sm font-semibold">
              <span className="max-w-[180px] truncate">{name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <span className="truncate text-[11px] text-muted-foreground">{statusText}</span>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go to Dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center justify-between font-normal">
          <span className="truncate text-xs text-muted-foreground">nashih@brainybunch.com</span>
          <Badge variant="secondary" className="text-[10px]">PRO</Badge>
        </DropdownMenuLabel>

        <div className="px-2 py-1.5">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Credits</span>
            <span className="tabular-nums">{creditsTotal - creditsUsed} / {creditsTotal}</span>
          </div>
          <Progress value={(creditsUsed / creditsTotal) * 100} className="h-1.5" />
        </div>
        <DropdownMenuItem className="text-xs text-muted-foreground">Get free credits</DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate('/settings/general')}>
          <Settings className="mr-2 h-4 w-4" /> Settings
          <span className="ml-auto text-xs text-muted-foreground">⌘.</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/settings/connectors')}>
          <Plug className="mr-2 h-4 w-4" /> Connectors
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem disabled><Copy className="mr-2 h-4 w-4" /> Remix this project</DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}><Pencil className="mr-2 h-4 w-4" /> Rename project</DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleStar}>
          <Star className={cn('mr-2 h-4 w-4', starred && 'fill-amber-400 text-amber-400')} />
          {starred ? 'Unstar project' : 'Star project'}
        </DropdownMenuItem>
        <DropdownMenuItem disabled><FolderInput className="mr-2 h-4 w-4" /> Move to folder</DropdownMenuItem>
        <DropdownMenuItem disabled><Info className="mr-2 h-4 w-4" /> Details</DropdownMenuItem>
        <DropdownMenuItem disabled><Palette className="mr-2 h-4 w-4" /> Appearance <ChevronDown className="ml-auto h-3.5 w-3.5 -rotate-90" /></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled><HelpCircle className="mr-2 h-4 w-4" /> Help <ExternalLink className="ml-auto h-3.5 w-3.5" /></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
