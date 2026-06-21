import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { getSupabase } from '@/web/src/lib/supabase';
import { Button } from '@/web/src/app/ui/button';
import { createProject } from '@/web/src/app/code/projectStore';

/**
 * Empty state for /app/code — a centered Lovable-style prompt form. Never opens a
 * sandbox here. On submit it creates a project + id and navigates to
 * /app/code/:id, where the build starts.
 */
export function CodeLanding() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      const u = data.user;
      const full = (u?.user_metadata?.full_name as string) || u?.email?.split('@')[0] || '';
      setName(full.split(' ')[0] || '');
    }).catch(() => {});
    taRef.current?.focus();
  }, []);

  async function submit() {
    const text = prompt.trim();
    if (!text || creating) return;
    setCreating(true); setError('');
    try {
      const project = await createProject(text);
      navigate(`/app/code/${project.id}`);
    } catch (e: any) {
      setError(e?.message || 'Could not create the project.');
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold">Code</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          <h2 className="mb-6 text-center text-3xl font-bold tracking-tight">
            Ready to build{name ? `, ${name}` : ''}?
          </h2>

          <div className="flex flex-col gap-2 rounded-2xl border border-input bg-card p-3 shadow-sm">
            <textarea
              ref={taRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Describe the app you want to build…"
              rows={4}
              className="w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none"
            />
            <div className="flex justify-end">
              <Button onClick={submit} disabled={!prompt.trim() || creating} className="rounded-xl">
                {creating ? 'Creating…' : 'Build it'}
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            ezClaude will create a project and start building it live in a sandbox.
          </p>
        </div>
      </div>
    </div>
  );
}
