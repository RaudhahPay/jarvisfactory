import { Sparkles, FileText, Table, Presentation } from 'lucide-react';
import { Button } from '@/web/src/app/ui/button';

export function CoworkView() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Cowork</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/10">
          <Sparkles className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Cowork workspace</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Describe a document, deck, or spreadsheet and ezclaude produces the real
            file for you to download.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { icon: FileText, label: 'Document' },
            { icon: Presentation, label: 'Slide deck' },
            { icon: Table, label: 'Spreadsheet' },
          ].map(({ icon: Icon, label }) => (
            <Button key={label} variant="outline">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
