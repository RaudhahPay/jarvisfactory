'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { countLessons } from '@/lib/jarvis-memory'

// ── v9 Dashboard — Replit-style layout: left sidebar + prompt-first hero + apps grid ──
// All existing data flows preserved (apps list, JARVIS profile, PDF download, sign out).
// Only the chrome around them has changed for a cleaner, more focused UX.

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [jarvis, setJarvis] = useState<any>(null)
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [heroPrompt, setHeroPrompt] = useState('')
  const [exampleIdx, setExampleIdx] = useState(0)
  const [lessonCount, setLessonCount] = useState(0)
  // v10 Phase 5: GitHub connection state
  const [githubConn, setGithubConn] = useState<{ github_username: string } | null>(null)
  const [savingAppId, setSavingAppId] = useState<string | null>(null)
  const [githubBanner, setGithubBanner] = useState<{ kind: 'success'|'error', text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Rotating example prompts in the hero
  const examples = [
    'A loyalty app for my coffee shop with points and referral rewards',
    'A staff birthday gifts manager that auto-emails reminders',
    'A Brainy Bunch student progress tracker for parents and teachers',
    'A Muslim ibadah daily tracker with streaks and dzikir counts',
    'A simple to-do list with sign in and tasks per user',
    'A booking system for my clinic with SMS reminders',
    'A halal food delivery marketplace for KL outlets',
  ]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const [{ data: profile }, { data: jarvis }, { data: apps }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('jarvis_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('apps').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ])
      setProfile(profile)
      setJarvis(jarvis)
      setApps(apps || [])
      setLoading(false)
      // v9.8 Phase 3: live lesson count
      countLessons(jarvis?.id || null).then(setLessonCount).catch(() => {})

      // v10 Phase 5: GitHub connection
      const { data: gh } = await supabase
        .from('user_github_connections')
        .select('github_username')
        .eq('user_id', user.id)
        .maybeSingle()
      if (gh) setGithubConn(gh)

      // Surface OAuth callback result via banner
      const params = new URLSearchParams(window.location.search)
      if (params.get('github') === 'connected') {
        setGithubBanner({ kind: 'success', text: `GitHub connected as @${params.get('as') || gh?.github_username || ''}` })
        window.history.replaceState({}, '', '/dashboard')
      } else if (params.get('github_error')) {
        setGithubBanner({ kind: 'error', text: `GitHub connect failed: ${params.get('github_error')}` })
        window.history.replaceState({}, '', '/dashboard')
      }
    }
    load()
  }, [])

  function startGithubConnect() {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID
    if (!clientId) {
      setGithubBanner({ kind: 'error', text: 'GitHub OAuth not configured. Add NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID to .env.local' })
      return
    }
    const redirect = `${window.location.origin}/api/github/oauth/callback`
    const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=public_repo&redirect_uri=${encodeURIComponent(redirect)}`
    window.location.href = url
  }

  async function saveAppToGithub(appId: string) {
    setSavingAppId(appId)
    try {
      const r = await fetch('/api/github/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      const { data: appsRefresh } = await supabase.from('apps').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setApps(appsRefresh || [])
      setGithubBanner({ kind: 'success', text: data.action === 'updated' ? `Updated on GitHub: ${data.repo_url}` : `Saved to GitHub: ${data.repo_url}` })
    } catch (err: any) {
      setGithubBanner({ kind: 'error', text: `GitHub save failed: ${err.message}` })
    } finally {
      setSavingAppId(null)
    }
  }

  // v10 Phase 6: Manual pull from GitHub — overwrites local app.html_code with the repo's index.html
  async function pullAppFromGithub(appId: string, appName: string) {
    const confirmed = window.confirm(
      `Pull latest from GitHub will REPLACE the current "${appName}" code in JarvisFactory with whatever is in your repo right now. Any local edits made since the last push will be lost.\n\nContinue?`
    )
    if (!confirmed) return
    setSavingAppId(appId)
    try {
      const r = await fetch('/api/github/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      const { data: appsRefresh } = await supabase.from('apps').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setApps(appsRefresh || [])
      setGithubBanner({ kind: 'success', text: `Pulled from GitHub — ${data.bytes?.toLocaleString() || '?'} bytes loaded into "${appName}".` })
    } catch (err: any) {
      setGithubBanner({ kind: 'error', text: `GitHub pull failed: ${err.message}` })
    } finally {
      setSavingAppId(null)
    }
  }

  // Rotate example every 4 seconds
  useEffect(() => {
    const t = setInterval(() => setExampleIdx(i => (i+1) % examples.length), 4000)
    return () => clearInterval(t)
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function startBuild() {
    const p = heroPrompt.trim()
    if (p) {
      router.push(`/builder?prompt=${encodeURIComponent(p)}`)
    } else {
      router.push('/builder')
    }
  }

  function startBuildWithExample(text: string) {
    router.push(`/builder?prompt=${encodeURIComponent(text)}`)
  }

  // Workspace name (mirrors Replit's pattern)
  const firstName = profile?.full_name?.split(' ')[0] || 'Friend'
  const workspaceName = `${firstName}'s Workspace`

  // Plan info — placeholder values until Phase 8 (billing) ships
  const plan = profile?.plan || 'starter'
  const planLabel = { starter: 'Starter Plan', builder: 'Builder Plan', agency: 'Agency Plan' }[plan as 'starter'|'builder'|'agency'] || 'Starter Plan'
  const buildLimit = { starter: 5, builder: 20, agency: 999 }[plan as 'starter'|'builder'|'agency'] || 5
  const buildsThisMonth = apps.filter(a => {
    const d = new Date(a.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const buildPct = Math.min(100, (buildsThisMonth / buildLimit) * 100)

  // ── Color palette (cleaner, more Replit-like — accent used sparingly) ──
  const palette = {
    bg:        '#06070b',
    bgPanel:   '#0c0d12',
    bgCard:    '#0e0f15',
    bgHover:   '#13141b',
    border:    '#1c1d24',
    borderH:   '#262731',
    text:      '#e8e9ed',
    textMid:   '#a8a9b3',
    textDim:   '#6f7079',
    textFaint: '#4b4c54',
    accent:    '#00e5b0',
    accent2:   '#7c5cff',
    accentBg:  'rgba(0,229,176,0.1)',
    danger:    '#ff6b8a',
  }

  if (loading) {
    return (
      <div style={{minHeight:'100vh', background:palette.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Inter','DM Sans',sans-serif", color:palette.accent, fontSize:14}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:palette.accent,animation:'pulse 1.4s infinite'}}/>
          <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.8)}}`}</style>
          <span style={{marginLeft:4}}>Loading your workspace...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh', background:palette.bg, color:palette.text, fontFamily:"'Inter','DM Sans',sans-serif", display:'flex'}}>
      <style>{`
        body { background:${palette.bg}; }
        .nav-item:hover { background:${palette.bgHover}; }
        .app-card:hover { border-color:${palette.borderH} !important; transform:translateY(-2px); }
        .chip:hover { background:${palette.bgHover}; border-color:${palette.borderH}; }
        .icon-btn:hover { background:${palette.bgHover}; }
        .hero-input:focus { border-color:${palette.accent} !important; box-shadow:0 0 0 4px ${palette.accentBg}; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation:fadeIn 0.3s ease both; }
      `}</style>

      {/* ──────────────── LEFT SIDEBAR ──────────────── */}
      <aside style={{
        width:260, flexShrink:0, height:'100vh', position:'sticky' as const, top:0,
        background:palette.bgPanel, borderRight:`1px solid ${palette.border}`,
        display:'flex', flexDirection:'column' as const, padding:'14px 12px',
      }}>
        {/* Workspace switcher */}
        <button style={{
          background:'transparent', border:`1px solid ${palette.border}`, borderRadius:9, padding:'9px 12px',
          display:'flex', alignItems:'center', gap:9, cursor:'pointer', color:palette.text, marginBottom:10,
        }}>
          <span style={{width:22, height:22, borderRadius:6, background:`linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`, display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#000'}}>
            {firstName[0]?.toUpperCase()}
          </span>
          <span style={{flex:1, textAlign:'left' as const, fontSize:13.5, fontWeight:500}}>{workspaceName}</span>
          <span style={{color:palette.textDim, fontSize:11}}>▾</span>
        </button>

        {/* Search (decorative for now) */}
        <button className="icon-btn" style={{
          background:'transparent', border:`1px solid ${palette.border}`, borderRadius:9, padding:'9px 12px',
          display:'flex', alignItems:'center', gap:9, cursor:'pointer', color:palette.textDim, marginBottom:14, fontSize:13,
        }}>
          <span>🔍</span> <span>Search</span>
          <span style={{marginLeft:'auto', fontSize:10, padding:'2px 6px', border:`1px solid ${palette.border}`, borderRadius:4, color:palette.textFaint}}>⌘K</span>
        </button>

        {/* Primary CTA — gradient */}
        <button onClick={startBuild} style={{
          background:`linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`,
          color:'#000', border:'none', borderRadius:9, padding:'11px 14px',
          fontWeight:700, fontSize:13.5, cursor:'pointer', marginBottom:8,
          display:'flex', alignItems:'center', gap:8, letterSpacing:0.2,
        }}>
          <span style={{fontSize:15}}>+</span> Create something new
        </button>

        {/* Secondary action */}
        <button className="icon-btn" style={{
          background:'transparent', border:`1px solid ${palette.border}`, borderRadius:9, padding:'9px 14px',
          color:palette.textMid, fontSize:13, cursor:'pointer', marginBottom:18,
          display:'flex', alignItems:'center', gap:8,
        }}>
          <span>↓</span> Import code or design
        </button>

        {/* Nav items */}
        <div style={{display:'flex', flexDirection:'column' as const, gap:1}}>
          {[
            { icon:'⬡', label:'Ask · Create · Build', active:false, onClick:()=>router.push('/studio') },
            { icon:'🏠', label:'Home', active:true, onClick:()=>{} },
            { icon:'📁', label:`Projects (${apps.length})`, active:false, onClick:()=>{ document.getElementById('apps-grid')?.scrollIntoView({behavior:'smooth'}) } },
            { icon:'🎨', label:'Templates', active:false, onClick:()=>alert('Templates — coming soon') },
            { icon:'⚙️', label:'Settings', active:false, onClick:()=>alert('Settings — coming soon') },
          ].map(n => (
            <button key={n.label} onClick={n.onClick} className="nav-item" style={{
              background: n.active ? palette.bgHover : 'transparent',
              border:'none', textAlign:'left' as const, padding:'9px 12px', borderRadius:8,
              color: n.active ? palette.text : palette.textMid, fontSize:13.5, cursor:'pointer',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <span style={{fontSize:14, opacity: n.active ? 1 : 0.7}}>{n.icon}</span>
              <span style={{fontWeight: n.active ? 600 : 400}}>{n.label}</span>
            </button>
          ))}
        </div>

        <div style={{flex:1}}/>

        {/* Plan info at bottom */}
        <div style={{padding:'14px 12px', background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:10, marginBottom:10}}>
          <div style={{fontSize:11, color:palette.textDim, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase' as const, marginBottom:10}}>
            Your {planLabel}
          </div>
          <div style={{marginBottom:8}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:palette.textMid, marginBottom:4}}>
              <span>Build credits</span>
              <span style={{color:palette.text, fontWeight:500}}>{buildsThisMonth} / {buildLimit}</span>
            </div>
            <div style={{height:4, background:palette.border, borderRadius:2, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${buildPct}%`, background:palette.accent, transition:'width 0.3s'}}/>
            </div>
          </div>
          <div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:palette.textMid, marginBottom:4}}>
              <span>JARVIS lessons</span>
              <span style={{color:palette.accent, fontWeight:500}}>{lessonCount} learned</span>
            </div>
            <div style={{height:4, background:palette.border, borderRadius:2, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${Math.min(100, lessonCount)}%`, background:palette.accent2, transition:'width 0.3s'}}/>
            </div>
          </div>
          {plan === 'starter' && (
            <button style={{
              width:'100%', marginTop:12, padding:'8px 0', background:palette.accent, color:'#000',
              border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer'
            }}>↑ Upgrade plan</button>
          )}
        </div>

        {/* v10 Phase 5: GitHub block */}
        <div style={{padding:'12px 12px', background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:10, marginBottom:10}}>
          <div style={{fontSize:11, color:palette.textDim, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase' as const, marginBottom:8, display:'flex', alignItems:'center', gap:6}}>
            <span>🐙 GitHub</span>
          </div>
          {githubConn ? (
            <div>
              <div style={{fontSize:12, color:palette.text, marginBottom:6}}>
                ✓ Connected as <strong style={{color:palette.accent}}>@{githubConn.github_username}</strong>
              </div>
              <div style={{fontSize:11, color:palette.textDim, lineHeight:1.5}}>Click <strong>Save to GitHub</strong> on any app to push it to a real repo you own.</div>
            </div>
          ) : (
            <div>
              <div style={{fontSize:11.5, color:palette.textMid, marginBottom:8, lineHeight:1.5}}>Save your apps to your own GitHub. Real code, real ownership.</div>
              <button onClick={startGithubConnect} style={{
                width:'100%', padding:'8px 0', background:'#24292e', color:'#fff',
                border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer'
              }}>Connect GitHub →</button>
            </div>
          )}
        </div>

        {/* User profile pill */}
        <div style={{display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:9, background:palette.bgCard, border:`1px solid ${palette.border}`}}>
          <span style={{width:26, height:26, borderRadius:'50%', background:palette.accentBg, color:palette.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, border:`1px solid ${palette.accent}33`}}>
            {firstName[0]?.toUpperCase()}
          </span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:12, color:palette.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const}}>{firstName}</div>
            <div style={{fontSize:10, color:palette.textDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const}}>{user?.email}</div>
          </div>
          <button onClick={signOut} title="Sign out" style={{background:'transparent', border:'none', color:palette.textDim, cursor:'pointer', padding:6, borderRadius:6, fontSize:12}}>↗</button>
        </div>
      </aside>

      {/* ──────────────── MAIN CONTENT ──────────────── */}
      <main style={{flex:1, padding:'0 32px 64px', overflowX:'hidden' as const}}>

        {/* Top bar: tiny workspace pill (Replit-style) */}
        <div style={{padding:'18px 0 0', display:'flex', justifyContent:'flex-end' as const, alignItems:'center'}}>
          <div style={{display:'flex', alignItems:'center', gap:7, padding:'6px 12px', background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:18, fontSize:12, color:palette.textMid}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:palette.accent}}/>
            <span>{workspaceName}</span>
          </div>
        </div>

        {/* v10 Phase 5: GitHub banner */}
        {githubBanner && (
          <div style={{
            margin:'14px auto 0', maxWidth:760,
            padding:'12px 16px', borderRadius:10, fontSize:13,
            background: githubBanner.kind === 'success' ? `${palette.accent}15` : `${palette.danger}15`,
            border: `1px solid ${githubBanner.kind === 'success' ? palette.accent : palette.danger}40`,
            color: githubBanner.kind === 'success' ? palette.accent : palette.danger,
            display:'flex', justifyContent:'space-between', alignItems:'center', gap:12,
          }}>
            <span>{githubBanner.kind === 'success' ? '✓' : '⚠'} {githubBanner.text}</span>
            <button onClick={()=>setGithubBanner(null)} style={{background:'transparent', border:'none', color:'inherit', cursor:'pointer', fontSize:14}}>×</button>
          </div>
        )}

        {/* HERO */}
        <div className="fade-in" style={{maxWidth:760, margin:'80px auto 0'}}>
          <h1 style={{
            fontSize:34, fontWeight:600, textAlign:'center' as const,
            color:palette.text, marginBottom:32, letterSpacing:-0.5, lineHeight:1.2,
          }}>
            Hi {firstName}, what do you want to build?
          </h1>

          {/* Big prompt input */}
          <div style={{position:'relative' as const}}>
            <textarea
              className="hero-input"
              value={heroPrompt}
              onChange={e => setHeroPrompt(e.target.value)}
              onKeyDown={e => { if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); startBuild() } }}
              placeholder="Describe your app or idea..."
              rows={3}
              style={{
                width:'100%', boxSizing:'border-box' as const,
                background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:14,
                padding:'18px 110px 50px 18px', color:palette.text, fontFamily:'inherit', fontSize:15,
                lineHeight:1.55, resize:'none' as const, outline:'none', transition:'all 0.15s',
                minHeight:90,
              }}
            />
            <div style={{position:'absolute' as const, bottom:12, left:14, display:'flex', gap:6, alignItems:'center'}}>
              <button title="Attach reference" style={{background:'transparent', border:`1px solid ${palette.border}`, borderRadius:7, color:palette.textDim, cursor:'pointer', padding:'6px 9px', fontSize:13}}>+</button>
            </div>
            <button
              onClick={startBuild}
              disabled={!heroPrompt.trim()}
              style={{
                position:'absolute' as const, bottom:11, right:11,
                background: heroPrompt.trim() ? palette.accent : palette.bgHover,
                color: heroPrompt.trim() ? '#000' : palette.textDim,
                border:'none', borderRadius:9, padding:'8px 14px',
                fontWeight:700, fontSize:12.5, cursor: heroPrompt.trim() ? 'pointer' : 'not-allowed',
                display:'flex', alignItems:'center', gap:6, letterSpacing:0.2,
              }}
            >
              <span>Build</span>
              <span style={{fontSize:11}}>↑</span>
            </button>
          </div>

          {/* Category chips */}
          <div style={{display:'flex', justifyContent:'center', gap:8, marginTop:22, flexWrap:'wrap' as const}}>
            {[
              { icon:'🌐', label:'Web App', tag:'web' },
              { icon:'📱', label:'Mobile-friendly', tag:'mobile' },
              { icon:'🎨', label:'Marketing Site', tag:'marketing' },
              { icon:'📊', label:'Dashboard', tag:'dashboard' },
              { icon:'🤖', label:'AI Tool', tag:'ai' },
              { icon:'🛠', label:'Internal Tool', tag:'internal' },
            ].map(c => (
              <button key={c.tag} className="chip" onClick={() => router.push(`/builder?type=${c.tag}`)} style={{
                background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:9, padding:'8px 13px',
                color:palette.textMid, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:7,
                transition:'all 0.15s',
              }}>
                <span style={{fontSize:14}}>{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Try an example — rotating */}
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginTop:36, color:palette.textDim, fontSize:13}}>
            <span>Try an example</span>
            <button
              onClick={() => startBuildWithExample(examples[exampleIdx])}
              style={{
                background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:18, padding:'8px 16px',
                color:palette.textMid, fontSize:13, cursor:'pointer', maxWidth:520, overflow:'hidden',
                textOverflow:'ellipsis', whiteSpace:'nowrap' as const,
              }}
              title="Click to use this prompt"
            >
              {examples[exampleIdx]}
            </button>
            <button onClick={() => setExampleIdx(i => (i+1) % examples.length)} title="Next example" style={{background:'transparent', border:'none', color:palette.textDim, cursor:'pointer', fontSize:14}}>↻</button>
          </div>
        </div>

        {/* ── RECENT APPS ── */}
        <div id="apps-grid" style={{maxWidth:1100, margin:'80px auto 0'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:18}}>
            <div>
              <h2 style={{fontSize:18, fontWeight:600, color:palette.text, margin:0}}>Recent projects</h2>
              <div style={{fontSize:13, color:palette.textDim, marginTop:4}}>{apps.length} app{apps.length===1?'':'s'} in your library</div>
            </div>
            <button onClick={() => router.push('/builder')} style={{
              background:'transparent', border:`1px solid ${palette.border}`, borderRadius:8, padding:'8px 14px',
              color:palette.textMid, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
            }}>+ New project</button>
          </div>

          {apps.length === 0 ? (
            <div style={{
              background:palette.bgCard, border:`1px dashed ${palette.border}`, borderRadius:14,
              padding:'56px 32px', textAlign:'center' as const,
            }}>
              <div style={{fontSize:36, marginBottom:14, opacity:0.5}}>⬡</div>
              <div style={{fontSize:15, color:palette.text, fontWeight:600, marginBottom:6}}>No projects yet</div>
              <div style={{fontSize:13, color:palette.textDim, lineHeight:1.6, maxWidth:380, margin:'0 auto 22px'}}>
                Type your idea above. {jarvis?.jarvis_name || 'JARVIS'} will plan, estimate the budget, and build your first app.
              </div>
              <button onClick={() => router.push('/builder')} style={{
                padding:'10px 22px', background:palette.accent, color:'#000', border:'none', borderRadius:9,
                fontSize:13, fontWeight:700, cursor:'pointer'
              }}>Build my first app →</button>
            </div>
          ) : (
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14}}>
              {apps.map(app => (
                <div key={app.id} className="app-card" style={{
                  background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:12,
                  padding:18, transition:'all 0.15s', cursor:'pointer',
                }}>
                  <div onClick={()=>router.push(`/builder?app=${app.id}`)}>
                    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                      <span style={{
                        width:32, height:32, borderRadius:8,
                        background: app.proposal_data ? `${palette.accent}22` : `${palette.accent2}22`,
                        color: app.proposal_data ? palette.accent : palette.accent2,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700,
                        border:`1px solid ${app.proposal_data ? palette.accent : palette.accent2}33`,
                      }}>{(app.name?.[0] || '?').toUpperCase()}</span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:14.5, fontWeight:600, color:palette.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const}}>{app.name}</div>
                        <div style={{fontSize:11, color:palette.textDim}}>{new Date(app.created_at).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</div>
                      </div>
                    </div>
                    <div style={{fontSize:12.5, color:palette.textMid, lineHeight:1.55, marginBottom:14, minHeight:38, display:'-webkit-box', WebkitLineClamp:2 as any, WebkitBoxOrient:'vertical' as any, overflow:'hidden'}}>
                      {app.description?.substring(0, 120) || 'No description'}
                    </div>
                  </div>
                  <div style={{display:'flex', gap:6, paddingTop:12, borderTop:`1px solid ${palette.border}`, flexWrap:'wrap' as const}}>
                    <button
                      onClick={(e)=>{ e.stopPropagation(); router.push(`/builder?app=${app.id}`) }}
                      style={{
                        flex:1, padding:'7px 10px', background:palette.bgHover, color:palette.text,
                        border:`1px solid ${palette.border}`, borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer'
                      }}
                    >Open →</button>
                    <button
                      title={app.proposal_data ? 'Download proposal as PDF' : 'JARVIS will generate a proposal first (~30s)'}
                      onClick={(e)=>{ e.stopPropagation(); router.push(`/builder?app=${app.id}&action=pdf`) }}
                      style={{
                        padding:'7px 10px', background:'transparent', color:palette.textMid,
                        border:`1px solid ${palette.border}`, borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer'
                      }}
                    >📄 PDF</button>
                    {/* v10 Phase 5+6: GitHub view + pull (if linked) OR save (if not yet) */}
                    {app.github_repo_url ? (
                      <>
                        <a
                          href={app.github_repo_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e=>e.stopPropagation()}
                          title={`On GitHub: ${app.github_repo_full_name || ''}`}
                          style={{
                            padding:'7px 10px', background:'#1a1a24', color:'#fff', textDecoration:'none' as const,
                            border:`1px solid ${palette.border}`, borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer',
                            display:'inline-flex', alignItems:'center', gap:4
                          }}
                        >🐙 View</a>
                        <button
                          disabled={savingAppId === app.id}
                          title="Pull latest index.html from your GitHub repo — overwrites local code"
                          onClick={(e)=>{ e.stopPropagation(); pullAppFromGithub(app.id, app.name || 'app') }}
                          style={{
                            padding:'7px 10px',
                            background: palette.bgHover, color: palette.textMid,
                            border:`1px solid ${palette.border}`, borderRadius:7, fontSize:12, fontWeight:600,
                            cursor: savingAppId === app.id ? 'not-allowed' : 'pointer',
                            opacity: savingAppId === app.id ? 0.6 : 1,
                          }}
                        >{savingAppId === app.id ? '⤓ Pulling…' : '⤓ Pull'}</button>
                        <button
                          disabled={savingAppId === app.id}
                          title="Push the current JarvisFactory code to your linked repo (updates index.html)"
                          onClick={(e)=>{ e.stopPropagation(); saveAppToGithub(app.id) }}
                          style={{
                            padding:'7px 10px',
                            background: palette.bgHover, color: palette.textMid,
                            border:`1px solid ${palette.border}`, borderRadius:7, fontSize:12, fontWeight:600,
                            cursor: savingAppId === app.id ? 'not-allowed' : 'pointer',
                            opacity: savingAppId === app.id ? 0.6 : 1,
                          }}
                        >{savingAppId === app.id ? '⤴ Pushing…' : '⤴ Push'}</button>
                      </>
                    ) : (
                      <button
                        disabled={!githubConn || savingAppId === app.id}
                        title={githubConn ? 'Push this app to a new public GitHub repo' : 'Connect GitHub first (sidebar)'}
                        onClick={(e)=>{ e.stopPropagation(); saveAppToGithub(app.id) }}
                        style={{
                          padding:'7px 10px',
                          background: githubConn ? '#24292e' : palette.bgHover,
                          color: githubConn ? '#fff' : palette.textDim,
                          border:`1px solid ${palette.border}`, borderRadius:7, fontSize:12, fontWeight:600,
                          cursor: githubConn && savingAppId !== app.id ? 'pointer' : 'not-allowed',
                          opacity: savingAppId === app.id ? 0.6 : 1,
                        }}
                      >🐙 {savingAppId === app.id ? 'Saving…' : 'GitHub'}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
