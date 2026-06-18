import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { apiFetch } from '@/web/src/lib/api';
import { ProjectChatSidebar } from '@/web/src/app/code/ProjectChatSidebar';
import { RightPaneTabs } from '@/web/src/app/code/RightPaneTabs';
import { getProject } from '@/web/src/app/code/projectStore';
import type { BuildState, ProjectFile } from '@/web/src/app/code/types';

export type { BuildState, ProjectFile };

/**
 * Two-pane project workspace for /app/code/:id — chat (left) + tabbed right pane
 * (Preview / Code / Cloud). Owns the build: the seed prompt builds first, then each
 * chat message re-runs the agent against the current files. The route param is the
 * source of truth; unknown ids redirect to /app/code.
 */
export function ProjectWorkspace() {
  const { id } = useParams();
  const project = id ? getProject(id) : undefined;

  const [req, setReq] = useState<{ prompt: string; seq: number }>(() => ({ prompt: project?.prompt || '', seq: 0 }));
  const [build, setBuild] = useState<BuildState>({ status: 'building', previewUrl: '', files: [], error: '', seq: 0 });
  const appFilesRef = useRef<ProjectFile[]>([]); // generated source for incremental edits

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setBuild((b) => ({ ...b, status: 'building', error: '', seq: req.seq }));
    (async () => {
      try {
        const res = await apiFetch('/api/code/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, prompt: req.prompt, currentFiles: appFilesRef.current }),
        });
        const text = await res.text();
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
        if (cancelled) return;
        if (!text) throw new Error('API server not reachable — is the backend (port 3000) running? Try `bun run dev`.');
        if (!res.ok || !json.previewUrl) throw new Error(json.error || `HTTP ${res.status}`);
        if (Array.isArray(json.appFiles)) appFilesRef.current = json.appFiles;
        setBuild({ status: 'ready', previewUrl: json.previewUrl, files: json.files || [], error: '', seq: req.seq });
      } catch (e: any) {
        if (cancelled) return;
        setBuild((b) => ({ ...b, status: 'error', error: e?.message || 'Build failed', seq: req.seq }));
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id, req.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || !project) return <Navigate to="/app/code" replace />;

  return (
    <div className="flex h-full">
      <ProjectChatSidebar
        name={project.name}
        prompt={project.prompt}
        building={build.status === 'building'}
        onSend={(msg) => setReq((r) => ({ prompt: msg, seq: r.seq + 1 }))}
      />
      <div className="min-w-0 flex-1">
        <RightPaneTabs build={build} />
      </div>
    </div>
  );
}
