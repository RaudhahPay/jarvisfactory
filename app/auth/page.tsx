'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [mode, setMode] = useState<'login'|'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

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
        router.push('/studio')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      // Check if onboarded
      const { data: { user } } = await supabase.auth.getUser()
      if (user) router.push('/studio')
    }
    setLoading(false)
  }

  const c: Record<string, React.CSSProperties> = {
    page: { minHeight:'100vh', background:'#05050d', display:'flex', alignItems:'center', justifyContent:'center', padding:24 },
    card: { background:'#0a0a18', border:'1px solid #1a1a35', borderRadius:16, padding:'48px 40px', width:'100%', maxWidth:420 },
    logo: { fontFamily:"'Space Mono',monospace", fontSize:14, color:'#00e5b0', fontWeight:700, marginBottom:32, display:'block' },
    title: { fontFamily:"'Bebas Neue',sans-serif", fontSize:36, letterSpacing:1, marginBottom:6 },
    sub: { fontSize:13, color:'#8888aa', marginBottom:32 },
    label: { fontSize:11, fontFamily:"'Space Mono',monospace", color:'#8888aa', textTransform:'uppercase' as const, letterSpacing:1, display:'block', marginBottom:6 },
    input: { width:'100%', padding:'12px 14px', background:'#161625', border:'1px solid #1a1a35', borderRadius:8, color:'#f0f0fa', fontFamily:"'DM Sans',sans-serif", fontSize:14, outline:'none', marginBottom:16, boxSizing:'border-box' as const },
    btn: { width:'100%', padding:14, background:'#00e5b0', color:'#000', border:'none', borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 },
    toggle: { textAlign:'center' as const, marginTop:20, fontSize:13, color:'#8888aa' },
    toggleLink: { color:'#00e5b0', cursor:'pointer', fontWeight:600 },
    error: { background:'rgba(255,77,109,0.1)', border:'1px solid rgba(255,77,109,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#ff4d6d', marginBottom:16 },
    success: { background:'rgba(0,229,176,0.1)', border:'1px solid rgba(0,229,176,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#00e5b0', marginBottom:16 },
    tabs: { display:'flex', gap:4, marginBottom:28, background:'#161625', borderRadius:8, padding:4 },
    tab: { flex:1, padding:'8px 0', textAlign:'center' as const, borderRadius:6, fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, cursor:'pointer', border:'none' },
  }

  return (
    <div style={c.page}>
      <div style={c.card}>
        <span style={c.logo}>ezclaude</span>
        <div style={c.title}>{mode==='signup' ? 'Create Account' : 'Welcome Back'}</div>
        <div style={c.sub}>{mode==='signup' ? 'Make Claude easy — no code needed.' : 'Welcome back to ezclaude.'}</div>

        <div style={c.tabs}>
          <button style={{...c.tab, background: mode==='signup' ? '#00e5b0' : 'transparent', color: mode==='signup' ? '#000' : '#8888aa'}} onClick={()=>setMode('signup')}>Sign Up</button>
          <button style={{...c.tab, background: mode==='login' ? '#00e5b0' : 'transparent', color: mode==='login' ? '#000' : '#8888aa'}} onClick={()=>setMode('login')}>Sign In</button>
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
