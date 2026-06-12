import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Mode config — the differentiator: ezclaude's three ways to use Claude,
// surfaced right inside the Lovable-style prompt box.
const MODES = [
  { key: 'Build',  ph: 'Ask ezclaude to build a dashboard to…',         hint: 'real, live apps' },
  { key: 'Create', ph: 'Ask ezclaude to make a pitch deck about…',       hint: 'docs · decks · sheets' },
  { key: 'Ask',    ph: 'Ask ezclaude anything…',                         hint: 'chat, research, drafts' },
] as const

const ACCENT = '#10b981'   // ezclaude teal
const INK = '#0a0a18'      // near-black ink

const s: Record<string, React.CSSProperties> = {
  body: { minHeight:'100vh', background:'#ffffff', color:INK, fontFamily:"'Plus Jakarta Sans','DM Sans',sans-serif", overflowX:'hidden' },

  // gradient hero — white → blue → violet → teal (ezclaude palette, not Lovable's pink→orange)
  hero: { position:'relative' as const, minHeight:'100vh', display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', textAlign:'center' as const, padding:'140px 24px 100px', background:'linear-gradient(180deg, #ffffff 0%, #eef2ff 26%, #ede9fe 46%, #d6f5ec 72%, #b9f0df 100%)' },
  glow: { position:'absolute' as const, top:'18%', left:'50%', transform:'translateX(-50%)', width:760, height:420, background:'radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0))', filter:'blur(20px)', zIndex:1 },

  nav: { position:'fixed' as const, top:0, left:0, right:0, zIndex:100, padding:'16px 40px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  navInner: { display:'flex', alignItems:'center', gap:34 },
  logoWrap: { display:'flex', alignItems:'center', gap:9 },
  logoMark: { width:24, height:24, borderRadius:7, background:`linear-gradient(135deg, ${ACCENT}, #7b6fff)`, boxShadow:'0 2px 8px rgba(16,185,129,0.35)' },
  logo: { fontSize:18, fontWeight:800, letterSpacing:-0.5, color:INK },
  navLink: { color:'#3a3a52', textDecoration:'none', fontSize:14, fontWeight:500 },
  navRight: { display:'flex', alignItems:'center', gap:10 },
  loginBtn: { padding:'9px 18px', background:'#ffffff', color:INK, border:'1px solid #e3e3ee', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' },
  startBtn: { padding:'9px 18px', background:INK, color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' },

  title: { position:'relative' as const, zIndex:2, fontSize:'clamp(44px,7vw,92px)', lineHeight:1.02, letterSpacing:-2, fontWeight:800, margin:0, color:INK },
  sub: { position:'relative' as const, zIndex:2, fontSize:'clamp(17px,2vw,21px)', color:'#4a4a63', maxWidth:560, margin:'22px auto 0', lineHeight:1.5, fontWeight:400 },

  // the signature prompt box
  box: { position:'relative' as const, zIndex:2, width:'min(720px,92vw)', margin:'44px auto 0', background:'#f7f5ef', border:'1px solid rgba(0,0,0,0.06)', borderRadius:26, boxShadow:'0 24px 60px -24px rgba(40,30,80,0.28), 0 2px 6px rgba(0,0,0,0.04)', padding:'22px 22px 16px', textAlign:'left' as const },
  textarea: { width:'100%', minHeight:64, resize:'none' as const, border:'none', outline:'none', background:'transparent', color:INK, fontFamily:"'DM Sans',sans-serif", fontSize:17, lineHeight:1.5 },
  boxRow: { display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 },
  plusBtn: { width:34, height:34, borderRadius:'50%', border:'1px solid #e2e0d6', background:'#fff', color:'#7a7a8c', fontSize:18, lineHeight:1, cursor:'pointer', display:'grid', placeItems:'center' },
  boxRight: { display:'flex', alignItems:'center', gap:10 },
  modePill: { display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:'#fff', border:'1px solid #e2e0d6', borderRadius:9, fontSize:13, fontWeight:600, color:INK, cursor:'pointer' },
  micBtn: { width:34, height:34, borderRadius:'50%', border:'none', background:'transparent', color:'#7a7a8c', fontSize:16, cursor:'pointer', display:'grid', placeItems:'center' },
  sendBtn: { width:38, height:38, borderRadius:'50%', border:'none', background:INK, color:'#fff', fontSize:17, cursor:'pointer', display:'grid', placeItems:'center' },
  hint: { position:'relative' as const, zIndex:2, marginTop:16, fontSize:13, color:'#5a5a72', fontWeight:500 },

  // light-themed sections (kept coherent with the new hero)
  section: { padding:'96px 24px', maxWidth:1080, margin:'0 auto' },
  sectionTag: { fontSize:12, color:ACCENT, letterSpacing:1.5, textTransform:'uppercase' as const, fontWeight:700, marginBottom:14 },
  sectionTitle: { fontSize:'clamp(30px,4.4vw,52px)', lineHeight:1.05, letterSpacing:-1, fontWeight:800, marginBottom:18, color:INK },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:16, marginTop:48 },
  step: { padding:'30px 26px', background:'#fff', border:'1px solid #ececf3', borderRadius:18, boxShadow:'0 8px 30px -20px rgba(40,30,80,0.25)' },
  stepIcon: { fontSize:26, marginBottom:14 },
  stepNum: { fontSize:12, fontWeight:700, color:'#b6b6c6', letterSpacing:1 },
  stepTitle: { fontSize:18, fontWeight:700, margin:'8px 0 8px' },
  stepDesc: { fontSize:14, color:'#5a5a72', lineHeight:1.6 },
  stepTag: { color:ACCENT, fontSize:13, fontWeight:600, marginTop:12 },

  pricingGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:18, marginTop:48 },
  priceCard: { background:'#fff', border:'1px solid #ececf3', borderRadius:20, padding:'34px 30px', position:'relative' as const, boxShadow:'0 8px 30px -22px rgba(40,30,80,0.25)' },
  priceCardFeatured: { background:'#fff', border:`2px solid ${ACCENT}`, borderRadius:20, padding:'34px 30px', position:'relative' as const, boxShadow:'0 18px 50px -24px rgba(16,185,129,0.4)' },
  priceBadge: { position:'absolute' as const, top:-12, left:'50%', transform:'translateX(-50%)', background:ACCENT, color:'#fff', fontSize:11, fontWeight:700, padding:'5px 14px', borderRadius:20, whiteSpace:'nowrap' as const, letterSpacing:0.5 },
  priceName: { fontSize:13, color:'#8a8a9c', letterSpacing:1, textTransform:'uppercase' as const, fontWeight:700, marginBottom:10 },
  priceAmt: { fontSize:46, lineHeight:1, fontWeight:800, marginBottom:4, color:INK },
  pricePeriod: { fontSize:13, color:'#9a9aac', marginBottom:24 },
  priceFeatures: { listStyle:'none', display:'flex', flexDirection:'column' as const, gap:11, marginBottom:28, padding:0 },
  priceFeat: { fontSize:14, color:'#4a4a63', display:'flex', gap:9, alignItems:'flex-start' },
  priceBtn: { width:'100%', padding:13, borderRadius:11, fontSize:14, fontWeight:700, cursor:'pointer', border:'1px solid #e3e3ee', background:'#fff', color:INK },
  priceBtnSolid: { width:'100%', padding:13, borderRadius:11, fontSize:14, fontWeight:700, cursor:'pointer', border:'none', background:INK, color:'#fff' },

  footer: { borderTop:'1px solid #ececf3', padding:'34px 40px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:16, background:'#faf9f6' },
}

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [modeIdx, setModeIdx] = useState(0)
  const navigate = useNavigate()
  const mode = MODES[modeIdx]

  function launch() {
    // carry the user's intent into the app, then send them to sign in
    if (prompt.trim()) {
      try { sessionStorage.setItem('ezclaude:prompt', prompt.trim()); sessionStorage.setItem('ezclaude:mode', mode.key) } catch {}
    }
    navigate('/auth')
  }

  return (
    <div style={s.body}>
      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.logoWrap}>
            <div style={s.logoMark}/>
            <span style={s.logo}>ezclaude</span>
          </div>
          <a href="#how" style={s.navLink}>How it works</a>
          <a href="#pricing" style={s.navLink}>Pricing</a>
          <a href="#" style={s.navLink}>Security</a>
        </div>
        <div style={s.navRight}>
          <button style={s.loginBtn} onClick={() => navigate('/auth')}>Log in</button>
          <button style={s.startBtn} onClick={() => navigate('/auth')}>Get started</button>
        </div>
      </nav>

      {/* HERO */}
      <header style={s.hero}>
        <div style={s.glow}/>
        <h1 style={s.title}>Build something real</h1>
        <p style={s.sub}>Create apps, docs and decks by chatting with Claude — no code.</p>

        {/* PROMPT BOX */}
        <div style={s.box}>
          <textarea
            style={s.textarea}
            placeholder={mode.ph}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) launch() }}
          />
          <div style={s.boxRow}>
            <button style={s.plusBtn} title="Add context" onClick={() => navigate('/auth')}>+</button>
            <div style={s.boxRight}>
              <button
                style={s.modePill}
                title="Switch mode — Build, Create, or Ask"
                onClick={() => setModeIdx((modeIdx + 1) % MODES.length)}
              >
                {mode.key} <span style={{color:'#9a9aac',fontSize:11}}>▾</span>
              </button>
              <button style={s.micBtn} title="Voice (coming soon)">🎤</button>
              <button style={s.sendBtn} title="Start (⌘↵)" onClick={launch}>↑</button>
            </div>
          </div>
        </div>
        <div style={s.hint}>Mode: <strong style={{color:INK}}>{mode.key}</strong> — {mode.hint}. Press ⌘↵ to start.</div>
      </header>

      {/* HOW IT WORKS */}
      <div id="how" style={{background:'#faf9f6', borderTop:'1px solid #ececf3', borderBottom:'1px solid #ececf3'}}>
        <div style={s.section}>
          <div style={s.sectionTag}>How it works</div>
          <div style={s.sectionTitle}>Three ways to use Claude — no code</div>
          <div style={s.grid}>
            {[
              ['01','💬','Ask','Chat with Claude about anything — questions, drafts, research, explanations. Plain language, English or Bahasa Melayu.','just talk'],
              ['02','✨','Create','Describe a document, slide deck, spreadsheet or PDF and Claude makes the real file for you to download.','no code'],
              ['03','⚡','Build','Describe an app and Claude builds and launches it — database, hosting, the works. You own everything.','real, live apps'],
            ].map(([num,icon,title,desc,tag]) => (
              <div key={num} style={s.step}>
                <div style={s.stepIcon}>{icon}</div>
                <div style={s.stepNum}>{num}</div>
                <div style={s.stepTitle}>{title}</div>
                <div style={s.stepDesc}>{desc}</div>
                <div style={s.stepTag}>→ {tag}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing">
        <div style={s.section}>
          <div style={s.sectionTag}>Pricing</div>
          <div style={s.sectionTitle}>Simple, affordable pricing</div>
          <div style={s.pricingGrid}>
            {/* Starter */}
            <div style={s.priceCard}>
              <div style={s.priceName}>Starter</div>
              <div style={s.priceAmt}>RM49<span style={{fontSize:16,color:'#9a9aac',fontWeight:500}}>/mo</span></div>
              <div style={s.pricePeriod}>Billed monthly</div>
              <ul style={s.priceFeatures}>
                {['5 apps per month','Supabase database (shared)','Subdomain hosting','GitHub sync','Email support'].map(f=>(
                  <li key={f} style={s.priceFeat}><span style={{color:ACCENT}}>→</span>{f}</li>
                ))}
              </ul>
              <button style={s.priceBtn} onClick={() => navigate('/auth')}>Get Started</button>
            </div>
            {/* Builder */}
            <div style={s.priceCardFeatured}>
              <div style={s.priceBadge}>MOST POPULAR</div>
              <div style={s.priceName}>Builder</div>
              <div style={{...s.priceAmt,color:ACCENT}}>RM149<span style={{fontSize:16,color:'#9a9aac',fontWeight:500}}>/mo</span></div>
              <div style={s.pricePeriod}>Billed monthly</div>
              <ul style={s.priceFeatures}>
                {['20 apps per month','Supabase database (dedicated)','Custom domain included','GitHub sync + auto-deploy','JARVIS memory & history','Priority support'].map(f=>(
                  <li key={f} style={s.priceFeat}><span style={{color:ACCENT}}>→</span>{f}</li>
                ))}
              </ul>
              <button style={s.priceBtnSolid} onClick={() => navigate('/auth')}>Get Early Access →</button>
            </div>
            {/* Agency */}
            <div style={s.priceCard}>
              <div style={s.priceName}>Agency</div>
              <div style={s.priceAmt}>RM399<span style={{fontSize:16,color:'#9a9aac',fontWeight:500}}>/mo</span></div>
              <div style={s.pricePeriod}>Billed monthly</div>
              <ul style={s.priceFeatures}>
                {['Unlimited apps','White-label your JARVIS','10 client seats','Custom domain + branding','Dedicated account manager','API access'].map(f=>(
                  <li key={f} style={s.priceFeat}><span style={{color:ACCENT}}>→</span>{f}</li>
                ))}
              </ul>
              <button style={s.priceBtn} onClick={() => navigate('/auth')}>Contact Us</button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={s.logoWrap}>
          <div style={s.logoMark}/>
          <span style={{fontWeight:800,color:INK}}>ezclaude</span>
        </div>
        <div style={{fontSize:12,color:'#9a9aac'}}>© 2026 ezclaude — Make Claude easy. Built by Coach Fadzil</div>
        <button style={s.startBtn} onClick={() => navigate('/auth')}>Start building →</button>
      </footer>
    </div>
  )
}
