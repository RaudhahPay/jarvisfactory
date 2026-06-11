// JarvisFactory v10 / Phase 6 (manual pull)
// Body: { app_id }
// Pulls latest index.html from the linked GitHub repo and overwrites app.html_code in Supabase.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

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

  // Load app (must own + must be linked)
  const { data: app } = await supabase
    .from('apps')
    .select('id, user_id, name, github_repo_full_name, github_repo_url')
    .eq('id', appId)
    .single()
  if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
  if (app.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!app.github_repo_full_name) {
    return NextResponse.json({ error: 'App is not linked to a GitHub repo. Click 🐙 GitHub to push first.' }, { status: 400 })
  }

  // Load GitHub connection
  const { data: conn } = await supabase
    .from('user_github_connections')
    .select('access_token, github_username')
    .eq('user_id', user.id)
    .single()
  if (!conn?.access_token) {
    return NextResponse.json({ error: 'GitHub not connected.' }, { status: 400 })
  }

  // Fetch latest index.html
  try {
    const fileRes = await fetch(`${GH}/repos/${app.github_repo_full_name}/contents/index.html`, {
      headers: {
        'Authorization': `Bearer ${conn.access_token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!fileRes.ok) {
      const err = await fileRes.json()
      return NextResponse.json({ error: `Fetch failed: ${err.message || fileRes.status}` }, { status: 502 })
    }
    const fileData: any = await fileRes.json()
    if (!fileData.content) {
      return NextResponse.json({ error: 'No content found in index.html on GitHub.' }, { status: 502 })
    }
    const decoded = fromBase64(String(fileData.content).replace(/\n/g, ''))
    if (decoded.length < 100) {
      return NextResponse.json({ error: 'Pulled file looks empty or corrupted.' }, { status: 502 })
    }

    // Update app.html_code
    await supabase.from('apps').update({
      html_code: decoded,
      github_pushed_at: new Date().toISOString(), // mark synced
    }).eq('id', appId)

    // Update last_used on the connection
    await supabase.from('user_github_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id)

    return NextResponse.json({
      ok: true,
      bytes: decoded.length,
      repo_full_name: app.github_repo_full_name,
      commit_sha: fileData.sha,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'Pull failed: ' + (e?.message || 'unknown') }, { status: 502 })
  }
}
