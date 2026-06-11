'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const s: Record<string, React.CSSProperties> = {
  body: { minHeight:'100vh', background:'#05050d', color:'#f0f0fa', fontFamily:"'DM Sans',sans-serif", overflowX:'hidden' },
  nav: { position:'fixed' as const, top:0, left:0, right:0, zIndex:100, padding:'18px 60px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(5,5,13,0.9)', backdropFilter:'blur(12px)', borderBottom:'1px solid #1a1a35' },
  logo: { fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:700, color:'#00e5b0', letterSpacing:-1 },
  navBtn: { padding:'8px 20px', background:'#00e5b0', color:'#000', border:'none', borderRadius:6, fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, cursor:'pointer' },
  hero: { minHeight:'100vh', display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', textAlign:'center' as const, padding:'120px 40px 80px', position:'relative' as const },
  badge: { display:'inline-flex', alignItems:'center', gap:8, background:'rgba(0,229,176,0.08)', border:'1px solid rgba(0,229,176,0.2)', padding:'6px 16px', borderRadius:20, fontFamily:"'Space Mono',monospace", fontSize:11, color:'#00e5b0', letterSpacing:1, marginBottom:32 },
  title: { fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(64px,10vw,130px)', lineHeight:0.92, letterSpacing:2, marginBottom:12 },
  accent: { color:'#00e5b0' },
  dim: { color:'rgba(240,240,250,0.2)' },
  sub: { fontSize:'clamp(16px,2vw,20px)', color:'#8888aa', maxWidth:600, margin:'24px auto 0', lineHeight:1.7, fontWeight:300 },
  form: { marginTop:44, display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' as const },
  input: { padding:'14px 20px', background:'rgba(255,255,255,0.05)', border:'1px solid #1a1a35', borderRadius:8, color:'#f0f0fa', fontFamily:"'DM Sans',sans-serif", fontSize:14, width:280, outline:'none' },
  btn: { padding:'14px 28px', background:'#00e5b0', color:'#000', border:'none', borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, cursor:'pointer' },
  stats: { marginTop:60, display:'flex', gap:48, justifyContent:'center', flexWrap:'wrap' as const },
  statNum: { fontFamily:"'Bebas Neue',sans-serif", fontSize:48, color:'#00e5b0', lineHeight:1 },
  statLabel: { fontSize:12, color:'#8888aa', fontFamily:"'Space Mono',monospace", marginTop:4 },
  section: { padding:'100px 40px', maxWidth:1100, margin:'0 auto' },
  sectionTag: { fontFamily:"'Space Mono',monospace", fontSize:11, color:'#00e5b0', letterSpacing:2, textTransform:'uppercase' as const, marginBottom:16 },
  sectionTitle: { fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(40px,5vw,70px)', lineHeight:1, letterSpacing:1, marginBottom:20 },
  grid4: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:2, marginTop:60, border:'1px solid #1a1a35', borderRadius:12, overflow:'hidden' },
  step: { padding:'36px 28px', background:'#0a0a18', borderRight:'1px solid #1a1a35' },
  stepNum: { fontFamily:"'Bebas Neue',sans-serif", fontSize:56, color:'rgba(0,229,176,0.1)', lineHeight:1, marginBottom:12 },
  stepTitle: { fontSize:16, fontWeight:600, marginBottom:8 },
  stepDesc: { fontSize:13, color:'#8888aa', lineHeight:1.7 },
  stepTag: { color:'#00e5b0', fontFamily:"'Space Mono',monospace", fontSize:11, marginTop:10 },
  pricingGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, marginTop:60 },
  priceCard: { background:'#0a0a18', border:'1px solid #1a1a35', borderRadius:14, padding:'32px 28px', position:'relative' as const },
  priceCardFeatured: { background:'linear-gradient(135deg,rgba(0,229,176,0.05),#0a0a18)', border:'1px solid #00e5b0', borderRadius:14, padding:'32px 28px', position:'relative' as const },
  priceBadge: { position:'absolute' as const, top:-12, left:'50%', transform:'translateX(-50%)', background:'#00e5b0', color:'#000', fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:700, padding:'4px 14px', borderRadius:20, whiteSpace:'nowrap' as const },
  priceName: { fontFamily:"'Space Mono',monospace", fontSize:12, color:'#8888aa', letterSpacing:1, textTransform:'uppercase' as const, marginBottom:8 },
  priceAmt: { fontFamily:"'Bebas Neue',sans-serif", fontSize:52, lineHeight:1, marginBottom:4 },
  pricePeriod: { fontSize:12, color:'#5a5a78', fontFamily:"'Space Mono',monospace", marginBottom:24 },
  priceFeatures: { listStyle:'none', display:'flex', flexDirection:'column' as const, gap:10, marginBottom:28, padding:0 },
  priceBtn: { width:'100%', padding:13, borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid #1a1a35', background:'transparent', color:'#8888aa' },
  priceBtnSolid: { width:'100%', padding:13, borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, cursor:'pointer', border:'none', background:'#00e5b0', color:'#000' },
  footer: { borderTop:'1px solid #1a1a35', padding:'40px 60px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:16 },
  success: { padding:'14px 24px', background:'rgba(0,229,176,0.1)', border:'1px solid rgba(0,229,176,0.3)', borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:13, color:'#00e5b0' },
}

export default function Home() {
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function joinWaitlist() {
    if (!email || !email.includes('@')) return
    setLoading(true)
    await supabase.from('waitlist').insert({ email, created_at: new Date().toISOString() }).then(() => {
      setJoined(true)
      setLoading(false)
    })
  }

  return (
    <div style={s.body}>
      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.logo}>ezclaude</div>
        <div style={{display:'flex',gap:16,alignItems:'center'}}>
          <a href="#how" style={{color:'#8888aa',textDecoration:'none',fontFamily:"'Space Mono',monospace",fontSize:12}}>How It Works</a>
          <a href="#pricing" style={{color:'#8888aa',textDecoration:'none',fontFamily:"'Space Mono',monospace",fontSize:12}}>Pricing</a>
          <button style={s.navBtn} onClick={() => router.push('/auth')}>Sign In →</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={s.hero}>
        <div style={{position:'absolute',top:-100,left:-100,width:600,height:600,background:'rgba(0,229,176,0.04)',borderRadius:'50%',filter:'blur(120px)'}}/>
        <div style={{position:'absolute',bottom:-100,right:-100,width:500,height:500,background:'rgba(123,111,255,0.05)',borderRadius:'50%',filter:'blur(120px)'}}/>
        <div style={{position:'relative',zIndex:2}}>
          <div style={s.badge}>💬 Ask · ✨ Create · ⚡ Build — no code</div>
          <div style={s.title}>
            CLAUDE,<br/>
            <span style={s.accent}>MADE EASY</span><br/>
            <span style={s.dim}>FOR NON-CODERS</span>
          </div>
          <p style={s.sub}>
            <strong style={{color:'#f0f0fa'}}>ezclaude</strong> makes Claude easy for people who don't code. <strong style={{color:'#f0f0fa'}}>Ask</strong> it anything, <strong style={{color:'#f0f0fa'}}>create</strong> real documents, decks and spreadsheets, or <strong style={{color:'#f0f0fa'}}>build and launch a real app</strong> — all by just describing what you want.
          </p>
          <div style={s.form}>
            <button style={s.btn} onClick={() => router.push('/auth')}>Start free →</button>
            <button style={{...s.btn, background:'transparent', border:'1px solid #2a2a45', color:'#f0f0fa'}} onClick={() => router.push('/studio')}>Open ezclaude</button>
          </div>
          <div style={s.stats}>
            {[['∞','Things You Can Make'],['0','Lines of Code'],['3','Ways to Use Claude'],['1','Simple App']].map(([n,l]) => (
              <div key={l} style={{textAlign:'center'}}>
                <div style={s.statNum}>{n}</div>
                <div style={s.statLabel}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={{background:'#0a0a18',borderTop:'1px solid #1a1a35',borderBottom:'1px solid #1a1a35'}} id="how">
        <div style={s.section}>
          <div style={s.sectionTag}>How It Works</div>
          <div style={s.sectionTitle}>THREE WAYS TO USE <span style={s.accent}>CLAUDE</span> — NO CODE</div>
          <div style={s.grid4}>
            {[
              ['01','💬','Ask','Chat with Claude about anything — questions, drafts, research, explanations. Plain language, English or Bahasa Melayu.','→ just talk'],
              ['02','✨','Create','Describe a document, slide deck, spreadsheet or PDF and Claude makes the real file for you to download.','→ no code'],
              ['03','⚡','Build','Describe an app and Claude builds and launches it — database, hosting, the works. You own everything.','→ real, live apps'],
            ].map(([num,icon,title,desc,tag]) => (
              <div key={num} style={s.step}>
                <div style={s.stepNum}>{num}</div>
                <div style={{fontSize:28,marginBottom:12}}>{icon}</div>
                <div style={s.stepTitle}>{title}</div>
                <div style={s.stepDesc}>{desc}</div>
                <div style={s.stepTag}>{tag}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing">
        <div style={s.section}>
          <div style={s.sectionTag}>Pricing</div>
          <div style={s.sectionTitle}>SIMPLE, <span style={{color:'#ffd166'}}>AFFORDABLE</span> PRICING</div>
          <div style={s.pricingGrid}>
            {/* Starter */}
            <div style={s.priceCard}>
              <div style={s.priceName}>Starter</div>
              <div style={s.priceAmt}>RM49<span style={{fontSize:16,color:'#8888aa',fontFamily:"'DM Sans',sans-serif",fontWeight:300}}>/mo</span></div>
              <div style={s.pricePeriod}>Billed monthly</div>
              <ul style={s.priceFeatures}>
                {['5 apps per month','Supabase database (shared)','Subdomain hosting','GitHub sync','Email support'].map(f=>(
                  <li key={f} style={{fontSize:13,color:'#8888aa',display:'flex',gap:8,alignItems:'flex-start'}}><span style={{color:'#00e5b0'}}>→</span>{f}</li>
                ))}
              </ul>
              <button style={s.priceBtn} onClick={() => router.push('/auth')}>Get Started</button>
            </div>
            {/* Builder */}
            <div style={s.priceCardFeatured}>
              <div style={s.priceBadge}>MOST POPULAR</div>
              <div style={s.priceName}>Builder</div>
              <div style={{...s.priceAmt,color:'#00e5b0'}}>RM149<span style={{fontSize:16,color:'#8888aa',fontFamily:"'DM Sans',sans-serif",fontWeight:300}}>/mo</span></div>
              <div style={s.pricePeriod}>Billed monthly</div>
              <ul style={s.priceFeatures}>
                {['20 apps per month','Supabase database (dedicated)','Custom domain included','GitHub sync + auto-deploy','JARVIS memory & history','Priority support'].map(f=>(
                  <li key={f} style={{fontSize:13,color:'#8888aa',display:'flex',gap:8,alignItems:'flex-start'}}><span style={{color:'#00e5b0'}}>→</span>{f}</li>
                ))}
              </ul>
              <button style={s.priceBtnSolid} onClick={() => router.push('/auth')}>Get Early Access →</button>
            </div>
            {/* Agency */}
            <div style={s.priceCard}>
              <div style={s.priceName}>Agency</div>
              <div style={s.priceAmt}>RM399<span style={{fontSize:16,color:'#8888aa',fontFamily:"'DM Sans',sans-serif",fontWeight:300}}>/mo</span></div>
              <div style={s.pricePeriod}>Billed monthly</div>
              <ul style={s.priceFeatures}>
                {['Unlimited apps','White-label your JARVIS','10 client seats','Custom domain + branding','Dedicated account manager','API access'].map(f=>(
                  <li key={f} style={{fontSize:13,color:'#8888aa',display:'flex',gap:8,alignItems:'flex-start'}}><span style={{color:'#00e5b0'}}>→</span>{f}</li>
                ))}
              </ul>
              <button style={s.priceBtn} onClick={() => router.push('/auth')}>Contact Us</button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:'#00e5b0',fontWeight:700}}>ezclaude</div>
        <div style={{fontSize:11,color:'#5a5a78',fontFamily:"'Space Mono',monospace"}}>© 2026 ezclaude — Make Claude easy. Built by Coach Fadzil</div>
        <button style={{...s.navBtn,fontSize:12}} onClick={() => router.push('/auth')}>Start Building →</button>
      </footer>
    </div>
  )
}
