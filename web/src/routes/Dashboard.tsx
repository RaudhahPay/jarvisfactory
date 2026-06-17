import { useState, useEffect } from 'react'
import { getSupabase } from '@/web/src/lib/supabase'
import { apiFetch } from '@/web/src/lib/api'
import { useNavigate } from 'react-router-dom'
import { countLessons } from '@/lib/jarvis-memory'
import { theme, ui } from '@/web/src/lib/theme'
import { Icon } from '@/web/src/lib/icon'
import {
  Plus, Home, FolderOpen, MessageSquare, LogOut, ArrowUp, RefreshCw,
  Check, AlertTriangle, X, FileText, Github, MoreHorizontal,
  Globe, Smartphone, Palette, BarChart3, Bot, Wrench, Sparkles,
} from 'lucide-react'

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
  const [menuAppId, setMenuAppId] = useState<string | null>(null) // per-card "More" menu
  const navigate = useNavigate()
  const supabase = getSupabase()

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
      if (!user) { navigate('/auth'); return }
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
    const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID
    if (!clientId) {
      setGithubBanner({ kind: 'error', text: 'GitHub OAuth not configured. Add VITE_GITHUB_OAUTH_CLIENT_ID to .env' })
      return
    }
    const redirect = `${window.location.origin}/auth/github/callback`
    const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=public_repo&redirect_uri=${encodeURIComponent(redirect)}`
    window.location.href = url
  }

  async function saveAppToGithub(appId: string) {
    setSavingAppId(appId)
    try {
      const r = await apiFetch('/api/github/save', {
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
      const r = await apiFetch('/api/github/pull', {
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
    navigate('/')
  }

  function startBuild() {
    const p = heroPrompt.trim()
    if (p) {
      navigate(`/builder?prompt=${encodeURIComponent(p)}`)
    } else {
      navigate('/builder')
    }
  }

  function startBuildWithExample(text: string) {
    navigate(`/builder?prompt=${encodeURIComponent(text)}`)
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

  // ── Color palette — derived from the canonical Landing tokens (web/src/lib/theme.ts).
  // Keys preserved from the prior dark theme so only the values changed; the page now
  // speaks Landing's clean light language: teal accent, ink text, off-white surfaces,
  // hairline borders, soft shadows. ──
  const palette = {
    bg:        theme.color.bg,            // white page
    bgPanel:   theme.color.surface,       // off-white sidebar
    bgCard:    '#ffffff',                 // white cards
    bgHover:   theme.color.surfaceWarm,   // warm hover
    border:    theme.color.border,        // hairline
    borderH:   theme.color.borderInput,   // hover border
    text:      theme.color.ink,
    textMid:   theme.color.inkSoft,
    textDim:   theme.color.muted,
    textFaint: theme.color.faint,
    accent:    theme.color.accent,        // teal
    accent2:   theme.color.accentAlt,     // violet
    accentBg:  'rgba(16,185,129,0.10)',
    danger:    '#e0476b',
    shadow:    theme.shadow.card,
  }

  if (loading) {
    return (
      <div style={{minHeight:'100vh', background:palette.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:theme.font.sans, color:palette.accent, fontSize:14}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:palette.accent,animation:'pulse 1.4s infinite'}}/>
          <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.8)}}`}</style>
          <span style={{marginLeft:4}}>Loading your workspace...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh', background:palette.bg, color:palette.text, fontFamily:theme.font.sans, display:'flex'}}>
      <style>{`
        body { background:${palette.bg}; }
        .nav-item:hover { background:${palette.bgHover}; }
        .app-card:hover { border-color:${palette.borderH} !important; transform:translateY(-2px); box-shadow:0 14px 40px -22px rgba(40,30,80,0.32); }
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
        display:'flex', flexDirection:'column' as const, padding:'16px 14px',
      }}>
        {/* Brand mark — matches Landing's logo language */}
        <button onClick={()=>navigate('/')} style={{
          background:'transparent', border:'none', cursor:'pointer', padding:'2px 4px',
          display:'flex', alignItems:'center', gap:9, marginBottom:16,
        }}>
          <span style={ui.logoMark}/>
          <span style={{fontSize:18, fontWeight:800, letterSpacing:-0.5, color:palette.text}}>ezclaude</span>
        </button>

        {/* Workspace switcher */}
        <button style={{
          background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:theme.radius.pill, padding:'9px 12px',
          display:'flex', alignItems:'center', gap:9, cursor:'pointer', color:palette.text, marginBottom:10,
          boxShadow:palette.shadow,
        }}>
          <span style={{width:22, height:22, borderRadius:6, background:`linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`, display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff'}}>
            {firstName[0]?.toUpperCase()}
          </span>
          <span style={{flex:1, textAlign:'left' as const, fontSize:13.5, fontWeight:600}}>{workspaceName}</span>
        </button>

        {/* Primary CTA — solid ink (Landing's primary button) */}
        <button onClick={startBuild} style={{
          background:palette.text, color:'#fff', border:'none', borderRadius:theme.radius.button, padding:'11px 14px',
          fontWeight:600, fontSize:13.5, cursor:'pointer', marginBottom:8, marginTop:14,
          display:'flex', alignItems:'center', gap:8, justifyContent:'center',
        }}>
          <Icon as={Plus} size={16} tone="white" /> Buat baru / New
        </button>

        {/* Nav items */}
        <div style={{display:'flex', flexDirection:'column' as const, gap:1, marginTop:10}}>
          {[
            { icon:MessageSquare, label:'Chat with Claude', active:false, soon:false, onClick:()=>navigate('/studio') },
            { icon:Home, label:'Home', active:true, soon:false, onClick:()=>{} },
            { icon:FolderOpen, label:`Projects (${apps.length})`, active:false, soon:false, onClick:()=>{ document.getElementById('apps-grid')?.scrollIntoView({behavior:'smooth'}) } },
          ].map(n => (
            <button key={n.label} onClick={n.onClick} className="nav-item" style={{
              background: n.active ? palette.bgHover : 'transparent',
              border:'none', textAlign:'left' as const, padding:'9px 12px', borderRadius:8,
              color: n.active ? palette.text : palette.textMid, fontSize:13.5, cursor:'pointer',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <Icon as={n.icon} size={16} tone={n.active ? 'ink' : 'muted'} />
              <span style={{fontWeight: n.active ? 600 : 400}}>{n.label}</span>
            </button>
          ))}
        </div>

        <div style={{flex:1}}/>

        {/* Plan info at bottom */}
        <div style={{padding:'14px 12px', background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:theme.radius.card, marginBottom:10, boxShadow:palette.shadow}}>
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
          {plan === 'starter' && (
            <button style={{
              width:'100%', marginTop:12, padding:'8px 0', background:palette.text, color:'#fff',
              border:'none', borderRadius:theme.radius.button, fontSize:12, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            }}><Icon as={Sparkles} size={13} tone="white" /> Upgrade plan</button>
          )}
        </div>

        {/* User profile pill */}
        <div style={{display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:theme.radius.pill, background:palette.bgCard, border:`1px solid ${palette.border}`, boxShadow:palette.shadow}}>
          <span style={{width:26, height:26, borderRadius:'50%', background:palette.accentBg, color:palette.accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, border:`1px solid ${palette.accent}33`}}>
            {firstName[0]?.toUpperCase()}
          </span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:12, color:palette.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const}}>{firstName}</div>
            <div style={{fontSize:10, color:palette.textDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const}}>{user?.email}</div>
          </div>
          <button onClick={signOut} title="Sign out" style={{background:'transparent', border:'none', color:palette.textDim, cursor:'pointer', padding:6, borderRadius:6, display:'grid', placeItems:'center'}}><Icon as={LogOut} size={15} tone="muted" /></button>
        </div>
      </aside>

      {/* ──────────────── MAIN CONTENT ──────────────── */}
      <main style={{flex:1, padding:'0 32px 64px', overflowX:'hidden' as const}}>

        {/* Top bar: tiny workspace pill (Replit-style) */}
        <div style={{padding:'18px 0 0', display:'flex', justifyContent:'flex-end' as const, alignItems:'center'}}>
          <div style={{display:'flex', alignItems:'center', gap:7, padding:'6px 12px', background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:18, fontSize:12, color:palette.textMid, boxShadow:palette.shadow}}>
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
            <span style={{display:'flex', alignItems:'center', gap:7}}>
              {githubBanner.kind === 'success' ? <Check size={15}/> : <AlertTriangle size={15}/>} {githubBanner.text}
            </span>
            <button onClick={()=>setGithubBanner(null)} style={{background:'transparent', border:'none', color:'inherit', cursor:'pointer', display:'grid', placeItems:'center'}}><X size={15}/></button>
          </div>
        )}

        {/* HERO */}
        <div className="fade-in" style={{maxWidth:760, margin:'80px auto 0'}}>
          <h1 style={{
            fontSize:'clamp(30px,4vw,42px)', fontWeight:800, textAlign:'center' as const,
            color:palette.text, marginBottom:32, letterSpacing:-1, lineHeight:1.1,
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
                background:palette.bgHover, border:`1px solid ${palette.border}`, borderRadius:theme.radius.panel,
                padding:'20px 110px 52px 20px', color:palette.text, fontFamily:theme.font.body, fontSize:16,
                lineHeight:1.55, resize:'none' as const, outline:'none', transition:'all 0.15s',
                minHeight:96, boxShadow:theme.shadow.panel,
              }}
            />
            <div style={{position:'absolute' as const, bottom:14, left:16, display:'flex', gap:6, alignItems:'center'}}>
              <button title="Attach reference" style={{background:'#fff', border:`1px solid ${palette.borderH}`, borderRadius:'50%', width:34, height:34, color:palette.textDim, cursor:'pointer', display:'grid', placeItems:'center'}}><Icon as={Plus} size={17} tone="muted" /></button>
            </div>
            <button
              onClick={startBuild}
              disabled={!heroPrompt.trim()}
              style={{
                position:'absolute' as const, bottom:13, right:13,
                background: heroPrompt.trim() ? palette.text : palette.bgCard,
                color: heroPrompt.trim() ? '#fff' : palette.textDim,
                border: heroPrompt.trim() ? 'none' : `1px solid ${palette.border}`, borderRadius:theme.radius.button, padding:'9px 15px',
                fontWeight:600, fontSize:13, cursor: heroPrompt.trim() ? 'pointer' : 'not-allowed',
                display:'flex', alignItems:'center', gap:6,
              }}
            >
              <span>Build</span>
              <Icon as={ArrowUp} size={13} tone={heroPrompt.trim() ? 'white' : 'muted'} />
            </button>
          </div>

          {/* Category chips */}
          <div style={{display:'flex', justifyContent:'center', gap:8, marginTop:22, flexWrap:'wrap' as const}}>
            {[
              { icon:Globe, label:'Web App', tag:'web' },
              { icon:Smartphone, label:'Mobile-friendly', tag:'mobile' },
              { icon:Palette, label:'Marketing Site', tag:'marketing' },
              { icon:BarChart3, label:'Dashboard', tag:'dashboard' },
              { icon:Bot, label:'AI Tool', tag:'ai' },
              { icon:Wrench, label:'Internal Tool', tag:'internal' },
            ].map(c => (
              <button key={c.tag} className="chip" onClick={() => navigate(`/builder?type=${c.tag}`)} style={{
                background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:9, padding:'8px 13px',
                color:palette.textMid, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:7,
                transition:'all 0.15s',
              }}>
                <Icon as={c.icon} size={15} tone="muted" />
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
            <button onClick={() => setExampleIdx(i => (i+1) % examples.length)} title="Next example" style={{background:'transparent', border:'none', color:palette.textDim, cursor:'pointer', display:'grid', placeItems:'center'}}><Icon as={RefreshCw} size={14} tone="muted" /></button>
          </div>
        </div>

        {/* ── RECENT APPS ── */}
        <div id="apps-grid" style={{maxWidth:1100, margin:'80px auto 0'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:18}}>
            <div>
              <h2 style={{fontSize:18, fontWeight:600, color:palette.text, margin:0}}>Recent projects</h2>
              <div style={{fontSize:13, color:palette.textDim, marginTop:4}}>{apps.length} app{apps.length===1?'':'s'} in your library</div>
            </div>
            <button onClick={() => navigate('/builder')} style={{
              background:'#fff', border:`1px solid ${palette.borderH}`, borderRadius:theme.radius.button, padding:'9px 16px',
              color:palette.text, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
            }}>+ New project</button>
          </div>

          {apps.length === 0 ? (
            <div style={{
              background:palette.bgPanel, border:`1px dashed ${palette.borderH}`, borderRadius:theme.radius.card,
              padding:'56px 32px', textAlign:'center' as const,
            }}>
              <div style={{marginBottom:14, display:'grid', placeItems:'center'}}><Icon as={Sparkles} size={34} tone="faint" /></div>
              <div style={{fontSize:15, color:palette.text, fontWeight:600, marginBottom:6}}>No projects yet</div>
              <div style={{fontSize:13, color:palette.textDim, lineHeight:1.6, maxWidth:380, margin:'0 auto 22px'}}>
                Type your idea above. {jarvis?.jarvis_name || 'JARVIS'} will plan, estimate the budget, and build your first app.
              </div>
              <button onClick={() => navigate('/builder')} style={{
                padding:'11px 22px', background:palette.text, color:'#fff', border:'none', borderRadius:theme.radius.button,
                fontSize:13, fontWeight:600, cursor:'pointer'
              }}>Build my first app </button>
            </div>
          ) : (
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14}}>
              {apps.map(app => (
                <div key={app.id} className="app-card" style={{
                  background:palette.bgCard, border:`1px solid ${palette.border}`, borderRadius:theme.radius.card,
                  padding:20, transition:'all 0.15s', cursor:'pointer', boxShadow:palette.shadow,
                }}>
                  <div onClick={()=>navigate(`/builder?app=${app.id}`)}>
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
                  <div style={{display:'flex', gap:6, paddingTop:12, borderTop:`1px solid ${palette.border}`, position:'relative' as const}}>
                    <button
                      onClick={(e)=>{ e.stopPropagation(); navigate(`/builder?app=${app.id}`) }}
                      style={{
                        flex:1, padding:'8px 10px', background:palette.text, color:'#fff',
                        border:'none', borderRadius:theme.radius.pill, fontSize:12, fontWeight:600, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                      }}
                    >Open <Icon as={ArrowUp} size={12} tone="white" style={{transform:'rotate(90deg)'}} /></button>
                    {/* Secondary actions tucked behind a single "More" menu (PDF + GitHub) */}
                    <button
                      title="More"
                      onClick={(e)=>{ e.stopPropagation(); setMenuAppId(menuAppId === app.id ? null : app.id) }}
                      style={{
                        padding:'7px 10px', background:'transparent', color:palette.textMid,
                        border:`1px solid ${palette.border}`, borderRadius:9, cursor:'pointer',
                        display:'grid', placeItems:'center',
                      }}
                    ><Icon as={MoreHorizontal} size={15} tone="muted" /></button>
                    {menuAppId === app.id && (
                      <div onClick={e=>e.stopPropagation()} style={{
                        position:'absolute' as const, right:0, bottom:'calc(100% + 6px)', zIndex:20,
                        background:'#fff', border:`1px solid ${palette.border}`, borderRadius:theme.radius.card,
                        boxShadow:theme.shadow.panel, padding:6, minWidth:200, display:'flex', flexDirection:'column' as const, gap:2,
                      }}>
                        <button
                          onClick={()=>{ setMenuAppId(null); navigate(`/builder?app=${app.id}&action=pdf`) }}
                          title={app.proposal_data ? 'Download proposal as PDF' : 'A proposal is generated first (~30s)'}
                          style={{display:'flex', alignItems:'center', gap:9, padding:'9px 10px', background:'transparent', border:'none', borderRadius:8, fontSize:12.5, color:palette.text, cursor:'pointer', textAlign:'left' as const}}
                          className="nav-item"
                        ><Icon as={FileText} size={15} tone="muted" /> Download PDF</button>

                        {app.github_repo_url ? (
                          <>
                            <a href={app.github_repo_url} target="_blank" rel="noreferrer" onClick={()=>setMenuAppId(null)}
                              style={{display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:8, fontSize:12.5, color:palette.text, textDecoration:'none' as const}}
                              className="nav-item"
                            ><Icon as={Github} size={15} tone="muted" /> View on GitHub</a>
                            <button disabled={savingAppId === app.id}
                              onClick={()=>{ setMenuAppId(null); saveAppToGithub(app.id) }}
                              style={{display:'flex', alignItems:'center', gap:9, padding:'9px 10px', background:'transparent', border:'none', borderRadius:8, fontSize:12.5, color:palette.text, cursor:'pointer', textAlign:'left' as const, opacity: savingAppId===app.id?0.6:1}}
                              className="nav-item"
                            ><Icon as={ArrowUp} size={15} tone="muted" /> {savingAppId === app.id ? 'Saving backup…' : 'Save a backup copy'}</button>
                            <button disabled={savingAppId === app.id}
                              onClick={()=>{ setMenuAppId(null); pullAppFromGithub(app.id, app.name || 'app') }}
                              style={{display:'flex', alignItems:'center', gap:9, padding:'9px 10px', background:'transparent', border:'none', borderRadius:8, fontSize:12.5, color:palette.textMid, cursor:'pointer', textAlign:'left' as const, opacity: savingAppId===app.id?0.6:1}}
                              className="nav-item"
                            ><Icon as={RefreshCw} size={15} tone="muted" /> Restore from backup</button>
                          </>
                        ) : (
                          <button disabled={savingAppId === app.id}
                            onClick={()=>{ setMenuAppId(null); githubConn ? saveAppToGithub(app.id) : startGithubConnect() }}
                            style={{display:'flex', alignItems:'center', gap:9, padding:'9px 10px', background:'transparent', border:'none', borderRadius:8, fontSize:12.5, color:palette.text, cursor:'pointer', textAlign:'left' as const, opacity: savingAppId===app.id?0.6:1}}
                            className="nav-item"
                          ><Icon as={Github} size={15} tone="muted" /> {savingAppId === app.id ? 'Saving…' : (githubConn ? 'Save a backup copy' : 'Connect GitHub to back up')}</button>
                        )}
                      </div>
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
