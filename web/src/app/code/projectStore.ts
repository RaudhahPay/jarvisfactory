// Local project registry (until a real backend table backs it). The route param
// project_id is the source of truth for which project is open; this store records
// which ids exist + their seed prompt, so /app/code/:id can detect unknown ids and
// the sidebar can list real projects.

export type Project = { id: string; name: string; prompt: string; createdAt: number };

const KEY = 'ezc.projects';

function readAll(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Project[];
  } catch {
    return [];
  }
}

function writeAll(list: Project[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore quota */ }
}

export function listProjects(): Project[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getProject(id: string): Project | undefined {
  return readAll().find((p) => p.id === id);
}

function nameFromPrompt(prompt: string): string {
  const t = prompt.trim().replace(/\s+/g, ' ');
  return t.length <= 40 ? (t || 'Untitled app') : t.slice(0, 40) + '…';
}

export function createProject(prompt: string): Project {
  const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 8);
  const project: Project = { id, name: nameFromPrompt(prompt), prompt, createdAt: Date.now() };
  writeAll([project, ...readAll()]);
  return project;
}
