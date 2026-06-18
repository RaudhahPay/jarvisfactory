import { useEffect, useState } from 'react';
import { FileCode, FileText, Folder } from 'lucide-react';
import { cn } from '@/web/src/lib/cn';
import { ScrollArea } from '@/web/src/app/ui/scroll-area';
import type { ProjectFile } from '@/web/src/app/code/types';

/** Code tab: file tree (left) + read-only file viewer (right). Mirrors the
 *  screenshot's explorer. (In-browser editing is a follow-up.) */
export function CodeExplorer({ files }: { files: ProjectFile[] }) {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!sorted.length) return;
    if (!sorted.some((f) => f.path === selected)) {
      setSelected(sorted.find((f) => f.path === 'src/App.jsx')?.path || sorted[0].path);
    }
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!files.length) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No files yet — build a project first.</div>;
  }

  const current = sorted.find((f) => f.path === selected);
  const Icon = (p: string) => (p.endsWith('.jsx') || p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.tsx') ? FileCode : FileText);

  return (
    <div className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Folder className="h-3.5 w-3.5" /> Files
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col py-1">
            {sorted.map((f) => {
              const I = Icon(f.path);
              return (
                <button
                  key={f.path}
                  onClick={() => setSelected(f.path)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary',
                    f.path === selected ? 'bg-secondary font-medium text-foreground' : 'text-foreground/80',
                  )}
                >
                  <I className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.path}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center border-b border-border px-4 font-mono text-xs text-muted-foreground">{current?.path}</div>
        <ScrollArea className="flex-1">
          <pre className="p-4 font-mono text-xs leading-relaxed text-foreground/90"><code>{current?.content}</code></pre>
        </ScrollArea>
      </div>
    </div>
  );
}
