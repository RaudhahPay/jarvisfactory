import { useNavigate } from 'react-router-dom';
import {
  History, PanelLeft, Monitor, Smartphone, RefreshCw, ChevronDown, ExternalLink, Share2,
} from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Button } from '@/web/src/app/ui/button';
import { Avatar, AvatarFallback } from '@/web/src/app/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/web/src/app/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/web/src/app/ui/dropdown-menu';
import { ProjectMenu } from '@/web/src/app/code/ProjectMenu';
import { ViewModeTabs } from '@/web/src/app/code/ViewModeTabs';
import type { ViewMode, DeviceMode } from '@/web/src/app/code/workspace';

function IconBtn({ title, onClick, active, children }: { title: string; onClick?: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
            active && 'bg-secondary text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceTopBar({
  name, statusText, starred, view, device, onView, onDevice, onRefresh, onToggleSidebar,
  onRename, onToggleStar, onPublish, previewUrl,
}: {
  name: string;
  statusText: string;
  starred?: boolean;
  view: ViewMode;
  device: DeviceMode;
  onView: (v: ViewMode) => void;
  onDevice: (d: DeviceMode) => void;
  onRefresh: () => void;
  onToggleSidebar: () => void;
  onRename: () => void;
  onToggleStar: () => void;
  onPublish: () => void;
  previewUrl: string;
}) {
  const navigate = useNavigate();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2">
      {/* Left cluster */}
      <div className="flex min-w-0 items-center gap-1">
        <button onClick={() => navigate('/')} title="ezClaude home"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md font-bold text-primary hover:bg-secondary">ez</button>
        <ProjectMenu name={name} statusText={statusText} starred={starred} onRename={onRename} onToggleStar={onToggleStar} />
        <div className="ml-1 flex items-center gap-0.5">
          <IconBtn title="Version history"><History className="h-4 w-4" /></IconBtn>
          <IconBtn title="Toggle chat" onClick={onToggleSidebar}><PanelLeft className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      {/* Center cluster */}
      <div className="flex items-center gap-2">
        <ViewModeTabs value={view} onChange={onView} />
        <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5">
          <IconBtn title="Desktop" active={device === 'desktop'} onClick={() => onDevice('desktop')}><Monitor className="h-4 w-4" /></IconBtn>
          <IconBtn title="Mobile" active={device === 'mobile'} onClick={() => onDevice('mobile')}><Smartphone className="h-4 w-4" /></IconBtn>
        </div>
        <IconBtn title="Refresh preview" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></IconBtn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
              Homepage <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem>Homepage</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <a href={previewUrl || undefined} target={previewUrl ? '_blank' : undefined} rel="noreferrer"
           className={cn('grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground', !previewUrl && 'pointer-events-none opacity-40')}
           title="Open in new tab">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">N</AvatarFallback></Avatar>
        <Button variant="outline" size="sm" className="h-8 gap-1.5"><Share2 className="h-3.5 w-3.5" /> Share</Button>
        <Button size="sm" className="h-8" onClick={onPublish}>Publish</Button>
      </div>
    </header>
  );
}
