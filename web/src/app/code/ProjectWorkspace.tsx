import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ProjectChatSidebar } from '@/web/src/app/code/ProjectChatSidebar';
import { PreviewPane } from '@/web/src/app/code/PreviewPane';
import { getProject } from '@/web/src/app/code/projectStore';

/**
 * Two-pane project workspace for /app/code/:id — chat (left) + live Blaxel preview
 * (right). The route param is the source of truth. Unknown ids redirect back to
 * /app/code (the landing form).
 */
export function ProjectWorkspace() {
  const { id } = useParams();
  const project = id ? getProject(id) : undefined;
  // A bump here re-triggers the preview build (initial seed + each chat edit).
  const [buildNonce, setBuildNonce] = useState(0);

  if (!id) return <Navigate to="/app/code" replace />;
  if (!project) {
    // Unknown project id — send the user back to the landing form.
    return <Navigate to="/app/code" replace />;
  }

  return (
    <div className="flex h-full">
      <ProjectChatSidebar
        projectId={project.id}
        name={project.name}
        prompt={project.prompt}
        onRebuild={() => setBuildNonce((n) => n + 1)}
      />
      <div className="min-w-0 flex-1">
        <PreviewPane projectId={project.id} prompt={project.prompt} buildNonce={buildNonce} />
      </div>
    </div>
  );
}
