// ============================================================
// JARVISFACTORY v2 / Stage 4 — S3: useV2Build hook (UI ↔ /api/build)
// ============================================================
// Connects the builder panel to the real server-side engine. buildV2():
//   1. ensures a project (apps row) exists  2. POSTs to /api/build and streams the
//   agent's AgentEvents  3. maps each event onto the existing log/chat/status UI
//   4. reloads the files the agent wrote into the code pane.
// Gated behind VITE_V2_ENGINE so the v1 path stays the default — additive, not
// a replacement (the v1 client loop is deleted later, once v2 is the default).
// ============================================================

import { useCallback } from 'react'
import { getSupabase } from '@/web/src/lib/supabase'
import { streamBuild } from '@/web/src/lib/build-client'
import type { AgentEvent } from '@/lib/agent/types'

export interface V2BuildUI {
  setPhase: (p: any) => void
  setAgentStatus: (u: any) => void
  addLog: (msg: string, type?: string) => void
  addChat: (html: string) => void
  setBuiltCode: (code: string) => void
  setCurrentAppId: (id: string) => void
  setPreviewUrl: (url: string) => void
}

// Agent text/messages are untrusted — escape before injecting into the HTML chat log.
function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function useV2Build(ui: V2BuildUI) {
  const supabase = getSupabase()

  const map = useCallback(
    (e: AgentEvent) => {
      switch (e.type) {
        case 'thinking':
          ui.addLog(`🤔 ${e.text.slice(0, 120)}`, 'info')
          break
        case 'text':
          if (e.text.trim()) ui.addChat(esc(e.text))
          break
        case 'tool_use':
          ui.addLog(`🔧 ${e.tool.replace(/^mcp__sandbox__/, '')}`, 'build')
          ui.setAgentStatus((s: any) => ({
            ...s,
            builder: { status: 'working', note: e.tool },
          }))
          break
        case 'tool_result':
          ui.addLog(`  ${e.ok ? '✓' : '✗'} ${e.tool}: ${e.summary}`, e.ok ? 'ok' : 'warn')
          break
        case 'file_edit':
          ui.addLog(`📝 ${e.action} ${e.path}`, 'ok')
          break
        case 'exec':
          ui.addLog(`$ ${e.command}`, 'build')
          break
        case 'usage':
          ui.addLog(`🧾 tokens in ${e.inputTokens} · out ${e.outputTokens} · $${e.costUsd.toFixed(4)}`, 'info')
          break
        case 'error':
          ui.addChat(`❌ <strong>Build error:</strong> ${esc(e.message)}`)
          break
        case 'done':
          break
      }
    },
    [ui]
  )

  const buildV2 = useCallback(
    async (prompt: string, currentAppId: string | null): Promise<string | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        ui.addChat('❌ Please sign in to build.')
        return null
      }

      // v2 builds against an existing project — create one on first build.
      let appId = currentAppId
      if (!appId) {
        const { data, error } = await supabase
          .from('apps')
          .insert({
            user_id: user.id,
            name: prompt.slice(0, 60) || 'New app',
            description: prompt.slice(0, 200),
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (error || !data) {
          ui.addChat(`❌ Could not create project: ${esc(error?.message || 'unknown')}`)
          return null
        }
        appId = data.id as string
        ui.setCurrentAppId(appId)
      }

      ui.setPhase('building')
      ui.setPreviewUrl('') // clear any stale preview while the new build runs
      ui.setAgentStatus({
        builder: { status: 'working', note: 'agent starting…' },
      })
      ui.addChat('⚡ <strong>v2 engine</strong> — the Claude agent is building in a sandbox…')

      try {
        await streamBuild({ appId, prompt }, map)
      } catch (err: any) {
        ui.addChat(`❌ Build failed: ${esc(err?.message || 'unknown')}`)
        ui.setPhase('idle')
        ui.setAgentStatus({ builder: { status: 'failed' } })
        return appId
      }

      // Show what the agent wrote: prefer the entry file, fall back to any file.
      const { data: app } = await supabase.from('apps').select('files_json, html_code, preview_url, entry_point').eq('id', appId).single()
      if (app) {
        const files: Record<string, string> = app.files_json || {}
        const entry = app.entry_point || 'index.html'
        const code = files[entry] || app.html_code || Object.values(files)[0] || ''
        ui.setBuiltCode(String(code))
        ui.setPreviewUrl(app.preview_url || '')
      }
      ui.setAgentStatus({ builder: { status: 'done' } })
      ui.setPhase('done')
      ui.addChat('✅ <strong>Build complete.</strong> Files written by the agent.')
      return appId
    },
    [supabase, map, ui]
  )

  return { buildV2 }
}
