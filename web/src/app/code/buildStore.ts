// Per-project build snapshot (localStorage). Persists the generated app SOURCE so
// reopening a project resumes via /api/code/run (write + dev server, NO model call)
// instead of re-generating from scratch — saves time and Anthropic credits.
//
// NOTE: the previewUrl is a Blaxel dev-server URL that may be torn down when the
// sandbox idles, so it's NOT trusted on resume — only appFiles are. Resume always
// re-starts the dev server. The merged file tree is cached only for instant Code-tab
// display before the resume completes.

import type { ProjectFile } from '@/web/src/app/code/types';

export type BuildSnapshot = { appFiles: ProjectFile[]; files: ProjectFile[]; updatedAt: number };

const key = (id: string) => `ezc.build.${id}`;

export function getSnapshot(id: string): BuildSnapshot | undefined {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return undefined;
    const s = JSON.parse(raw) as BuildSnapshot;
    return Array.isArray(s?.appFiles) && s.appFiles.length ? s : undefined;
  } catch { return undefined; }
}

export function saveSnapshot(id: string, appFiles: ProjectFile[], files: ProjectFile[]) {
  try { localStorage.setItem(key(id), JSON.stringify({ appFiles, files, updatedAt: Date.now() })); }
  catch { /* ignore quota */ }
}
