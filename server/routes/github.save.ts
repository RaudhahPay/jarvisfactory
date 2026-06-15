// JarvisFactory v2 — Save app to user's GitHub (Hono, Bearer auth)
// Ports app/api/github/save (single-file) + app/api/github/save-v2 (multi-file, Git Data API).
// Identity: requireUser(c) (Bearer). Data ops use the RLS-scoped db.

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';

const GH = 'https://api.github.com';

function slugify(s: string): string {
  return (s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app';
}

function toBase64(s: string): string {
  // UTF-8 safe base64
  return Buffer.from(s, 'utf-8').toString('base64');
}

interface CommitFile { path: string; content: string }

async function gh(url: string, init: RequestInit, token: string) {
  const res = await fetch(`${GH}${url}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { ok: res.ok, status: res.status, json, text };
}

// Commit a set of files atomically using the Git Data API.
async function commitFilesAtomically(opts: {
  token: string
  fullName: string         // owner/repo
  branch?: string          // defaults to 'main'
  files: CommitFile[]
  message: string
}): Promise<{ ok: boolean; commitSha?: string; error?: string }> {
  const { token, fullName, branch = 'main', files, message } = opts;
  if (files.length === 0) return { ok: false, error: 'No files to commit' };

  // 1. Get current commit + tree SHA from branch ref
  const refRes = await gh(`/repos/${fullName}/git/ref/heads/${branch}`, { method: 'GET' }, token);
  if (!refRes.ok) return { ok: false, error: `Failed to read branch ref: ${refRes.json?.message || refRes.status}` };
  const parentCommitSha = refRes.json.object.sha;

  const parentCommitRes = await gh(`/repos/${fullName}/git/commits/${parentCommitSha}`, { method: 'GET' }, token);
  if (!parentCommitRes.ok) return { ok: false, error: `Failed to read parent commit: ${parentCommitRes.json?.message || parentCommitRes.status}` };
  const baseTreeSha = parentCommitRes.json.tree.sha;

  // 2. Create a blob for each file (parallel)
  const blobResults = await Promise.all(files.map(f =>
    gh(`/repos/${fullName}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: toBase64(f.content), encoding: 'base64' }),
    }, token)
  ));
  for (let i = 0; i < blobResults.length; i++) {
    if (!blobResults[i].ok) {
      return { ok: false, error: `Blob creation failed for ${files[i].path}: ${blobResults[i].json?.message || blobResults[i].status}` };
    }
  }
  const blobs = blobResults.map((r, i) => ({ path: files[i].path, sha: r.json.sha }));

  // 3. Create a new tree (base_tree = parent, with our blobs overlaid)
  const treeRes = await gh(`/repos/${fullName}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map(b => ({
        path: b.path,
        mode: '100644',
        type: 'blob',
        sha: b.sha,
      })),
    }),
  }, token);
  if (!treeRes.ok) return { ok: false, error: `Tree creation failed: ${treeRes.json?.message || treeRes.status}` };

  // 4. Create a new commit
  const commitRes = await gh(`/repos/${fullName}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeRes.json.sha,
      parents: [parentCommitSha],
    }),
  }, token);
  if (!commitRes.ok) return { ok: false, error: `Commit creation failed: ${commitRes.json?.message || commitRes.status}` };

  // 5. Update branch ref to point to new commit
  const updateRefRes = await gh(`/repos/${fullName}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitRes.json.sha, force: false }),
  }, token);
  if (!updateRefRes.ok) return { ok: false, error: `Ref update failed: ${updateRefRes.json?.message || updateRefRes.status}` };

  return { ok: true, commitSha: commitRes.json.sha };
}

function generateReadme(name?: string, description?: string, proposal: any = {}): string {
  return `# ${name || 'My App'}

${description || proposal.tagline || 'Built with JarvisFactory.ai'}

> Built with **[JarvisFactory.ai](https://jarvisfactory.ai)** — your personal AI developer.

## Project structure (Phase 7.1 multi-file)

\`\`\`
index.html              entry point
styles/
  main.css              design system + components
scripts/
  app.js                init, routing, helpers
  auth.js               (if auth) signup/login/logout
  <feature>.js          one file per major feature
README.md               this file
\`\`\`

## Run locally

Open \`index.html\` in a browser. Or for a real dev server:

\`\`\`bash
npx serve .
\`\`\`

${proposal.executive_summary ? `\n## Overview\n\n${proposal.executive_summary}\n` : ''}
${(proposal.features_mvp || proposal.features || []).length ? `\n## Features\n\n${(proposal.features_mvp || proposal.features).map((f: string) => '- ' + f).join('\n')}\n` : ''}
${proposal.tech_stack ? `\n## Tech\n\n- Frontend: ${proposal.tech_stack.frontend || 'HTML/CSS/JS'}\n- Backend: ${proposal.tech_stack.backend || 'Supabase'}\n- AI: ${proposal.tech_stack.ai || 'Claude Sonnet 4.6'}\n` : ''}

## License

MIT — you own this code.
`;
}

const githubSaveApp = new Hono();

// ── v10 single-file save ──
githubSaveApp.post('/api/github/save', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const appId = body?.app_id;
  if (!appId) return c.json({ error: 'app_id required' }, 400);

  const { user, db } = await requireUser(c);

  // Read user's GitHub connection
  const { data: conn } = await db
    .from('user_github_connections')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (!conn?.access_token) {
    return c.json({ error: 'GitHub not connected. Click Connect GitHub on the dashboard first.' }, 400);
  }

  // Read the app
  const { data: app } = await db
    .from('apps')
    .select('id, user_id, name, description, html_code, proposal_data, github_repo_url, github_repo_full_name')
    .eq('id', appId)
    .single();
  if (!app) return c.json({ error: 'App not found' }, 404);
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  if (!app.html_code) return c.json({ error: 'App has no code yet' }, 400);

  const ghHeaders = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // If already pushed, just return the existing URL (idempotent for now)
  if (app.github_repo_full_name) {
    // Update with latest HTML
    try {
      // Get current SHA of index.html so we can update it
      const fileRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/contents/index.html`, { headers: ghHeaders });
      const fileData: any = await fileRes.json();
      const sha = fileData.sha;
      const updateRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/contents/index.html`, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify({
          message: `Update from JarvisFactory.ai (${new Date().toISOString()})`,
          content: toBase64(app.html_code),
          sha,
        }),
      });
      if (!updateRes.ok) {
        const err = await updateRes.json();
        return c.json({ error: `Update failed: ${err.message || updateRes.status}` }, 502);
      }
      await db.from('apps').update({ github_pushed_at: new Date().toISOString() }).eq('id', appId);
      return c.json({ ok: true, repo_url: app.github_repo_url, action: 'updated' });
    } catch (e: any) {
      return c.json({ error: 'Update push failed: ' + e?.message }, 502);
    }
  }

  // Create a new repo
  const repoName = `jarvisfactory-${slugify(app.name || 'app')}-${Date.now().toString(36).slice(-5)}`;
  let createdRepo: any;
  try {
    const createRes = await fetch(`${GH}/user/repos`, {
      method: 'POST', headers: ghHeaders,
      body: JSON.stringify({
        name: repoName,
        description: `Built with JarvisFactory.ai — ${(app.description || '').slice(0, 140)}`,
        private: false,
        auto_init: true,  // creates an initial commit so we can PUT files immediately
        license_template: 'mit',
      }),
    });
    createdRepo = await createRes.json();
    if (!createRes.ok) {
      return c.json({ error: `Repo create failed: ${createdRepo.message || createRes.status}` }, 502);
    }
  } catch (e: any) {
    return c.json({ error: 'Repo create error: ' + e?.message }, 502);
  }

  const fullName: string = createdRepo.full_name;
  const htmlUrl: string = createdRepo.html_url;

  // Wait briefly for auto_init to settle
  await new Promise(r => setTimeout(r, 1500));

  // Get current SHA of the auto-generated README so we can replace it
  let readmeSha: string | null = null;
  try {
    const readmeRes = await fetch(`${GH}/repos/${fullName}/contents/README.md`, { headers: ghHeaders });
    const readmeData: any = await readmeRes.json();
    readmeSha = readmeData.sha;
  } catch {/* ignore — we'll create one */}

  // Write README
  const proposal = app.proposal_data || {};
  const readmeBody = `# ${app.name || 'My App'}

${app.description || proposal.tagline || 'Built with JarvisFactory.ai'}

> Built with **[JarvisFactory.ai](https://jarvisfactory.ai)** — your personal AI developer.

## Run locally

Open \`index.html\` in a browser. That's it.

${proposal.executive_summary ? `\n## Overview\n\n${proposal.executive_summary}\n` : ''}
${(proposal.features_mvp || proposal.features || []).length ? `\n## Features\n\n${(proposal.features_mvp || proposal.features).map((f: string) => '- ' + f).join('\n')}\n` : ''}
${proposal.tech_stack ? `\n## Tech\n\n- Frontend: ${proposal.tech_stack.frontend || 'HTML/CSS/JS'}\n- Backend: ${proposal.tech_stack.backend || 'Supabase'}\n- AI: ${proposal.tech_stack.ai || 'Claude Sonnet 4.6'}\n` : ''}

## License

MIT — you own this code.
`;

  try {
    await fetch(`${GH}/repos/${fullName}/contents/README.md`, {
      method: 'PUT', headers: ghHeaders,
      body: JSON.stringify({
        message: 'docs: README from JarvisFactory.ai',
        content: toBase64(readmeBody),
        ...(readmeSha ? { sha: readmeSha } : {}),
      }),
    });
  } catch (e: any) {
    // README failure is non-fatal; continue with index.html
  }

  // Write index.html
  try {
    const idxRes = await fetch(`${GH}/repos/${fullName}/contents/index.html`, {
      method: 'PUT', headers: ghHeaders,
      body: JSON.stringify({
        message: 'feat: initial app commit (built by JarvisFactory.ai)',
        content: toBase64(app.html_code),
      }),
    });
    if (!idxRes.ok) {
      const err = await idxRes.json();
      return c.json({ error: `index.html commit failed: ${err.message || idxRes.status}`, repo_url: htmlUrl }, 502);
    }
  } catch (e: any) {
    return c.json({ error: 'index.html commit error: ' + e?.message, repo_url: htmlUrl }, 502);
  }

  // Persist back to apps table
  await db.from('apps').update({
    github_repo_url: htmlUrl,
    github_repo_full_name: fullName,
    github_pushed_at: new Date().toISOString(),
  }).eq('id', appId);

  // Update last_used on the connection
  await db.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);

  return c.json({ ok: true, repo_url: htmlUrl, full_name: fullName, action: 'created' });
});

// ── v11 multi-file save (Git Data API) ──
githubSaveApp.post('/api/github/save-v2', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const appId = body?.app_id;
  if (!appId) return c.json({ error: 'app_id required' }, 400);

  const { user, db } = await requireUser(c);

  const { data: conn } = await db
    .from('user_github_connections')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (!conn?.access_token) {
    return c.json({ error: 'GitHub not connected. Click Connect GitHub on the dashboard first.' }, 400);
  }

  const { data: app } = await db
    .from('apps')
    .select('id, user_id, name, description, html_code, proposal_data, github_repo_url, github_repo_full_name')
    .eq('id', appId)
    .single();
  if (!app) return c.json({ error: 'App not found' }, 404);
  if (app.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403);

  // Build the file map to push
  let files: CommitFile[] = [];
  if (body?.files && typeof body.files === 'object') {
    files = Object.entries(body.files as Record<string, string>).map(([path, content]) => ({
      path,
      content: String(content),
    }));
  } else if (app.html_code) {
    // v10 backwards compat: single-file push
    files = [{ path: 'index.html', content: app.html_code }];
  } else {
    return c.json({ error: 'No files to push — app has no html_code and no files were provided' }, 400);
  }
  if (files.length === 0) return c.json({ error: 'Empty file tree' }, 400);

  // Always include/update README.md
  const proposal = app.proposal_data || {};
  const readme = generateReadme(app.name, app.description, proposal);
  // Only add README if not already in user's tree (let user override if they want)
  if (!files.some(f => f.path.toLowerCase() === 'readme.md')) {
    files.push({ path: 'README.md', content: readme });
  }

  const ghHeaders = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // ── EXISTING REPO: atomic update ──
  if (app.github_repo_full_name) {
    try {
      const result = await commitFilesAtomically({
        token: conn.access_token,
        fullName: app.github_repo_full_name,
        files,
        message: `Update from JarvisFactory.ai (${new Date().toISOString()})`,
      });
      if (!result.ok) {
        return c.json({ error: result.error }, 502);
      }
      await db.from('apps').update({ github_pushed_at: new Date().toISOString() }).eq('id', appId);
      await db.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);
      return c.json({
        ok: true,
        action: 'updated',
        repo_url: app.github_repo_url,
        full_name: app.github_repo_full_name,
        commit_sha: result.commitSha,
        files_committed: files.length,
      });
    } catch (e: any) {
      return c.json({ error: 'Update push failed: ' + (e?.message || 'unknown') }, 502);
    }
  }

  // ── NEW REPO: create + first commit ──
  const repoName = `jarvisfactory-${slugify(app.name || 'app')}-${Date.now().toString(36).slice(-5)}`;
  let createdRepo: any;
  try {
    const createRes = await fetch(`${GH}/user/repos`, {
      method: 'POST', headers: ghHeaders,
      body: JSON.stringify({
        name: repoName,
        description: `Built with JarvisFactory.ai — ${(app.description || '').slice(0, 140)}`,
        private: false,
        auto_init: true,
        license_template: 'mit',
      }),
    });
    createdRepo = await createRes.json();
    if (!createRes.ok) {
      return c.json({ error: `Repo create failed: ${createdRepo.message || createRes.status}` }, 502);
    }
  } catch (e: any) {
    return c.json({ error: 'Repo create error: ' + e?.message }, 502);
  }

  const fullName: string = createdRepo.full_name;
  const htmlUrl: string = createdRepo.html_url;

  // Wait briefly for auto_init to settle
  await new Promise(r => setTimeout(r, 1500));

  try {
    const result = await commitFilesAtomically({
      token: conn.access_token,
      fullName,
      files,
      message: 'feat: initial app commit (built by JarvisFactory.ai)',
    });
    if (!result.ok) {
      return c.json({ error: `Initial commit failed: ${result.error}`, repo_url: htmlUrl }, 502);
    }
  } catch (e: any) {
    return c.json({ error: 'Initial commit error: ' + e?.message, repo_url: htmlUrl }, 502);
  }

  await db.from('apps').update({
    github_repo_url: htmlUrl,
    github_repo_full_name: fullName,
    github_pushed_at: new Date().toISOString(),
  }).eq('id', appId);
  await db.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);

  return c.json({
    ok: true,
    action: 'created',
    repo_url: htmlUrl,
    full_name: fullName,
    files_committed: files.length,
  });
});

export { githubSaveApp };
