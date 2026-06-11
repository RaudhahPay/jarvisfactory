// ============================================================
// JARVISFACTORY v2 — Phase B/C: serve a Cowork deliverable for download
// ============================================================
// GET /api/agent/file?appId=...&path=report.docx
// Reads the file (as base64) from the project's live sandbox and serves it with the
// right content-type + attachment header. Works while the sandbox is warm (auto-suspends
// after idle); durable snapshot-to-storage is a later refinement.
// ============================================================

import { NextRequest } from 'next/server'
import { getAuthedDb } from '@/lib/supabase/authed'
import { getSandboxDriver } from '@/lib/sandbox'

export const runtime = 'nodejs'

const TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  json: 'application/json',
}

export async function GET(req: NextRequest) {
  const { user, db } = await getAuthedDb()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  const url = new URL(req.url)
  const appId = url.searchParams.get('appId')
  const path = url.searchParams.get('path')
  if (!appId || !path) return Response.json({ error: 'appId and path are required' }, { status: 400 })

  const { data: app } = await db.from('apps').select('id, user_id, sandbox_id').eq('id', appId).single()
  if (!app) return Response.json({ error: 'Not found' }, { status: 404 })
  if (app.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (!app.sandbox_id) return Response.json({ error: 'No sandbox for this project' }, { status: 404 })

  try {
    const driver = getSandboxDriver()
    const sandbox = await driver.get(app.sandbox_id)
    if (!sandbox) return Response.json({ error: 'Sandbox unavailable' }, { status: 410 })
    const b64 = await sandbox.readFileBase64(path)
    const bytes = Buffer.from(b64, 'base64')
    const ext = (path.split('.').pop() || '').toLowerCase()
    const name = path.split('/').pop() || 'download'
    return new Response(bytes, {
      headers: {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(bytes.length),
      },
    })
  } catch (err: any) {
    return Response.json({ error: `Could not read file (sandbox may have expired): ${err?.message || 'unknown'}` }, { status: 410 })
  }
}
