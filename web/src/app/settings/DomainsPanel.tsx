import { useState } from 'react';
import { Globe, Plus, Pencil, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { SectionHeader, Card } from '@/web/src/app/settings/parts';
import { Button } from '@/web/src/app/ui/button';
import { Input } from '@/web/src/app/ui/input';
import { Badge } from '@/web/src/app/ui/badge';
import { DnsRecordsTable } from '@/web/src/app/settings/DnsRecordsTable';
import {
  listDomains, addDomain, removeDomain, setDomainStatus, isValidDomain, dnsRecords,
  type CustomDomain, type DomainStatus,
} from '@/web/src/app/settings/domainsStore';
import {
  listProjects, updateProject, isValidSlug, isSlugAvailable, BASE_DOMAIN,
} from '@/web/src/app/code/projectStore';

const STATUS_BADGE: Record<DomainStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'text-amber-600' },
  verified: { label: 'Verified', cls: 'text-emerald-600' },
  error: { label: 'Error', cls: 'text-red-600' },
};

function DefaultDomainCard() {
  // Edit the slug of the most-recent project as the "default domain".
  const project = listProjects()[0];
  const [slug, setSlug] = useState(project?.slug || '');
  const [editing, setEditing] = useState(false);
  const trimmed = slug.trim().toLowerCase();
  const err = !project ? '' : !isValidSlug(trimmed) ? 'Invalid slug' : !isSlugAvailable(trimmed, project.id) ? 'Already taken' : '';

  function save() {
    if (!project || err) return;
    updateProject(project.id, { slug: trimmed });
    setEditing(false);
  }

  if (!project) return <Card><p className="text-sm text-muted-foreground">Create a project to get a default domain.</p></Card>;

  return (
    <Card>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Default domain</p>
      <div className="flex items-center gap-2">
        {editing ? (
          <Input autoFocus value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} className="h-8 flex-1" />
        ) : (
          <span className="flex-1 truncate text-sm"><span className="font-semibold">{trimmed || 'your-app'}</span><span className="text-muted-foreground">.{BASE_DOMAIN}</span></span>
        )}
        <button onClick={() => setEditing((e) => !e)} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-secondary" title="Edit slug">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
    </Card>
  );
}

export function DomainsPanel() {
  const [domains, setDomains] = useState<CustomDomain[]>(() => listDomains());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [verifying, setVerifying] = useState('');

  const draftErr = draft && !isValidDomain(draft) ? 'Enter a valid domain (e.g. app.mybrand.com)' : '';

  function add() {
    if (!isValidDomain(draft)) return;
    addDomain(draft);
    setDomains(listDomains());
    setDraft(''); setAdding(false);
  }
  async function verify(d: CustomDomain) {
    setVerifying(d.id);
    await new Promise((r) => setTimeout(r, 1200)); // simulated DNS re-check
    setDomains(setDomainStatus(d.id, 'verified'));
    setVerifying('');
  }
  function remove(d: CustomDomain) {
    if (window.confirm(`Remove ${d.domain}? This can't be undone.`)) setDomains(removeDomain(d.id));
  }

  return (
    <div>
      <SectionHeader title="Domains" desc="Your default URL and any custom domains." />
      <div className="space-y-6">
        <DefaultDomainCard />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Custom domains</h3>
            {!adding && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add custom domain</Button>}
          </div>

          {adding && (
            <Card>
              <div className="flex gap-2">
                <Input autoFocus placeholder="app.mybrand.com" value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') add(); }} className="flex-1" />
                <Button onClick={add} disabled={!isValidDomain(draft)}>Add</Button>
                <Button variant="ghost" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</Button>
              </div>
              {draftErr && <p className="mt-1 text-xs text-red-500">{draftErr}</p>}
            </Card>
          )}

          {domains.length === 0 && !adding ? (
            <Card>
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Globe className="h-7 w-7 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No custom domains yet.</p>
                <p className="text-xs text-muted-foreground">Connect your own domain to give your app a branded URL.</p>
                <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add custom domain</Button>
              </div>
            </Card>
          ) : (
            <div className="mt-2 space-y-3">
              {domains.map((d) => {
                const badge = STATUS_BADGE[d.status];
                return (
                  <Card key={d.id}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-medium">{d.domain}</span>
                      <Badge variant="outline" className={`text-[10px] ${badge.cls}`}>{badge.label}</Badge>
                      <button onClick={() => remove(d)} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-red-500" title="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {d.status !== 'verified' && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">Add these records at your DNS provider, then verify:</p>
                        <DnsRecordsTable records={dnsRecords(d.domain)} />
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={verifying === d.id} onClick={() => verify(d)}>
                          {verifying === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Verify
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
