// JarvisFactory v11 / Phase 7.1 — Multi-file GitHub pull
// Body: { app_id }
//
// Pulls EVERY file in the linked repo's default branch (recursive tree).
// Returns the file map { path: content }.
// Caller (dashboard / builder) is responsible for storing them.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const GH = 'https://api.github.com'

function fromBase64(s: string): string {
  return Buffer.from(s, 'base64').toString('utf-8')
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const appId = body?.app_id
  if (!appId) return NextResponse.json({ error: 'app_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: app } = await supabase
    .from('apps')
    .select('id, user_id, name, github_repo_full_name, github_repo_url')
    .eq('id', appId)
    .single()
  if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
  if (app.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!app.github_repo_full_name) {
    return NextResponse.json({ error: 'App is not linked to a GitHub repo' }, { status: 400 })
  }

  const { data: conn } = await supabase
    .from('user_github_connections')
    .select('access_token, github_username')
    .eq('user_id', user.id)
    .single()
  if (!conn?.access_token) {
    return NextResponse.json({ error: 'GitHub not connected.' }, { status: 400 })
  }

  const ghHeaders = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    // 1. Get default branch
    const repoRes = await fetch(`${GH}/repos/${app.github_repo_full_name}`, { headers: ghHeaders })
    if (!repoRes.ok) {
      const err = await repoRes.json()
      return NextResponse.json({ error: `Repo fetch failed: ${err.message || repoRes.status}` }, { status: 502 })
    }
    const repoData: any = await repoRes.json()
    const branch = repoData.default_branch || 'main'

    // 2. Get latest commit SHA on default branch
    const refRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/ref/heads/${branch}`, { headers: ghHeaders })
    if (!refRes.ok) return NextResponse.json({ error: 'Branch ref fetch failed' }, { status: 502 })
    const refData: any = await refRes.json()
    const commitSha = refData.object.sha

    // 3. Get the commit's tree SHA
    const commitRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/commits/${commitSha}`, { headers: ghHeaders })
    if (!commitRes.ok) return NextResponse.json({ error: 'Commit fetch failed' }, { status: 502 })
    const commitData: any = await commitRes.json()
    const treeSha = commitData.tree.sha

    // 4. Recursively list every file in the tree
    const treeRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/trees/${treeSha}?recursive=1`, { headers: ghHeaders })
    if (!treeRes.ok) return NextResponse.json({ error: 'Tree fetch failed' }, { status: 502 })
    const treeData: any = await treeRes.json()

    if (treeData.truncated) {
      return NextResponse.json({ error: 'Repo is too large to pull (>100K files in tree). Use git clone manually.' }, { status: 413 })
    }

    // 5. Filter to blobs (files) only, skip LICENSE/README management files we don't want to overwrite
    const blobs: { path: string; sha: string; size?: number }[] = (treeData.tree || [])
      .filter((t: any) => t.type === 'blob')
      .filter((t: any) => !t.path.startsWith('.git/'))
      // Cap individual file size to 1MB to avoid pulling user-committed binaries
      .filter((t: any) => (t.size || 0) <= 1_000_000)

    if (blobs.length === 0) return NextResponse.json({ error: 'Repo tree is empty' }, { status: 404 })

    // 6. Fetch every blob (parallel, batched at 10 at a time to be polite)
    const files: Record<string, string> = {}
    const BATCH = 10
    for (let i = 0; i < blobs.length; i += BATCH) {
      const batch = blobs.slice(i, i + BATCH)
      const results = await Promise.all(batch.map(async (b) => {
        const r = await fetch(`${GH}/repos/${app.github_repo_full_name}/git/blobs/${b.sha}`, { headers: ghHeaders })
        if (!r.ok) return { path: b.path, error: `fetch failed (${r.status})` }
        const d: any = await r.json()
        if (d.encoding !== 'base64') return { path: b.path, error: `unsupported encoding ${d.encoding}` }
        try { return { path: b.path, content: fromBase64(String(d.content).replace(/\n/g, '')) } }
        catch (e: any) { return { path: b.path, error: 'base64 decode failed' } }
      }))
      for (const r of results) {
        if ('content' in r && r.content !== undefined) files[r.path] = r.content
      }
    }

    // 7. Sync apps.html_code from index.html (back-compat with v10 single-file dashboards)
    if ('index.html' in files) {
      await supabase.from('apps').update({
        html_code: files['index.html'],
        github_pushed_at: new Date().toISOString(),
      }).eq('id', appId)
    } else {
      await supabase.from('apps').update({ github_pushed_at: new Date().toISOString() }).eq('id', appId)
    }
    await supabase.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id)

    return NextResponse.json({
      ok: true,
      repo_full_name: app.github_repo_full_name,
      branch,
      commit_sha: commitSha,
      file_count: Object.keys(files).length,
      total_bytes: Object.values(files).reduce((a, c) => a + c.length, 0),
      files,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'Pull failed: ' + (e?.message || 'unknown') }, { status: 502 })
  }
}
