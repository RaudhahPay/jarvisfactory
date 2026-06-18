// Local project registry (until a real backend table backs it). The route param
// project_id is the source of truth for which project is open; this store records
// which ids exist + their seed prompt, so /app/code/:id can detect unknown ids and
// the sidebar can list real projects.

export type Project = {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  slug?: string;        // publish slug ({slug}.{BASE_DOMAIN})
  published?: boolean;
  publishedUrl?: string;
  starred?: boolean;
};

/** Display base domain for published apps. Real deploy target is a follow-up;
 *  change this one constant when the production host lands. */
export const BASE_DOMAIN = 'ezclaude.app';

const KEY = 'ezc.projects';

/** Slug rules: lowercase letters, digits, hyphens; no leading/trailing/double hyphen. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 63;
}

/** True if no OTHER project already owns this slug. */
export function isSlugAvailable(slug: string, exceptId?: string): boolean {
  return !readAll().some((p) => p.slug === slug && p.id !== exceptId);
}

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

/** Generate a unique slug from a seed string. */
function uniqueSlug(seed: string): string {
  const base = slugify(seed) || 'app';
  if (isSlugAvailable(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base}-${i}`.slice(0, 63);
    if (isSlugAvailable(cand)) return cand;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function createProject(prompt: string): Project {
  const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 8);
  const name = nameFromPrompt(prompt);
  const project: Project = { id, name, prompt, createdAt: Date.now(), slug: uniqueSlug(name) };
  writeAll([project, ...readAll()]);
  return project;
}

/** Patch a project in place. Returns the updated project (or undefined if not found). */
export function updateProject(id: string, patch: Partial<Project>): Project | undefined {
  const list = readAll();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  list[i] = { ...list[i], ...patch };
  writeAll(list);
  return list[i];
}
