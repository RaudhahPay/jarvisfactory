import { useState } from 'react'
import { getSupabase } from '@/web/src/lib/supabase'
import { useNavigate } from 'react-router-dom'

const steps = [
  {
    id: 'industry',
    q: "What industry are you in?",
    sub: "JARVIS will specialise in your domain",
    opts: ['Education / EdTech','F&B / Restaurant','E-commerce / Retail','Healthcare / Wellness','Finance / Fintech','Real Estate','Logistics / Delivery','Professional Services','Other']
  },
  {
    id: 'role',
    q: "What best describes you?",
    sub: "So JARVIS knows how to communicate with you",
    opts: ['Entrepreneur / Founder','Business Owner','Marketing / Sales','Operations Manager','Freelancer / Consultant','Student / Learning','Other']
  },
  {
    id: 'goal',
    q: "What do you mainly want to build?",
    sub: "JARVIS will prioritise these app types",
    opts: ['Customer-facing apps (loyalty, ordering)','Internal tools (tracking, management)','Landing pages & websites','Dashboards & analytics','Automation & workflow tools','Mobile apps','All of the above']
  },
  {
    id: 'tech',
    q: "What is your technical background?",
    sub: "JARVIS adjusts its explanations to your level",
    opts: ['Zero — I have never coded','Beginner — I know a little','Intermediate — I can read code','Advanced — I am a developer']
  },
  {
    id: 'language',
    q: "Preferred language?",
    sub: "JARVIS will communicate in your language",
    opts: ['English','Bahasa Melayu','Both English & BM','Arabic','Other']
  }
]

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string,string>>({})
  const [jarvisName, setJarvisName] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const supabase = getSupabase()

  const current = steps[step]
  const isLast = step === steps.length

  function selectOpt(opt: string) {
    setAnswers(prev => ({...prev, [current.id]: opt}))
  }

  function next() {
    if (step < steps.length) setStep(s => s+1)
  }

  async function finish() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const jName = jarvisName || 'JARVIS'

    // Save JARVIS profile
    await supabase.from('jarvis_profiles').insert({
      user_id: user.id,
      jarvis_name: jName,
      industry: answers.industry,
      role: answers.role,
      goal: answers.goal,
      tech_level: answers.tech,
      language: answers.language,
      created_at: new Date().toISOString()
    })

    // Mark onboarded
    await supabase.from('profiles').update({ onboarded: true, jarvis_name: jName }).eq('id', user.id)

    navigate('/dashboard')
  }

  const c: Record<string, React.CSSProperties> = {
    page: { minHeight:'100vh', background:'#05050d', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 },
    logo: { fontFamily:"'Space Mono',monospace", fontSize:13, color:'#00e5b0', fontWeight:700, marginBottom:48 },
    progress: { display:'flex', gap:8, marginBottom:48 },
    progDot: { width:32, height:4, borderRadius:2 },
    card: { background:'#0a0a18', border:'1px solid #1a1a35', borderRadius:16, padding:'48px 40px', width:'100%', maxWidth:520, textAlign:'center' as const },
    step: { fontFamily:"'Space Mono',monospace", fontSize:11, color:'#5a5a78', letterSpacing:1, textTransform:'uppercase' as const, marginBottom:12 },
    q: { fontFamily:"'Bebas Neue',sans-serif", fontSize:36, letterSpacing:1, marginBottom:8 },
    sub: { fontSize:14, color:'#8888aa', marginBottom:32 },
    opts: { display:'flex', flexWrap:'wrap' as const, gap:10, justifyContent:'center', marginBottom:32 },
    opt: { padding:'10px 18px', borderRadius:20, border:'1px solid #1a1a35', background:'transparent', color:'#8888aa', fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer', transition:'all 0.2s' },
    optSel: { padding:'10px 18px', borderRadius:20, border:'1px solid #00e5b0', background:'rgba(0,229,176,0.1)', color:'#00e5b0', fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer' },
    btn: { padding:'13px 32px', background:'#00e5b0', color:'#000', border:'none', borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, cursor:'pointer' },
    input: { width:'100%', padding:'14px 16px', background:'#161625', border:'1px solid #1a1a35', borderRadius:10, color:'#f0f0fa', fontFamily:"'Bebas Neue',sans-serif", fontSize:28, textAlign:'center' as const, outline:'none', marginBottom:24, boxSizing:'border-box' as const, letterSpacing:2 },
    finalCard: { background:'#0a0a18', border:'1px solid #1a1a35', borderRadius:16, padding:'48px 40px', width:'100%', maxWidth:520, textAlign:'center' as const },
    jarvisAvatar: { width:80, height:80, background:'rgba(0,229,176,0.1)', border:'2px solid rgba(0,229,176,0.3)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' },
  }

  if (isLast) {
    return (
      <div style={c.page}>
        <div style={c.logo}>JARVISFACTORY.AI</div>
        <div style={c.finalCard}>
          <div style={c.jarvisAvatar}>🤖</div>
          <div style={c.q}>NAME YOUR JARVIS</div>
          <div style={c.sub}>Give your AI developer a name. This is YOUR personal JARVIS.</div>
          <input
            style={c.input}
            placeholder="JARVIS"
            value={jarvisName}
            onChange={e => setJarvisName(e.target.value.toUpperCase())}
            maxLength={20}
          />
          <div style={{fontSize:13,color:'#8888aa',marginBottom:32,lineHeight:1.7}}>
            Based on your profile, your <strong style={{color:'#00e5b0'}}>{jarvisName||'JARVIS'}</strong> will specialise in <strong style={{color:'#f0f0fa'}}>{answers.industry}</strong> apps, communicate in <strong style={{color:'#f0f0fa'}}>{answers.language}</strong>, and build exactly what you need.
          </div>
          <button style={c.btn} onClick={finish} disabled={loading}>
            {loading ? 'Creating your JARVIS...' : `Activate ${jarvisName||'JARVIS'} →`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={c.page}>
      <div style={c.logo}>JARVISFACTORY.AI</div>
      <div style={c.progress}>
        {steps.map((s,i) => (
          <div key={s.id} style={{...c.progDot, background: i<=step ? '#00e5b0' : '#1a1a35'}}/>
        ))}
      </div>
      <div style={c.card}>
        <div style={c.step}>Step {step+1} of {steps.length}</div>
        <div style={c.q}>{current.q}</div>
        <div style={c.sub}>{current.sub}</div>
        <div style={c.opts}>
          {current.opts.map(opt => (
            <button
              key={opt}
              style={answers[current.id]===opt ? c.optSel : c.opt}
              onClick={() => selectOpt(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
        <button
          style={{...c.btn, opacity: answers[current.id] ? 1 : 0.4}}
          onClick={next}
          disabled={!answers[current.id]}
        >
          {step===steps.length-1 ? 'Almost Done →' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
