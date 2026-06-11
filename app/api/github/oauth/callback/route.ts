// JarvisFactory v10 — GitHub OAuth callback
// User clicks "Connect GitHub" on dashboard → redirected to github.com/login/oauth/authorize
// → GitHub redirects back here with ?code=... → we exchange for token, save, redirect home.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const errParam = req.nextUrl.searchParams.get('error')

  const baseUrl = req.nextUrl.origin
  if (errParam) {
    return NextResponse.redirect(`${baseUrl}/dashboard?github_error=${encodeURIComponent(errParam)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${baseUrl}/dashboard?github_error=missing_code`)
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/dashboard?github_error=server_not_configured`)
  }

  // Exchange code for access_token
  let token: string | null = null
  let scopes: string | null = null
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const tokenData: any = await tokenRes.json()
    if (tokenData.error || !tokenData.access_token) {
      return NextResponse.redirect(`${baseUrl}/dashboard?github_error=${encodeURIComponent(tokenData.error || 'no_token')}`)
    }
    token = tokenData.access_token
    scopes = tokenData.scope || null
  } catch (e: any) {
    return NextResponse.redirect(`${baseUrl}/dashboard?github_error=${encodeURIComponent(e?.message || 'token_exchange_failed')}`)
  }

  // Get GitHub user info
  let ghUser: any = null
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
    })
    ghUser = await userRes.json()
  } catch (e: any) {
    return NextResponse.redirect(`${baseUrl}/dashboard?github_error=${encodeURIComponent('user_fetch_failed')}`)
  }

  // Get the currently authenticated Supabase user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/auth?github_error=not_logged_in`)
  }

  // Save the connection (upsert)
  const { error: dbErr } = await supabase.from('user_github_connections').upsert({
    user_id: user.id,
    github_user_id: ghUser.id,
    github_username: ghUser.login,
    access_token: token,
    scopes,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (dbErr) {
    return NextResponse.redirect(`${baseUrl}/dashboard?github_error=${encodeURIComponent('save_failed: ' + dbErr.message)}`)
  }

  return NextResponse.redirect(`${baseUrl}/dashboard?github=connected&as=${encodeURIComponent(ghUser.login)}`)
}
