// Durable Code-section projects, backed by the server (`code_projects` table,
// RLS-scoped per user) via /api/code/projects. Replaces the old localStorage
// registry — projects + their generated source now survive reloads and follow the
// user across devices. The generated source (appFiles) lives on the project itself
// (project.appFiles), so reopening resumes via /api/code/run with no model call.

import { apiFetch } from '@/web/src/lib/api';
import type { ProjectFile } from '@/web/src/app/code/types';

export type Project = {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  slug?: string;
  published?: boolean;
  publishedUrl?: string;
  starred?: boolean;
  appFiles?: ProjectFile[]; // only present on the single-project fetch
};

/** Display base domain for published apps. Real deploy target is a follow-up. */
export const BASE_DOMAIN = 'ezclaude.app';

// ── Pure slug helpers (client-side format validation; uniqueness is server-enforced) ──
export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 63;
}

// ── Row → client shape ──
function toProject(r: any): Project {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt || '',
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    slug: r.slug || undefined,
    published: !!r.published,
    publishedUrl: r.published_url || undefined,
    starred: !!r.starred,
    appFiles: Array.isArray(r.app_files) ? r.app_files : undefined,
  };
}

export async function listProjects(): Promise<Project[]> {
  const res = await apiFetch('/api/code/projects');
  if (!res.ok) return [];
  const { projects } = await res.json();
  return (projects || []).map(toProject);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const res = await apiFetch(`/api/code/projects/${id}`);
  if (!res.ok) return undefined;
  const { project } = await res.json();
  return project ? toProject(project) : undefined;
}

export async function createProject(prompt: string): Promise<Project> {
  const res = await apiFetch('/api/code/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || `Failed to create project (HTTP ${res.status})`);
  }
  const { project } = await res.json();
  return toProject(project);
}

/** Patch fields. Client keys map to server columns. Throws on 409 (slug taken). */
export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'slug' | 'starred' | 'published' | 'publishedUrl' | 'appFiles'>>,
): Promise<Project | undefined> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.slug !== undefined) body.slug = patch.slug;
  if (patch.starred !== undefined) body.starred = patch.starred;
  if (patch.published !== undefined) body.published = patch.published;
  if (patch.publishedUrl !== undefined) body.published_url = patch.publishedUrl;
  if (patch.appFiles !== undefined) body.app_files = patch.appFiles;

  const res = await apiFetch(`/api/code/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) throw new Error('That URL is already taken');
  if (!res.ok) return undefined;
  const { project } = await res.json();
  return project ? toProject(project) : undefined;
}
