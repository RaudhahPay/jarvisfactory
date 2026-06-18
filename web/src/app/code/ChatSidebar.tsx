import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, Mic, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Button } from '@/web/src/app/ui/button';
import { ScrollArea } from '@/web/src/app/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/web/src/app/ui/dropdown-menu';
import type { BuildPhase } from '@/web/src/app/code/types';

type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'edit'; title: string; ts: number };

const PHASE_LABELS: Record<BuildPhase, string> = {
  queued: 'Queued…',
  generating: 'Writing code…',
  writing: 'Uploading to sandbox…',
  installing: 'Installing dependencies…',
  starting: 'Starting dev server…',
  ready: 'Ready!',
  error: 'Build failed',
};

const CHIPS = ['Verify styles build', 'Improve the layout', 'Add dark mode'];

/** Left chat pane of the workspace: edit history (cards), suggestion chips, and
 *  the composer (Ask… + build-mode + mic + send). Lives inside the full-screen
 *  workspace; the project name/back live in the top bar. */
export function ChatSidebar({
  prompt, onSend, building = false, phase, phaseLog,
}: {
  prompt: string;
  onSend: (message: string) => void;
  building?: boolean;
  phase?: BuildPhase;
  phaseLog?: { phase: BuildPhase; detail?: string }[];
}) {
  const [entries, setEntries] = useState<Entry[]>([{ kind: 'user', text: prompt }]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'Build' | 'Chat'>('Build');
  const endRef = useRef<HTMLDivElement>(null);
  const wasBuilding = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries, phase]);

  // When a build finishes, drop an edit-history card.
  useEffect(() => {
    if (wasBuilding.current && !building && phase === 'ready') {
      setEntries((e) => [...e, { kind: 'edit', title: 'Updated the app', ts: Date.now() }]);
    }
    wasBuilding.current = building;
  }, [building, phase]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || building) return;
    setEntries((e) => [...e, { kind: 'user', text: t }]);
    setInput('');
    onSend(t);
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {entries.map((e, i) =>
            e.kind === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground">{e.text}</div>
              </div>
            ) : (
              <div key={i} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> {e.title}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Details</button>
                  <button className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Preview</button>
                </div>
              </div>
            ),
          )}

          {building && phase && (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-col gap-1.5">
                {(phaseLog || []).map((p, i) => {
                  const isActive = i === (phaseLog || []).length - 1;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {isActive ? <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        : <span className="flex h-3 w-3 items-center justify-center text-emerald-500">✓</span>}
                      <span className={cn(isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {p.detail || PHASE_LABELS[p.phase]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c} disabled={building} onClick={() => submit(c)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50">
              {c}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-input bg-background p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); } }}
            placeholder={building ? (PHASE_LABELS[phase || 'queued']) : 'Ask…'}
            rows={1}
            disabled={building}
            className="max-h-32 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-secondary">
                  {mode} <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setMode('Build')}>Build</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('Chat')}>Chat</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-1">
              <button className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary" title="Voice (soon)">
                <Mic className="h-4 w-4" />
              </button>
              <Button size="icon" onClick={() => submit(input)} disabled={!input.trim() || building} className="h-7 w-7 rounded-lg">
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
