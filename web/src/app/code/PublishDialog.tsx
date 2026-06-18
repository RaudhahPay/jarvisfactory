import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, Pencil, Plus, Check, Loader2, ExternalLink } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/web/src/app/ui/dialog';
import { Button } from '@/web/src/app/ui/button';
import { Input } from '@/web/src/app/ui/input';
import { BASE_DOMAIN, isValidSlug, isSlugAvailable } from '@/web/src/app/code/projectStore';

type Phase = 'idle' | 'publishing' | 'published';

/**
 * Publish modal. Edits the slug (validated: lowercase/hyphens/unique), then
 * Continue publishes. NOTE: there is no permanent deploy target yet — Continue
 * surfaces the live preview URL as the published URL and persists the slug. The
 * onPublish() seam is where a real Cloudflare/Blaxel deploy plugs in later.
 */
export function PublishDialog({
  open, onOpenChange, projectId, slug, previewUrl, onPublish,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  slug: string;
  previewUrl: string;
  onPublish: (slug: string) => string; // returns the published URL
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const [phase, setPhase] = useState<Phase>('idle');
  const [publishedUrl, setPublishedUrl] = useState('');

  const trimmed = draft.trim().toLowerCase();
  const slugError = !isValidSlug(trimmed)
    ? '3–63 chars, lowercase letters, numbers and hyphens'
    : !isSlugAvailable(trimmed, projectId)
      ? 'That URL is already taken'
      : '';
  const canContinue = !slugError && phase === 'idle';

  async function handleContinue() {
    if (!canContinue) return;
    setPhase('publishing');
    // Simulated deploy latency; swap for the real deploy call at the seam.
    await new Promise((r) => setTimeout(r, 1200));
    const url = onPublish(trimmed);
    setPublishedUrl(url);
    setPhase('published');
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (phase !== 'publishing') onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>Publish</DialogTitle>
          <a href="#" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Docs <HelpCircle className="h-3.5 w-3.5" />
          </a>
        </DialogHeader>

        {phase === 'published' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">Your app is live</p>
            <a href={publishedUrl} target="_blank" rel="noreferrer"
               className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              {publishedUrl.replace(/^https?:\/\//, '')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Button variant="outline" className="mt-2" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Your website URL</p>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                {editing ? (
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => setEditing(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
                    className="h-6 border-0 px-0 text-sm focus-visible:ring-0"
                  />
                ) : (
                  <span className="flex-1 truncate text-sm">
                    <span className="font-semibold">{trimmed || 'your-app'}</span>
                    <span className="text-muted-foreground">.{BASE_DOMAIN}</span>
                  </span>
                )}
                <button onClick={() => setEditing((e) => !e)} className="text-muted-foreground hover:text-foreground" title="Edit URL">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              {slugError && <p className="mt-1 text-xs text-red-500">{slugError}</p>}
            </div>

            <button
              onClick={() => { onOpenChange(false); navigate('/settings/domains'); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add custom domain
            </button>

            <div className="flex justify-end pt-2">
              <Button onClick={handleContinue} disabled={!canContinue}>
                {phase === 'publishing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {phase === 'publishing' ? 'Publishing…' : 'Continue'}
              </Button>
            </div>
            {!previewUrl && <p className="text-xs text-muted-foreground">Tip: build the app first so there's something to publish.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
