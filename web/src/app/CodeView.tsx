import { useNavigate, useParams } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/web/src/app/ui/button';
import { SandboxRunner } from '@/web/src/app/SandboxRunner';

export function CodeView() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-14 items-center border-b border-border px-6">
          <h1 className="text-sm font-semibold">Code</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-secondary">
            <FolderPlus className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">No project open</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Create or open a project to run it live in a sandbox.
            </p>
          </div>
          <Button onClick={() => navigate(`/app/code/${Math.random().toString(36).slice(2, 8)}`)}>
            <FolderPlus className="h-4 w-4" />
            Create / open a project
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <h1 className="text-sm font-semibold">Code · {id}</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/code')}>Close project</Button>
      </header>
      <div className="min-h-0 flex-1">
        {/* Keyed by id so switching projects remounts the runner with a fresh boot. */}
        <SandboxRunner key={id} projectId={id} />
      </div>
    </div>
  );
}
