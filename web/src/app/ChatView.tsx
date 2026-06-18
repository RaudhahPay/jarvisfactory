import { useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { Button } from '@/web/src/app/ui/button';
import { ScrollArea } from '@/web/src/app/ui/scroll-area';

type Msg = { role: 'user' | 'assistant'; text: string };

export function ChatView() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: 'Hi! Ask me anything, or describe what you want to build.' },
  ]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    // TODO: wire to POST /api/agent/chat (SSE stream) once auth/session is in /app.
    // For now the shell echoes a placeholder so the UI flow is complete.
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'assistant', text: 'Got it — (the live agent response will stream here once /api/agent/chat is wired into this shell).' }]);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Chat</h1>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-8">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-card-foreground border border-border',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message ezclaude…"
            rows={1}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <Button size="icon" onClick={send} disabled={!input.trim()} className="rounded-xl">
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
