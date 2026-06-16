import { useState } from 'react'
import { getSupabase } from '@/web/src/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { theme, ui } from '@/web/src/lib/theme'

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
    page: { minHeight:'100vh', background:'linear-gradient(180deg, #ffffff 0%, #eef2ff 30%, #ede9fe 55%, #d6f5ec 100%)', color:theme.color.ink, fontFamily:theme.font.sans, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 },
    logoWrap: { display:'flex', alignItems:'center', gap:9, marginBottom:40 },
    logoMark: ui.logoMark,
    logo: { fontSize:18, fontWeight:800, letterSpacing:-0.5, color:theme.color.ink },
    progress: { display:'flex', gap:8, marginBottom:36 },
    progDot: { width:32, height:4, borderRadius:2 },
    card: { ...ui.card, boxShadow:theme.shadow.panel, borderRadius:theme.radius.panel, padding:'44px 40px', width:'100%', maxWidth:540, textAlign:'center' as const },
    step: { fontSize:12, color:theme.color.accent, letterSpacing:1.5, textTransform:'uppercase' as const, fontWeight:700, marginBottom:12 },
    q: { fontSize:30, lineHeight:1.05, letterSpacing:-1, fontWeight:800, marginBottom:8, color:theme.color.ink },
    sub: { fontSize:15, color:theme.color.muted, marginBottom:30, lineHeight:1.5 },
    opts: { display:'flex', flexWrap:'wrap' as const, gap:10, justifyContent:'center', marginBottom:30 },
    opt: { padding:'10px 18px', borderRadius:theme.radius.pill, border:`1px solid ${theme.color.borderInput}`, background:'#fff', color:theme.color.inkSoft, fontFamily:theme.font.body, fontSize:14, fontWeight:500, cursor:'pointer', transition:'all 0.2s' },
    optSel: { padding:'10px 18px', borderRadius:theme.radius.pill, border:`1px solid ${theme.color.accent}`, background:'rgba(16,185,129,0.08)', color:theme.color.accent, fontFamily:theme.font.body, fontSize:14, fontWeight:600, cursor:'pointer' },
    btn: { ...ui.btnSolid, padding:'13px 32px', fontSize:15, borderRadius:theme.radius.button },
    input: { ...ui.input, padding:'14px 16px', fontSize:24, fontWeight:800, letterSpacing:-0.5, textAlign:'center' as const, marginBottom:24, boxSizing:'border-box' as const },
    finalCard: { ...ui.card, boxShadow:theme.shadow.panel, borderRadius:theme.radius.panel, padding:'44px 40px', width:'100%', maxWidth:540, textAlign:'center' as const },
    jarvisAvatar: { width:80, height:80, background:'rgba(16,185,129,0.08)', border:`2px solid rgba(16,185,129,0.3)`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 24px' },
  }

  if (isLast) {
    return (
      <div style={c.page}>
        <div style={c.logoWrap}>
          <div style={c.logoMark}/>
          <span style={c.logo}>ezclaude</span>
        </div>
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
          <div style={{fontSize:14,color:theme.color.muted,marginBottom:32,lineHeight:1.7}}>
            Based on your profile, your <strong style={{color:theme.color.accent}}>{jarvisName||'JARVIS'}</strong> will specialise in <strong style={{color:theme.color.ink}}>{answers.industry}</strong> apps, communicate in <strong style={{color:theme.color.ink}}>{answers.language}</strong>, and build exactly what you need.
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
      <div style={c.logoWrap}>
        <div style={c.logoMark}/>
        <span style={c.logo}>ezclaude</span>
      </div>
      <div style={c.progress}>
        {steps.map((s,i) => (
          <div key={s.id} style={{...c.progDot, background: i<=step ? theme.color.accent : theme.color.border}}/>
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
