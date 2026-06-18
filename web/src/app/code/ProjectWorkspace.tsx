import { useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ProjectChatSidebar } from '@/web/src/app/code/ProjectChatSidebar';
import { PreviewPane, type BuildReq } from '@/web/src/app/code/PreviewPane';
import { getProject } from '@/web/src/app/code/projectStore';

/**
 * Two-pane project workspace for /app/code/:id — chat (left) + live preview (right).
 * The route param is the source of truth; unknown ids redirect to /app/code.
 * The initial build uses the project's seed prompt; each chat message becomes the
 * next build request, and the last generated HTML is fed back so edits are applied
 * incrementally.
 */
export function ProjectWorkspace() {
  const { id } = useParams();
  const project = id ? getProject(id) : undefined;
  const [req, setReq] = useState<BuildReq>(() => ({ prompt: project?.prompt || '', seq: 0 }));
  const htmlRef = useRef<string | undefined>(undefined);

  if (!id || !project) return <Navigate to="/app/code" replace />;

  return (
    <div className="flex h-full">
      <ProjectChatSidebar
        name={project.name}
        prompt={project.prompt}
        onSend={(msg) => setReq((r) => ({ prompt: msg, seq: r.seq + 1 }))}
      />
      <div className="min-w-0 flex-1">
        <PreviewPane
          projectId={project.id}
          req={req}
          getCurrentHtml={() => htmlRef.current}
          onBuilt={(html) => { htmlRef.current = html; }}
        />
      </div>
    </div>
  );
}
