import { getAccessToken } from '@/web/src/auth/session';

/**
 * Single client transport for all `/api/*` calls. Attaches the Supabase access
 * token as `Authorization: Bearer <jwt>` when a session exists, and otherwise
 * sends no Authorization header.
 *
 * Everything else in `init` is passed through untouched — crucially `signal`
 * (AbortController) and streaming request bodies, which build/cowork/chat rely
 * on. Caller-provided headers are merged (never clobbered), and the raw `fetch`
 * Response is returned without consuming its body so streaming routes keep their
 * stream intact.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // Merge caller headers first so the Bearer token is layered on top without
  // dropping any of them.
  const headers = new Headers(init.headers);

  const token = await getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(path, { ...init, headers });
}
