// JarvisFactory v2 — Pull from user's GitHub (Hono, Bearer auth)
// Ports app/api/github/pull (single-file) + app/api/github/pull-v2 (multi-file tree).
// Identity: requireUser(c) (Bearer). Data ops use the RLS-scoped db.

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';

const GH = 'https://api.github.com';

function fromBase64(s: string): string {
  return Buffer.from(s, 'base64').toString('utf-8');
}

const githubPullApp = new Hono();

// ── v10 single-file pull (index.html) ──
githubPullApp.post('/api/github/pull', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const appId = body?.app_id;
  if (!appId) return c.json({ error: 'app_id required' }, 400);

  const { user, db } = await requireUser(c);

  // Load app (must own + must be linked)
  const { data: app } = await db
    .from('apps')
    .select('id, user_id, name, github_repo_full_name, github_repo_url')
    .eq('id', appId)
    .single();
  if (!app) return c.json({ error: 'App not found' }, 404);
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  if (!app.github_repo_full_name) {
    return c.json({ error: 'App is not linked to a GitHub repo. Click 🐙 GitHub to push first.' }, 400);
  }

  // Load GitHub connection
  const { data: conn } = await db
    .from('user_github_connections')
    .select('access_token, github_username')
    .eq('user_id', user.id)
    .single();
  if (!conn?.access_token) {
    return c.json({ error: 'GitHub not connected.' }, 400);
  }

  // Fetch latest index.html
  try {
    const fileRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/contents/index.html`, {
      headers: {
        'Authorization': `Bearer ${conn.access_token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!fileRes.ok) {
      const err = await fileRes.json();
      return c.json({ error: `Fetch failed: ${err.message || fileRes.status}` }, 502);
    }
    const fileData: any = await fileRes.json();
    if (!fileData.content) {
      return c.json({ error: 'No content found in index.html on GitHub.' }, 502);
    }
    const decoded = fromBase64(String(fileData.content).replace(/\n/g, ''));
    if (decoded.length < 100) {
      return c.json({ error: 'Pulled file looks empty or corrupted.' }, 502);
    }

    // Update app.html_code
    await db.from('apps').update({
      html_code: decoded,
      github_pushed_at: new Date().toISOString(), // mark synced
    }).eq('id', appId);

    // Update last_used on the connection
    await db.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);

    return c.json({
      ok: true,
      bytes: decoded.length,
      repo_full_name: app.github_repo_full_name,
      commit_sha: fileData.sha,
    });
  } catch (e: any) {
    return c.json({ error: 'Pull failed: ' + (e?.message || 'unknown') }, 502);
  }
});

// ── v11 multi-file pull (recursive tree) ──
githubPullApp.post('/api/github/pull-v2', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
  const appId = body?.app_id;
  if (!appId) return c.json({ error: 'app_id required' }, 400);

  const { user, db } = await requireUser(c);

  const { data: app } = await db
    .from('apps')
    .select('id, user_id, name, github_repo_full_name, github_repo_url')
    .eq('id', appId)
    .single();
  if (!app) return c.json({ error: 'App not found' }, 404);
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  if (!app.github_repo_full_name) {
    return c.json({ error: 'App is not linked to a GitHub repo' }, 400);
  }

  const { data: conn } = await db
    .from('user_github_connections')
    .select('access_token, github_username')
    .eq('user_id', user.id)
    .single();
  if (!conn?.access_token) {
    return c.json({ error: 'GitHub not connected.' }, 400);
  }

  const ghHeaders = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // 1. Get default branch
    const repoRes = await fetch(`${GH}/repos/${app.github_repo_full_name}`, { headers: ghHeaders });
    if (!repoRes.ok) {
      const err = await repoRes.json();
      return c.json({ error: `Repo fetch failed: ${err.message || repoRes.status}` }, 502);
    }
    const repoData: any = await repoRes.json();
    const branch = repoData.default_branch || 'main';

    // 2. Get latest commit SHA on default branch
    const refRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/ref/heads/${branch}`, { headers: ghHeaders });
    if (!refRes.ok) return c.json({ error: 'Branch ref fetch failed' }, 502);
    const refData: any = await refRes.json();
    const commitSha = refData.object.sha;

    // 3. Get the commit's tree SHA
    const commitRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/commits/${commitSha}`, { headers: ghHeaders });
    if (!commitRes.ok) return c.json({ error: 'Commit fetch failed' }, 502);
    const commitData: any = await commitRes.json();
    const treeSha = commitData.tree.sha;

    // 4. Recursively list every file in the tree
    const treeRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/trees/${treeSha}?recursive=1`, { headers: ghHeaders });
    if (!treeRes.ok) return c.json({ error: 'Tree fetch failed' }, 502);
    const treeData: any = await treeRes.json();

    if (treeData.truncated) {
      return c.json({ error: 'Repo is too large to pull (>100K files in tree). Use git clone manually.' }, 413);
    }

    // 5. Filter to blobs (files) only, skip LICENSE/README management files we don't want to overwrite
    const blobs: { path: string; sha: string; size?: number }[] = (treeData.tree || [])
      .filter((t: any) => t.type === 'blob')
      .filter((t: any) => !t.path.startsWith('.git/'))
      // Cap individual file size to 1MB to avoid pulling user-committed binaries
      .filter((t: any) => (t.size || 0) <= 1_000_000);

    if (blobs.length === 0) return c.json({ error: 'Repo tree is empty' }, 404);

    // 6. Fetch every blob (parallel, batched at 10 at a time to be polite)
    const files: Record<string, string> = {};
    const BATCH = 10;
    for (let i = 0; i < blobs.length; i += BATCH) {
      const batch = blobs.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (b) => {
        const r = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/blobs/${b.sha}`, { headers: ghHeaders });
        if (!r.ok) return { path: b.path, error: `fetch failed (${r.status})` };
        const d: any = await r.json();
        if (d.encoding !== 'base64') return { path: b.path, error: `unsupported encoding ${d.encoding}` };
        try { return { path: b.path, content: fromBase64(String(d.content).replace(/\n/g, '')) }; }
        catch (e: any) { return { path: b.path, error: 'base64 decode failed' }; }
      }));
      for (const r of results) {
        if ('content' in r && r.content !== undefined) files[r.path] = r.content;
      }
    }

    // 7. Sync apps.html_code from index.html (back-compat with v10 single-file dashboards)
    if ('index.html' in files) {
      await db.from('apps').update({
        html_code: files['index.html'],
        github_pushed_at: new Date().toISOString(),
      }).eq('id', appId);
    } else {
      await db.from('apps').update({ github_pushed_at: new Date().toISOString() }).eq('id', appId);
    }
    await db.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);

    return c.json({
      ok: true,
      repo_full_name: app.github_repo_full_name,
      branch,
      commit_sha: commitSha,
      file_count: Object.keys(files).length,
      total_bytes: Object.values(files).reduce((a, c) => a + c.length, 0),
      files,
    });
  } catch (e: any) {
    return c.json({ error: 'Pull failed: ' + (e?.message || 'unknown') }, 502);
  }
});

export { githubPullApp };
