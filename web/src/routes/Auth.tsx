import { useState } from 'react'
import { getSupabase } from '@/web/src/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { theme, ui } from '@/web/src/lib/theme'

export default function AuthPage() {
  const [mode, setMode] = useState<'login'|'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const supabase = getSupabase()

  async function handleAuth() {
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true); setError(''); setMsg('')

    if (mode === 'signup') {
      if (!name) { setError('Please enter your name.'); setLoading(false); return }
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        // Create profile
        await supabase.from('profiles').insert({
          id: data.user.id,
          full_name: name,
          email,
          onboarded: false,
          created_at: new Date().toISOString()
        })
        navigate('/studio')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      // Check if onboarded
      const { data: { user } } = await supabase.auth.getUser()
      if (user) navigate('/studio')
    }
    setLoading(false)
  }

  const c: Record<string, React.CSSProperties> = {
    page: { minHeight:'100vh', background:'linear-gradient(180deg, #ffffff 0%, #eef2ff 30%, #ede9fe 55%, #d6f5ec 100%)', color:theme.color.ink, fontFamily:theme.font.sans, display:'flex', alignItems:'center', justifyContent:'center', padding:24 },
    card: { ...ui.card, boxShadow:theme.shadow.panel, borderRadius:theme.radius.panel, padding:'40px 36px', width:'100%', maxWidth:440 },
    logoWrap: { display:'flex', alignItems:'center', gap:9, marginBottom:28 },
    logoMark: ui.logoMark,
    logo: { fontSize:18, fontWeight:800, letterSpacing:-0.5, color:theme.color.ink },
    title: { fontSize:30, lineHeight:1.05, letterSpacing:-1, fontWeight:800, marginBottom:6, color:theme.color.ink },
    sub: { fontSize:15, color:theme.color.muted, marginBottom:28, lineHeight:1.5 },
    label: { fontSize:13, fontWeight:600, color:theme.color.inkSoft, display:'block', marginBottom:7 },
    input: { ...ui.input, marginBottom:16, boxSizing:'border-box' as const },
    btn: { ...ui.btnSolid, width:'100%', padding:13, fontSize:15, marginTop:8, borderRadius:theme.radius.button },
    toggle: { textAlign:'center' as const, marginTop:22, fontSize:14, color:theme.color.muted },
    toggleLink: { color:theme.color.accent, cursor:'pointer', fontWeight:700 },
    error: { background:'rgba(220,38,38,0.06)', border:'1px solid rgba(220,38,38,0.22)', borderRadius:theme.radius.button, padding:'10px 14px', fontSize:13, color:'#dc2626', marginBottom:16 },
    success: { background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.28)', borderRadius:theme.radius.button, padding:'10px 14px', fontSize:13, color:theme.color.accent, marginBottom:16 },
    tabs: { display:'flex', gap:4, marginBottom:26, background:theme.color.surface, border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.button, padding:4 },
    tab: { flex:1, padding:'9px 0', textAlign:'center' as const, borderRadius:theme.radius.pill, fontSize:13, fontWeight:700, cursor:'pointer', border:'none', background:'transparent' },
  }

  return (
    <div style={c.page}>
      <div style={c.card}>
        <div style={c.logoWrap}>
          <div style={c.logoMark}/>
          <span style={c.logo}>ezclaude</span>
        </div>
        <div style={c.title}>{mode==='signup' ? 'Create Account' : 'Welcome Back'}</div>
        <div style={c.sub}>{mode==='signup' ? 'Make Claude easy — no code needed.' : 'Welcome back to ezclaude.'}</div>

        <div style={c.tabs}>
          <button style={{...c.tab, background: mode==='signup' ? theme.color.ink : 'transparent', color: mode==='signup' ? '#fff' : theme.color.muted}} onClick={()=>setMode('signup')}>Sign Up</button>
          <button style={{...c.tab, background: mode==='login' ? theme.color.ink : 'transparent', color: mode==='login' ? '#fff' : theme.color.muted}} onClick={()=>setMode('login')}>Sign In</button>
        </div>

        {error && <div style={c.error}>{error}</div>}
        {msg && <div style={c.success}>{msg}</div>}

        {mode==='signup' && (
          <>
            <label style={c.label}>Full Name</label>
            <input style={c.input} type="text" placeholder="e.g. Coach Fadzil" value={name} onChange={e=>setName(e.target.value)}/>
          </>
        )}
        <label style={c.label}>Email Address</label>
        <input style={c.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <label style={c.label}>Password</label>
        <input style={c.input} type="password" placeholder="Min 8 characters" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAuth()}/>

        <button style={c.btn} onClick={handleAuth} disabled={loading}>
          {loading ? '...' : mode==='signup' ? 'Create My Account →' : 'Sign In →'}
        </button>

        <div style={c.toggle}>
          {mode==='signup' ? 'Already have an account? ' : "Don't have an account? "}
          <span style={c.toggleLink} onClick={()=>setMode(mode==='signup'?'login':'signup')}>
            {mode==='signup' ? 'Sign In' : 'Sign Up'}
          </span>
        </div>
      </div>
    </div>
  )
}
