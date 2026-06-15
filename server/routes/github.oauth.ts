// JarvisFactory v2 — GitHub OAuth code exchange (Hono, Bearer auth)
// Ports app/api/github/oauth/callback (Next cookie-redirect flow) to a Bearer
// code-exchange endpoint. The SPA reads ?code from GitHub's redirect and POSTs
// it here; identity comes from the Supabase Bearer token via requireUser(c),
// NOT a cookie. GITHUB_OAUTH_CLIENT_SECRET and the access_token stay server-side.

import { Hono } from 'hono';
import { requireUser } from '@/server/middleware/auth';

const githubOauthApp = new Hono();

githubOauthApp.post('/api/github/oauth/exchange', async (c) => {
  const { user, db } = await requireUser(c);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const code = body?.code;
  if (!code) return c.json({ error: 'missing_code' }, 400);

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.json({ error: 'server_not_configured' }, 500);
  }

  // Exchange the code for an access_token
  let token: string | null = null;
  let scopes: string | null = null;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData: any = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      return c.json({ error: tokenData.error || 'no_token' }, 502);
    }
    token = tokenData.access_token;
    scopes = tokenData.scope || null;
  } catch {
    return c.json({ error: 'token_exchange_failed' }, 502);
  }

  // Fetch the GitHub user info
  let ghUser: any = null;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    ghUser = await userRes.json();
  } catch {
    return c.json({ error: 'user_fetch_failed' }, 502);
  }
  if (!ghUser || ghUser.id == null) {
    return c.json({ error: 'user_fetch_failed' }, 502);
  }

  // Upsert the connection (identity from the Bearer token)
  const { error: dbErr } = await db.from('user_github_connections').upsert(
    {
      user_id: user.id,
      github_user_id: ghUser.id,
      github_username: ghUser.login,
      access_token: token,
      scopes,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (dbErr) {
    return c.json({ error: 'save_failed: ' + dbErr.message }, 500);
  }

  return c.json({ ok: true, username: ghUser.login });
});

export { githubOauthApp };
