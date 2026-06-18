import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ChevronLeft } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Button } from '@/web/src/app/ui/button';
import { ScrollArea } from '@/web/src/app/ui/scroll-area';

type Msg = { role: 'user' | 'assistant'; text: string };

/**
 * Left pane of the project workspace — the chat for THIS project. Seeds the first
 * message from the project's prompt and kicks the initial build. Each subsequent
 * send re-triggers the preview via onRebuild().
 */
export function ProjectChatSidebar({
  projectId, name, prompt, onRebuild,
}: { projectId: string; name: string; prompt: string; onRebuild: () => void }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Seed from the project prompt + trigger the first build (once per project).
  useEffect(() => {
    setMessages([
      { role: 'user', text: prompt },
      { role: 'assistant', text: 'Building your app — the live preview will appear on the right.' },
    ]);
    onRebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: 'On it — rebuilding the preview…' }]);
    setInput('');
    // TODO: send to the agent (/api/agent/build) to regenerate files; for now this
    // re-triggers the sandbox preview so the iterate-via-chat loop is wired.
    onRebuild();
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      <header className="flex h-14 items-center gap-2 border-b border-border px-3">
        <Button variant="ghost" size="iconSm" title="All projects" onClick={() => navigate('/app/code')}>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
        <span className="truncate text-sm font-semibold">{name}</span>
      </header>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-background',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask for changes…"
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
          />
          <Button size="iconSm" onClick={send} disabled={!input.trim()} className="rounded-lg">
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
