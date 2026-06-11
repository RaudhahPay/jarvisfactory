// JarvisFactory v11 / Phase 7.1 — Multi-file GitHub push (Git Data API)
// Body: { app_id, files?: Record<string,string>, entry_point?: string }
//
// If `files` is provided in the body, pushes the multi-file tree.
// If `files` is omitted, falls back to apps.html_code (single index.html) — full backwards compat with v10.
//
// Strategy: use the Git Data API (refs + blobs + trees + commits) so ALL files
// land in ONE commit, not N PUTs. This avoids:
//   - GitHub secondary rate limits on rapid serial commits
//   - Race conditions where the user sees a half-pushed repo
//   - Slow UX (N round-trips on a 30-file project)
//
// Reference: https://docs.github.com/en/rest/git/blobs
//            https://docs.github.com/en/rest/git/trees
//            https://docs.github.com/en/rest/git/commits

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 90

const GH = 'https://api.github.com'

function slugify(s: string): string {
  return (s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app'
}
function toBase64(s: string): string { return Buffer.from(s, 'utf-8').toString('base64') }

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
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* keep null */ }
  return { ok: res.ok, status: res.status, json, text }
}

// Commit a set of files atomically using the Git Data API.
async function commitFilesAtomically(opts: {
  token: string
  fullName: string         // owner/repo
  branch?: string          // defaults to 'main'
  files: CommitFile[]
  message: string
}): Promise<{ ok: boolean; commitSha?: string; error?: string }> {
  const { token, fullName, branch = 'main', files, message } = opts
  if (files.length === 0) return { ok: false, error: 'No files to commit' }

  // 1. Get current commit + tree SHA from branch ref
  const refRes = await gh(`/repos/${fullName}/git/ref/heads/${branch}`, { method: 'GET' }, token)
  if (!refRes.ok) return { ok: false, error: `Failed to read branch ref: ${refRes.json?.message || refRes.status}` }
  const parentCommitSha = refRes.json.object.sha

  const parentCommitRes = await gh(`/repos/${fullName}/git/commits/${parentCommitSha}`, { method: 'GET' }, token)
  if (!parentCommitRes.ok) return { ok: false, error: `Failed to read parent commit: ${parentCommitRes.json?.message || parentCommitRes.status}` }
  const baseTreeSha = parentCommitRes.json.tree.sha

  // 2. Create a blob for each file (parallel)
  const blobResults = await Promise.all(files.map(f =>
    gh(`/repos/${fullName}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: toBase64(f.content), encoding: 'base64' }),
    }, token)
  ))
  for (let i = 0; i < blobResults.length; i++) {
    if (!blobResults[i].ok) {
      return { ok: false, error: `Blob creation failed for ${files[i].path}: ${blobResults[i].json?.message || blobResults[i].status}` }
    }
  }
  const blobs = blobResults.map((r, i) => ({ path: files[i].path, sha: r.json.sha }))

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
  }, token)
  if (!treeRes.ok) return { ok: false, error: `Tree creation failed: ${treeRes.json?.message || treeRes.status}` }

  // 4. Create a new commit
  const commitRes = await gh(`/repos/${fullName}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeRes.json.sha,
      parents: [parentCommitSha],
    }),
  }, token)
  if (!commitRes.ok) return { ok: false, error: `Commit creation failed: ${commitRes.json?.message || commitRes.status}` }

  // 5. Update branch ref to point to new commit
  const updateRefRes = await gh(`/repos/${fullName}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitRes.json.sha, force: false }),
  }, token)
  if (!updateRefRes.ok) return { ok: false, error: `Ref update failed: ${updateRefRes.json?.message || updateRefRes.status}` }

  return { ok: true, commitSha: commitRes.json.sha }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const appId = body?.app_id
  if (!appId) return NextResponse.json({ error: 'app_id required' }, { status: 400 })

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: conn } = await supabase
    .from('user_github_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!conn?.access_token) {
    return NextResponse.json({ error: 'GitHub not connected. Click Connect GitHub on the dashboard first.' }, { status: 400 })
  }

  const { data: app } = await supabase
    .from('apps')
    .select('id, user_id, name, description, html_code, proposal_data, github_repo_url, github_repo_full_name')
    .eq('id', appId)
    .single()
  if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
  if (app.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Build the file map to push
  let files: CommitFile[] = []
  if (body?.files && typeof body.files === 'object') {
    files = Object.entries(body.files as Record<string, string>).map(([path, content]) => ({
      path,
      content: String(content),
    }))
  } else if (app.html_code) {
    // v10 backwards compat: single-file push
    files = [{ path: 'index.html', content: app.html_code }]
  } else {
    return NextResponse.json({ error: 'No files to push — app has no html_code and no files were provided' }, { status: 400 })
  }
  if (files.length === 0) return NextResponse.json({ error: 'Empty file tree' }, { status: 400 })

  // Always include/update README.md
  const proposal = app.proposal_data || {}
  const readme = generateReadme(app.name, app.description, proposal)
  // Only add README if not already in user's tree (let user override if they want)
  if (!files.some(f => f.path.toLowerCase() === 'readme.md')) {
    files.push({ path: 'README.md', content: readme })
  }

  const ghHeaders = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  // ── EXISTING REPO: atomic update ──
  if (app.github_repo_full_name) {
    try {
      const result = await commitFilesAtomically({
        token: conn.access_token,
        fullName: app.github_repo_full_name,
        files,
        message: `Update from JarvisFactory.ai (${new Date().toISOString()})`,
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 })
      }
      await supabase.from('apps').update({ github_pushed_at: new Date().toISOString() }).eq('id', appId)
      await supabase.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id)
      return NextResponse.json({
        ok: true,
        action: 'updated',
        repo_url: app.github_repo_url,
        full_name: app.github_repo_full_name,
        commit_sha: result.commitSha,
        files_committed: files.length,
      })
    } catch (e: any) {
      return NextResponse.json({ error: 'Update push failed: ' + (e?.message || 'unknown') }, { status: 502 })
    }
  }

  // ── NEW REPO: create + first commit ──
  const repoName = `jarvisfactory-${slugify(app.name || 'app')}-${Date.now().toString(36).slice(-5)}`
  let createdRepo: any
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
    })
    createdRepo = await createRes.json()
    if (!createRes.ok) {
      return NextResponse.json({ error: `Repo create failed: ${createdRepo.message || createRes.status}` }, { status: 502 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'Repo create error: ' + e?.message }, { status: 502 })
  }

  const fullName: string = createdRepo.full_name
  const htmlUrl: string = createdRepo.html_url

  // Wait briefly for auto_init to settle
  await new Promise(r => setTimeout(r, 1500))

  try {
    const result = await commitFilesAtomically({
      token: conn.access_token,
      fullName,
      files,
      message: 'feat: initial app commit (built by JarvisFactory.ai)',
    })
    if (!result.ok) {
      return NextResponse.json({ error: `Initial commit failed: ${result.error}`, repo_url: htmlUrl }, { status: 502 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'Initial commit error: ' + e?.message, repo_url: htmlUrl }, { status: 502 })
  }

  await supabase.from('apps').update({
    github_repo_url: htmlUrl,
    github_repo_full_name: fullName,
    github_pushed_at: new Date().toISOString(),
  }).eq('id', appId)
  await supabase.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id)

  return NextResponse.json({
    ok: true,
    action: 'created',
    repo_url: htmlUrl,
    full_name: fullName,
    files_committed: files.length,
  })
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
`
}
