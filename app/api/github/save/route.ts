// JarvisFactory v10 — Save app to user's GitHub
// Body: { app_id }
// Creates a new public repo named jarvisfactory-{slug}-{ts} and commits index.html + README.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const GH = 'https://api.github.com'

function slugify(s: string): string {
  return (s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app'
}

function toBase64(s: string): string {
  // UTF-8 safe base64
  return Buffer.from(s, 'utf-8').toString('base64')
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const appId = body?.app_id
  if (!appId) return NextResponse.json({ error: 'app_id required' }, { status: 400 })

  const supabase = await createClient()

  // Check user is logged in
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Read user's GitHub connection
  const { data: conn } = await supabase
    .from('user_github_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!conn?.access_token) {
    return NextResponse.json({ error: 'GitHub not connected. Click Connect GitHub on the dashboard first.' }, { status: 400 })
  }

  // Read the app
  const { data: app } = await supabase
    .from('apps')
    .select('id, user_id, name, description, html_code, proposal_data, github_repo_url, github_repo_full_name')
    .eq('id', appId)
    .single()
  if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
  if (app.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!app.html_code) return NextResponse.json({ error: 'App has no code yet' }, { status: 400 })

  const ghHeaders = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  // If already pushed, just return the existing URL (idempotent for now)
  if (app.github_repo_full_name) {
    // Update with latest HTML
    try {
      // Get current SHA of index.html so we can update it
      const fileRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/contents/index.html`, { headers: ghHeaders })
      const fileData: any = await fileRes.json()
      const sha = fileData.sha
      const updateRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/contents/index.html`, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify({
          message: `Update from JarvisFactory.ai (${new Date().toISOString()})`,
          content: toBase64(app.html_code),
          sha,
        }),
      })
      if (!updateRes.ok) {
        const err = await updateRes.json()
        return NextResponse.json({ error: `Update failed: ${err.message || updateRes.status}` }, { status: 502 })
      }
      await supabase.from('apps').update({ github_pushed_at: new Date().toISOString() }).eq('id', appId)
      return NextResponse.json({ ok: true, repo_url: app.github_repo_url, action: 'updated' })
    } catch (e: any) {
      return NextResponse.json({ error: 'Update push failed: ' + e?.message }, { status: 502 })
    }
  }

  // Create a new repo
  const repoName = `jarvisfactory-${slugify(app.name || 'app')}-${Date.now().toString(36).slice(-5)}`
  let createdRepo: any
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

  // Get current SHA of the auto-generated README so we can replace it
  let readmeSha: string | null = null
  try {
    const readmeRes = await fetch(`${GH}/repos/${fullName}/contents/README.md`, { headers: ghHeaders })
    const readmeData: any = await readmeRes.json()
    readmeSha = readmeData.sha
  } catch {/* ignore — we'll create one */}

  // Write README
  const proposal = app.proposal_data || {}
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
`

  try {
    await fetch(`${GH}/repos/${fullName}/contents/README.md`, {
      method: 'PUT', headers: ghHeaders,
      body: JSON.stringify({
        message: 'docs: README from JarvisFactory.ai',
        content: toBase64(readmeBody),
        ...(readmeSha ? { sha: readmeSha } : {}),
      }),
    })
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
    })
    if (!idxRes.ok) {
      const err = await idxRes.json()
      return NextResponse.json({ error: `index.html commit failed: ${err.message || idxRes.status}`, repo_url: htmlUrl }, { status: 502 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'index.html commit error: ' + e?.message, repo_url: htmlUrl }, { status: 502 })
  }

  // Persist back to apps table
  await supabase.from('apps').update({
    github_repo_url: htmlUrl,
    github_repo_full_name: fullName,
    github_pushed_at: new Date().toISOString(),
  }).eq('id', appId)

  // Update last_used on the connection
  await supabase.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id)

  return NextResponse.json({ ok: true, repo_url: htmlUrl, full_name: fullName, action: 'created' })
}
