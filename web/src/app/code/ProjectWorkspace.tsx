import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getAccessToken } from '@/web/src/auth/session';
import { TooltipProvider } from '@/web/src/app/ui/tooltip';
import { WorkspaceTopBar } from '@/web/src/app/code/WorkspaceTopBar';
import { ChatSidebar } from '@/web/src/app/code/ChatSidebar';
import { PreviewPane } from '@/web/src/app/code/PreviewPane';
import { CodeExplorer } from '@/web/src/app/code/CodeExplorer';
import { CloudPanel } from '@/web/src/app/code/CloudPanel';
import { PagesPanel } from '@/web/src/app/code/PagesPanel';
import { PublishDialog } from '@/web/src/app/code/PublishDialog';
import { getProject, updateProject, BASE_DOMAIN, type Project } from '@/web/src/app/code/projectStore';
import { DEVICE_WIDTH, type DeviceMode, type ViewMode } from '@/web/src/app/code/workspace';
import type { BuildEvent, BuildPhase, BuildState, ProjectFile } from '@/web/src/app/code/types';

export type { BuildState, ProjectFile };

const STATUS_TEXT: Record<BuildState['status'], string> = {
  building: 'Building…',
  ready: 'Previewing latest version',
  error: 'Build failed',
};

export function ProjectWorkspace() {
  const { id } = useParams();

  const [project, setProject] = useState<Project | undefined>(undefined);
  const [load, setLoad] = useState<'loading' | 'ready' | 'notfound'>('loading');

  // The build/run trigger. mode 'run' = resume saved source (no model call);
  // 'build' = (re)generate. Set after the project loads, bumped on each chat send.
  const [req, setReq] = useState<{ mode: 'build' | 'run'; prompt: string; seq: number }>({ mode: 'build', prompt: '', seq: 0 });
  const [build, setBuild] = useState<BuildState>({ status: 'building', phase: 'queued', previewUrl: '', files: [], error: '', seq: 0 });
  const appFilesRef = useRef<ProjectFile[]>([]); // generated source for incremental edits + resume
  const [phaseLog, setPhaseLog] = useState<{ phase: BuildPhase; detail?: string }[]>([]);

  // Editor chrome state
  const [view, setView] = useState<ViewMode>('preview');
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [refreshSeq, setRefreshSeq] = useState(0);

  // 1) Load the project from the server. Decide resume vs first build from whether
  //    it already has saved source.
  useEffect(() => {
    if (!id) { setLoad('notfound'); return; }
    let live = true;
    setLoad('loading');
    getProject(id).then((p) => {
      if (!live) return;
      if (!p) { setLoad('notfound'); return; }
      setProject(p);
      appFilesRef.current = p.appFiles || [];
      setBuild((b) => ({ ...b, files: p.appFiles || [] }));
      setReq({ mode: (p.appFiles && p.appFiles.length ? 'run' : 'build'), prompt: p.prompt, seq: 0 });
      setLoad('ready');
    }).catch(() => { if (live) setLoad('notfound'); });
    return () => { live = false; };
  }, [id]);

  // 2) Run the build/resume whenever the trigger changes.
  useEffect(() => {
    if (load !== 'ready' || !project) return;
    let cancelled = false;
    const isRun = req.mode === 'run';

    setBuild((b) => ({ ...b, status: 'building', phase: 'queued', error: '', seq: req.seq }));
    setPhaseLog([{ phase: 'queued', detail: isRun ? 'Resuming saved project…' : 'Queued…' }]);
    const ctrl = new AbortController();

    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(isRun ? '/api/code/run' : '/api/code/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(
            isRun
              ? { projectId: project.id, appFiles: appFilesRef.current }
              : { projectId: project.id, prompt: req.prompt, currentFiles: appFilesRef.current },
          ),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          let msg = `HTTP ${res.status}`;
          try { const j = await res.json(); msg = j?.error || msg; } catch {}
          if (!cancelled) setBuild((b) => ({ ...b, status: 'error', phase: 'error', error: msg }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let latestFiles: ProjectFile[] = build.files;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            let evt: BuildEvent;
            try { evt = JSON.parse(raw); } catch { continue; }
            if (cancelled) return;
            if (evt.type === 'phase') {
              setBuild((b) => ({ ...b, phase: evt.phase as BuildPhase }));
              setPhaseLog((l) => [...l, { phase: evt.phase as BuildPhase, detail: (evt as any).detail }]);
            } else if (evt.type === 'files') {
              appFilesRef.current = (evt as any).appFiles;
              latestFiles = (evt as any).files;
              setBuild((b) => ({ ...b, files: latestFiles }));
            } else if (evt.type === 'done') {
              setBuild((b) => ({ ...b, status: 'ready', phase: 'ready', previewUrl: (evt as any).previewUrl, seq: req.seq }));
              // Persist the generated source so a reopen resumes via /api/code/run.
              // Only on (re)generation — resume already matches what's stored.
              if (!isRun) void updateProject(project.id, { appFiles: appFilesRef.current }).catch(() => {});
            } else if (evt.type === 'error') {
              setBuild((b) => ({ ...b, status: 'error', phase: 'error', error: (evt as any).error || 'Build failed' }));
            }
          }
        }
      } catch (e: any) {
        if (cancelled || ctrl.signal.aborted) return;
        setBuild((b) => ({ ...b, status: 'error', phase: 'error', error: e?.message || 'Build failed' }));
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [load, project?.id, req.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (load === 'loading') {
    return (
      <div className="ezc-app flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading project…
      </div>
    );
  }
  if (load === 'notfound' || !project) return <Navigate to="/app/code" replace />;

  async function handleRename() {
    const next = window.prompt('Rename project', project!.name);
    if (next && next.trim()) {
      const updated = await updateProject(project!.id, { name: next.trim() }).catch(() => undefined);
      if (updated) setProject(updated);
    }
  }
  async function handleToggleStar() {
    const updated = await updateProject(project!.id, { starred: !project!.starred }).catch(() => undefined);
    if (updated) setProject(updated);
  }
  async function handlePublish(slug: string): Promise<string> {
    const url = build.previewUrl || `https://${slug}.${BASE_DOMAIN}`;
    const updated = await updateProject(project!.id, { slug, published: true, publishedUrl: url });
    if (updated) setProject(updated);
    return url;
  }

  // refresh bumps the iframe cache-bust via build.seq override
  const previewBuild: BuildState = { ...build, seq: build.seq * 1000 + refreshSeq };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ezc-app flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <WorkspaceTopBar
          name={project.name}
          statusText={STATUS_TEXT[build.status]}
          starred={project.starred}
          view={view}
          device={device}
          onView={setView}
          onDevice={setDevice}
          onRefresh={() => setRefreshSeq((s) => s + 1)}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onRename={handleRename}
          onToggleStar={handleToggleStar}
          onPublish={() => setPublishOpen(true)}
          previewUrl={build.previewUrl}
        />

        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <ChatSidebar
              prompt={project.prompt}
              building={build.status === 'building'}
              phase={build.phase}
              phaseLog={phaseLog}
              onSend={(msg) => setReq((r) => ({ mode: 'build', prompt: msg, seq: r.seq + 1 }))}
            />
          )}
          <div className="min-w-0 flex-1">
            {view === 'preview' && <PreviewPane build={previewBuild} deviceWidth={DEVICE_WIDTH[device]} />}
            {view === 'file' && <PagesPanel />}
            {view === 'code' && <CodeExplorer files={build.files} />}
            {view === 'layers' && <CloudPanel />}
          </div>
        </div>

        <PublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          projectId={project.id}
          slug={project.slug || ''}
          previewUrl={build.previewUrl}
          onPublish={handlePublish}
        />
      </div>
    </TooltipProvider>
  );
}
