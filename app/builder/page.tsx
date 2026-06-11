'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { JARVIS_BACKEND_LIB } from '@/lib/jarvis-backend'
import { AUTH_PATTERN_REFERENCE, validateBuild, promptRequiresAuth } from '@/lib/jarvis-patterns'
import { ARCHITECT, DESIGNER, BUILDER, QA, parseAgentOutput, type AgentContext } from '@/lib/agents'
import { runBuilderAgent } from '@/lib/builder-agent'
import { loadJarvisLessons, formatLessonsForPrompt, recordBuildOutcome, countLessons, extractLessonsFromQA } from '@/lib/jarvis-memory'
import { createClaudeClient } from '@/lib/claude-client'
import { useBuildPipeline } from './useBuildPipeline'
import type { BuildInput, BuildDeps } from '@/lib/build-types'

export default function BuilderPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100vh',background:'#06070b',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Space Mono',monospace",color:'#00e5b0',fontSize:14}}>Loading JARVIS...</div>}>
      <Builder />
    </Suspense>
  )
}

function Builder() {
  const [user, setUser] = useState<any>(null)
  const [jarvis, setJarvis] = useState<any>(null)
  // ── v5: App persistence ──
  const [myApps, setMyApps] = useState<any[]>([])
  const [currentAppId, setCurrentAppId] = useState<string|null>(null)
  const [showAppsPicker, setShowAppsPicker] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<'idle'|'planning'|'questioning'|'approving'|'building'|'iterating'|'done'>('idle')
  const [builtCode, setBuiltCode] = useState('')
  const [activeTab, setActiveTab] = useState<'code'|'preview'>('code')
  const [pendingPlan, setPendingPlan] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [qAnswers, setQAnswers] = useState<Record<number,string>>({})
  const [finalPlan, setFinalPlan] = useState<any>(null)
  const [buildTime, setBuildTime] = useState('—')
  const [tokens, setTokens] = useState('—')
  const [jarvisMsg, setJarvisMsg] = useState('')
  const [chatLog, setChatLog] = useState<{html:string,isUser:boolean}[]>([])
  const [logs, setLogs] = useState<{t:string,msg:string,type:string}[]>([
    {t:'00:00:00',msg:'JARVISFACTORY v6 — Few-shot example + validator + auto-retry',type:'info'},
    {t:'00:00:00',msg:'Claude Sonnet 4.6 backend ready.',type:'ok'}
  ])
  // Sprint 1: feedback chat
  const [feedbackInput, setFeedbackInput] = useState('')
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false)
  // Feedback flow states
  const [feedbackPhase, setFeedbackPhase] = useState<'idle'|'diagnosing'|'planning'|'confirmed'|'fixing'>('idle')
  const [diagnosisResult, setDiagnosisResult] = useState<any>(null)
  const [pendingFeedback, setPendingFeedback] = useState('')
  // QA state
  const [qaReport, setQaReport] = useState<any>(null)
  const [isRunningQA, setIsRunningQA] = useState(false)
  // Sprint 2: file attachments
  const [attachments, setAttachments] = useState<{name:string,type:string,data:string,preview?:string}[]>([])
  const [brandColour, setBrandColour] = useState('#00e5b0')
  const [brandName, setBrandName] = useState('')
  const [showBrandPanel, setShowBrandPanel] = useState(false)
  // ── v6: Deep-discovery intake & full proposal modal ──
  const [showDiscovery, setShowDiscovery] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [discovery, setDiscovery] = useState<{
    vision: string
    target_users: string
    reference_apps: string
    ui_style: string
    must_haves: string
    nice_haves: string
    integrations: string[]
    languages: string[]
    platforms: string[]
    pricing_model: string
    notes: string
  }>({
    vision: '',
    target_users: '',
    reference_apps: '',
    ui_style: '',
    must_haves: '',
    nice_haves: '',
    integrations: [],
    languages: [],
    platforms: [],
    pricing_model: '',
    notes: '',
  })

  function toggleArrayValue(key: 'integrations'|'languages'|'platforms', value: string) {
    setDiscovery(d => {
      const arr = d[key]
      return { ...d, [key]: arr.includes(value) ? arr.filter(x=>x!==value) : [...arr, value] }
    })
  }

  const timerRef = useRef<any>(null)
  const startRef = useRef<number>(0)
  const chatRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // ── v6: PDF export ──
  const proposalRef = useRef<HTMLDivElement>(null)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  // ── v7.7: Refs that survive React render closures — used by jfConfirmFix click handler ──
  const pendingFeedbackRef = useRef<string>('')
  const builtCodeRef = useRef<string>('')
  // ── v7: Multi-agent build pipeline ──
  type AgentStatus = 'pending'|'working'|'done'|'failed'
  const [agentStatus, setAgentStatus] = useState<Record<string, {status: AgentStatus, note?: string}>>({
    architect: { status: 'pending' },
    designer: { status: 'pending' },
    builder: { status: 'pending' },
    qa: { status: 'pending' },
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: j } = await supabase.from('jarvis_profiles').select('*').eq('user_id', user.id).single()
      setJarvis(j)
      setBrandName(j?.full_name || '')

      // ── v5: Load all user's apps ──
      const { data: appList } = await supabase.from('apps').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setMyApps(appList || [])

      // ── v5: Auto-restore — either ?app=<id> from URL, or most recent ──
      // v9 fix: if user came from dashboard with ?prompt= (intent: "new app"),
      // SKIP auto-restore entirely. Show a fresh blank builder with the prompt pre-filled.
      const requestedId = searchParams.get('app')
      const incomingPrompt = searchParams.get('prompt')
      const restoreId = requestedId || (incomingPrompt ? null : localStorage.getItem('jf_last_app_id'))
      let appToRestore = null
      if(restoreId && appList?.length) {
        appToRestore = appList.find(a => a.id === restoreId) || appList[0]
      } else if(!incomingPrompt && appList?.length) {
        // Only fall back to "most recent" if user did NOT come with a fresh prompt
        appToRestore = appList[0]
      }

      if(appToRestore) {
        setCurrentAppId(appToRestore.id)
        // v5.2: Auto-inject backend into legacy apps that don't have it
        let restoredCode = appToRestore.html_code || ''
        if(restoredCode && !restoredCode.includes('window.Jarvis')) {
          restoredCode = injectBackend(restoredCode, appToRestore.id)
        }
        setBuiltCode(restoredCode)
        // v6: Restore the saved proposal if we have it; otherwise fall back to a stub
        setFinalPlan(appToRestore.proposal_data || { app_name: appToRestore.name, summary: appToRestore.description })
        setPrompt(appToRestore.description || '')
        setTokens(String(appToRestore.tokens_used||'—'))
        setBuildTime(appToRestore.build_time || '—')
        setPhase('done')
        setActiveTab('preview')
        localStorage.setItem('jf_last_app_id', appToRestore.id)
        addLog(`Restored: ${appToRestore.name}`, 'ok')
        // v6: If user navigated here with ?action=pdf, kick off PDF flow.
        if(searchParams.get('action') === 'pdf') {
          setTimeout(() => triggerProposalPDF(appToRestore), 400)
        }
        setJarvisMsg(`Welcome back. I've restored <strong style="color:#00e5b0">${appToRestore.name}</strong>.<br><br>
You can keep editing it via chat below, or start a new app with the "<strong>+ New App</strong>" button.<br><br>
<strong style="color:#ffd166">${appList!.length} app${appList!.length===1?'':'s'}</strong> in your library.`)
      } else {
        // v9: Dashboard hand-off — pre-fill prompt textarea if ?prompt= present
        const initialPrompt = searchParams.get('prompt')
        if(initialPrompt) {
          setPrompt(decodeURIComponent(initialPrompt))
        }
        setJarvisMsg(`Good day. I'm <strong style="color:#00e5b0">${j?.jarvis_name||'JARVIS'}</strong> — your personal AI developer.<br><br>
I specialise in <strong>${j?.industry||'your industry'}</strong> apps.<br><br>
<strong style="color:#ffd166">New in v5.2:</strong><br>
🔌 Real Supabase backend — your apps now have real signup/login<br>
💾 Persistent data across devices, not just localStorage<br>
🎨 Multi-user with full data isolation per app<br><br>
${initialPrompt ? '<strong style="color:#00e5b0">Your idea is ready in the prompt box on the left — review it and click ⚡ Launch when ready.</strong>' : 'Tell me what you want to build.'}`)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatLog, phase, questions, finalPlan, jarvisMsg])

  useEffect(() => {
    if(termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [logs])

  // Auto-open the full proposal modal as soon as JARVIS finishes the plan.
  useEffect(() => {
    if(phase==='approving' && finalPlan) setShowProposal(true)
  }, [phase, finalPlan])

  function ts() { const n=new Date(); return[n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':') }
  function addLog(msg:string,type='info') { setLogs(l=>[...l,{t:ts(),msg,type}]) }
  function addChat(html:string,isUser=false) { setChatLog(l=>[...l,{html,isUser}]) }

  // v2/Stage 4 Layer-4: the build orchestration lives in lib/build-pipeline.ts.
  // This hook maps the pipeline's progress events onto the setters above; runBuild()
  // forwards to runBuildPipeline. The timer + persistence stay in approveBuild below.
  const { runBuild } = useBuildPipeline({ setPhase, setAgentStatus, addLog, addChat, setTokens })

  // v6: getKey() removed — Anthropic key now lives server-side in /api/chat.

  // ── v5.2: Inject Supabase-backed auth + data library into generated HTML ──
  function injectBackend(html: string, appId: string): string {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
    const lib = JARVIS_BACKEND_LIB
      .replace('__SUPABASE_URL__', supaUrl)
      .replace('__SUPABASE_ANON__', supaKey)
      .replace('__APP_ID__', appId)
    // Inject right before </head> if found, else after <body>, else prepend
    if(html.includes('</head>')) return html.replace('</head>', lib + '\n</head>')
    if(html.includes('<body>')) return html.replace('<body>', '<body>\n' + lib)
    return lib + '\n' + html
  }

  // ── v5: App switching ──
  function switchToApp(app: any) {
    setCurrentAppId(app.id)
    // v5.2: Auto-inject backend if missing
    let code = app.html_code || ''
    if(code && !code.includes('window.Jarvis')) {
      code = injectBackend(code, app.id)
    }
    setBuiltCode(code)
    // v6: Restore the saved proposal if we have it
    setFinalPlan(app.proposal_data || { app_name: app.name, summary: app.description })
    setPrompt(app.description || '')
    setTokens(String(app.tokens_used||'—'))
    setBuildTime(app.build_time || '—')
    setPhase('done')
    setActiveTab('preview')
    setChatLog([])
    setShowAppsPicker(false)
    localStorage.setItem('jf_last_app_id', app.id)
    addLog(`Switched to: ${app.name}`, 'ok')
    addChat(`📂 Loaded <strong style="color:#00e5b0">${app.name}</strong>. Edit via chat below.`)
  }

  function newApp() {
    setCurrentAppId(null)
    setBuiltCode('')
    setFinalPlan(null)
    setPendingPlan(null)
    setQuestions([])
    setQAnswers({})
    setPrompt('')
    setTokens('—')
    setBuildTime('—')
    setPhase('idle')
    setActiveTab('code')
    setChatLog([])
    setQaReport(null)
    setShowAppsPicker(false)
    localStorage.removeItem('jf_last_app_id')
    addLog('New app — describe what to build', 'info')
  }

  // ── SPRINT 2: File handler ──
  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files||[])
    for(const file of files) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = ev.target?.result as string
        const base64 = result.split(',')[1]
        const isImage = file.type.startsWith('image/')
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64,
          preview: isImage ? result : undefined
        }])
        addLog(`Attached: ${file.name}`, 'ok')
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_,i) => i !== idx))
  }

  // ── Build messages with attachments ──
  function buildMessages(userText: string) {
    const imageAttachments = attachments.filter(a => a.type.startsWith('image/'))
    if(imageAttachments.length === 0) {
      return [{ role: 'user', content: userText }]
    }
    const content: any[] = imageAttachments.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.type, data: img.data }
    }))
    content.push({ type: 'text', text: userText })
    return [{ role: 'user', content }]
  }

  // ── v7.6: Server-side stream capture — server holds the long-lived Anthropic stream
  // and returns one complete JSON. Browser fetch is short-lived → immune to tab suspension. ──
  // v2/Stage 4 Layer-2: callClaudeOnce/callClaude/callClaudeAgentic moved to
  // lib/claude-client.ts. The component builds the client once, injecting its own
  // addLog (transient-retry notices) and buildMessages (attachments/vision path,
  // which reads `attachments` state). All call-site signatures are unchanged.
  const { callClaude, callClaudeAgentic } = createClaudeClient({
    onRetryLog: (msg, level) => addLog(msg, level),
    buildMessages,
  })

  // ── SPRINT 1+3: Smart Feedback + QA Agent ──

  // STEP 1: Diagnose — JARVIS reads code and explains what's wrong
  async function sendFeedback() {
    const msg = feedbackInput.trim()
    if(!msg || !builtCode) return
    setFeedbackInput('')
    setPendingFeedback(msg)
    pendingFeedbackRef.current = msg
    builtCodeRef.current = builtCode
    setIsFeedbackLoading(true)
    setFeedbackPhase('diagnosing')
    addChat(msg, true)
    addLog(`Feedback: "${msg.substring(0,50)}..." — Diagnosing first...`, 'build')

    setChatLog(l => [...l, { html: '<div style="display:flex;gap:4px;align-items:center"><span style="width:6px;height:6px;border-radius:50%;background:#ffd166;display:inline-block;animation:bob 1s infinite"></span><span style="margin-left:8px;font-size:12px;color:#a8a9b3">JARVIS is diagnosing the issue...</span></div>', isUser: false }])

    try {
      const sys = `You are ${jarvis?.jarvis_name||'JARVIS'}, a senior developer doing code review and diagnosis.

Analyse the provided HTML app code and the user's feedback/issue. Your job is to:
1. Identify exactly what is causing the issue
2. Explain it in simple plain language
3. Propose a clear fix plan
4. Ask if there are any other changes to batch together

🔌 CRITICAL CONTEXT — THIS APP HAS A REAL BACKEND:
A global \`window.Jarvis\` object is auto-injected into every app. It provides Supabase-backed:
  - Jarvis.signup(email, password, fullName, role)
  - Jarvis.login(email, password)
  - Jarvis.logout()
  - Jarvis.getCurrentUser()
  - Jarvis.isLoggedIn()
  - Jarvis.saveData(table, key, value)   // upsert
  - Jarvis.loadData(table) / Jarvis.loadData(table, key)
  - Jarvis.deleteData(table, key)
  - Jarvis.listUsers()  // admin

DIAGNOSIS RULES:
- If you see localStorage with keys like 'users', 'accounts', 'credentials', 'staffMembers', 'birthdays', 'sessionToken', 'isLoggedIn', 'authenticated', or any app-domain key (assignments, contacts, posts, items, etc.), that is ALWAYS a bug. Recommend refactor to Jarvis.* methods.
- Hardcoded demo credentials (e.g. demo@example.com / demo123) are ALWAYS a bug.

🟢 NOT A BUG — DO NOT FLAG THESE:
- localStorage keys with prefix 'jarvis_' (e.g. 'jarvis_session_<APP_ID>', 'jarvis_user_<APP_ID>') — these are the JARVIS LIBRARY's own session caching. They are CORRECT and EXPECTED.
- localStorage keys: 'theme', 'darkMode', 'language', 'lang', 'fontSize', 'sidebar', 'activeTab', 'consent' — these are UI preferences and are FINE.
- Any localStorage key prefixed with 'jf_', 'theme_', 'pref_', 'ui_' — also fine, UI state only.

BEFORE flagging a localStorage issue, scan the actual keys used. If they are all on the allowlist above, the app is correctly built — DO NOT diagnose a localStorage bug. Look for a different root cause for the user's reported issue.

- If user reports "cannot signup" / "cannot login" AND the code USES Jarvis.signup/Jarvis.login correctly — DO NOT blame localStorage. Look for: missing try/catch errors silently failing, wrong field names being passed, signup calling Jarvis but not handling the success path to route to dashboard, etc.

Return ONLY valid JSON (no markdown):
{
  "diagnosis": "Plain English explanation (2-3 sentences). If localStorage auth detected, explicitly say 'this app uses localStorage instead of the real Supabase backend that's available'.",
  "root_cause": "The specific technical root cause (1 sentence)",
  "fix_plan": ["Fix 1: description", "Fix 2: description", "Fix 3: description"],
  "estimated_impact": "Low / Medium / High",
  "question": "Is there anything else you want me to fix or improve at the same time?"
}`

      // v5.3: Strip the injected Jarvis backend <script> block before truncating,
      // so the 8000-char window shows JARVIS the actual app code (not the lib boilerplate).
      let codeForReview = builtCode
      const libStart = codeForReview.indexOf('<script>\n(function(){\n  var SUPABASE_URL')
      if(libStart !== -1) {
        const libEnd = codeForReview.indexOf('</script>', libStart)
        if(libEnd !== -1) {
          codeForReview = codeForReview.substring(0, libStart) +
            '<!-- [Jarvis backend lib auto-injected here - window.Jarvis is available globally] -->' +
            codeForReview.substring(libEnd + '</script>'.length)
        }
      }
      const codeSnippet = codeForReview.length > 8000 ? codeForReview.substring(0, 8000) + '...(truncated)' : codeForReview
      const raw = await callClaude(sys, 'App code:\n' + codeSnippet + '\n\nUser feedback/issue: ' + msg, 2000)
      let diagnosis
      try { diagnosis = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,'').trim()) }
      catch(e) { diagnosis = { diagnosis: "I found the issue and have a fix ready.", root_cause: "Logic error in the app code.", fix_plan: ["Fix the reported issue completely"], estimated_impact: "Medium", question: "Anything else you'd like me to improve?" } }

      setDiagnosisResult(diagnosis)
      setFeedbackPhase('planning')
      addLog('Diagnosis complete. Presenting fix plan...', 'ok')

      // Show diagnosis card in chat
      setChatLog(l => l.map((m,i) => i === l.length-1 ? { ...m, html: `
        <div style="background:#1e1e30;border:1px solid rgba(255,209,102,0.25);border-radius:10px;padding:14px">
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#ffd166;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">🔍 Diagnosis</div>
          <div style="font-size:12px;color:#e8e9ed;margin-bottom:8px;line-height:1.6">${diagnosis.diagnosis}</div>
          <div style="font-size:11px;color:#ff6b9d;margin-bottom:10px"><strong>Root cause:</strong> ${diagnosis.root_cause}</div>
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#00e5b0;margin-bottom:6px">FIX PLAN:</div>
          ${diagnosis.fix_plan.map((f:string) => `<div style="font-size:11px;color:#a8a9b3;margin-bottom:3px;display:flex;gap:6px"><span style="color:#00e5b0">→</span>${f}</div>`).join('')}
          <div style="height:1px;background:#252538;margin:10px 0"></div>
          <div style="font-size:12px;color:#ffd166;margin-bottom:10px">${diagnosis.question}</div>
          <div style="display:flex;gap:6px">
            <button onclick="window.jfConfirmFix('')" style="flex:1;padding:8px;background:#00e5b0;color:#000;border:none;border-radius:7px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer">✓ Apply Fix</button>
            <button onclick="window.jfRejectFix()" style="flex:1;padding:8px;background:transparent;color:#a8a9b3;border:1px solid #262731;border-radius:7px;font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">✕ Cancel</button>
          </div>
          <input id="extraChangesInput" placeholder="Optional: add more changes to batch..." style="width:100%;margin-top:8px;background:#0e0f15;border:1px solid #262731;border-radius:6px;color:#e8e9ed;font-size:11px;padding:7px;box-sizing:border-box;outline:none"/>
        </div>` } : m))

      // Expose global handlers
      ;(window as any).jfConfirmFix = (extra: string) => {
        const extraInput = document.getElementById('extraChangesInput') as HTMLInputElement
        const extraChanges = extraInput?.value?.trim() || extra || ''
        applyFix(extraChanges)
      }
      ;(window as any).jfRejectFix = () => {
        setFeedbackPhase('idle')
        setIsFeedbackLoading(false)
        setPendingFeedback('')
        addChat('No problem — let me know whenever you want to make changes.')
      }

    } catch(err: any) {
      addLog('ERROR: '+err.message, 'err')
      addChat('❌ Diagnosis failed: '+err.message)
      setFeedbackPhase('idle')
      setIsFeedbackLoading(false)
    }
  }

  // STEP 2: Apply the fix after user confirms
  async function applyFix(extraChanges: string) {
    // v7.7: Fall back to refs if React state has been cleared between diagnose
    // and click. Refs survive render cycles, state can race.
    const feedbackToApply = pendingFeedback || pendingFeedbackRef.current
    const codeToApply = builtCode || builtCodeRef.current
    if(!feedbackToApply){
      addLog('Apply Fix: no pending feedback found — please send feedback again.', 'err')
      addChat('⚠️ Lost the original feedback. Please type your feedback in the chat below and send it again.')
      return
    }
    if(!codeToApply){
      addLog('Apply Fix: no app code loaded — build something first.', 'err')
      addChat('⚠️ No app loaded. Build something before requesting a fix.')
      return
    }
    setFeedbackPhase('fixing')
    setPhase('iterating')
    addLog('Fix confirmed. Applying changes...', 'build')

    setChatLog(l => [...l, { html: '<div style="display:flex;gap:4px;align-items:center"><span style="width:6px;height:6px;border-radius:50%;background:#00e5b0;display:inline-block;animation:bob 1s infinite"></span><span style="width:6px;height:6px;border-radius:50%;background:#8b7cf8;display:inline-block;animation:bob 1s 0.15s infinite"></span><span style="width:6px;height:6px;border-radius:50%;background:#ff6b9d;display:inline-block;animation:bob 1s 0.3s infinite"></span><span style="margin-left:8px;font-size:12px;color:#a8a9b3">Applying fixes and improvements...</span></div>', isUser: false }])

    try {
      const brandContext = brandName ? `Brand: "${brandName}", colour: ${brandColour}.` : ''
      const fixPlanText = diagnosisResult?.fix_plan?.join('\n') || ''
      const allChanges = extraChanges ? `${feedbackToApply}\nAdditional: ${extraChanges}` : feedbackToApply

      const sys = `You are ${jarvis?.jarvis_name||'JARVIS'}, an expert developer fixing and improving a web app.

You have diagnosed the issue. Now apply ALL the fixes.

╔═══════════════════════════════════════════════════════════╗
║  ⛔ FORBIDDEN — IF YOU DO ANY OF THESE, FIX WILL FAIL    ║
╠═══════════════════════════════════════════════════════════╣
║  ❌ DO NOT use localStorage for users, accounts,          ║
║     credentials, current user, sessions, or auth tokens.  ║
║     localStorage is for UI prefs ONLY (theme, language).  ║
║                                                            ║
║  ❌ DO NOT use localStorage for app domain data (staff,    ║
║     contacts, items, posts, settings) — use Jarvis.saveData║
║                                                            ║
║  ❌ DO NOT define your own \`users\` array in JS.            ║
║                                                            ║
║  ❌ DO NOT hardcode demo credentials.                      ║
║                                                            ║
║  ❌ DO NOT include the Jarvis library script — auto-loaded.║
║                                                            ║
║  ❌ DO NOT return markdown — raw HTML only.                ║
╚═══════════════════════════════════════════════════════════╝

✅ THE ONLY WAY to do auth: window.Jarvis (auto-injected globally).
✅ THE ONLY WAY to persist data: Jarvis.saveData / Jarvis.loadData.

═══ MANDATORY API ═══
  await Jarvis.signup(email, password, fullName, role)  // creates user + auto-login
  await Jarvis.login(email, password)
  Jarvis.logout()
  Jarvis.getCurrentUser()
  Jarvis.isLoggedIn()
  await Jarvis.saveData(table, key, value)
  await Jarvis.loadData(table)            // all rows
  await Jarvis.loadData(table, key)       // one row
  await Jarvis.deleteData(table, key)
  await Jarvis.listUsers()                 // admin

═══ MANDATORY PATTERN FOR APPS WITH LOGIN ═══
  1. On page load: if(Jarvis.isLoggedIn()) show dashboard; else show login.
  2. Signup form → \`await Jarvis.signup(...)\` with try/catch + toast.
  3. Login form → \`await Jarvis.login(...)\` with try/catch + toast.
  4. Logout → \`Jarvis.logout()\` then show login screen.
  5. Domain data (staff, items, contacts, posts, etc.) → \`Jarvis.saveData / loadData\`.
  6. The ONLY localStorage allowed: 'theme', 'darkMode', 'language', 'lang' (UI prefs only).

═══ HARD RULES ═══
- Return ONLY the complete fixed HTML file. No markdown, no backticks.
- Fix the diagnosed root cause completely and permanently.
- Keep ALL other functionality intact.
- Real signed-up users get a clean empty state (no fake users in storage).
- Every button, nav item, tab must work.
- ${brandContext}
- Beautiful, professional, mobile-responsive.

DIAGNOSED FIX PLAN — apply EVERY item:
${fixPlanText}`

      // v6: Build → Validate → Retry on fix path too
      const fixNeedsAuth = promptRequiresAuth(prompt + ' ' + allChanges, '')
      let code = ''
      let validation: any = null
      const FIX_MAX_RETRIES = 1
      let fixAttempt = 0

      while (fixAttempt <= FIX_MAX_RETRIES) {
        let extraMsg = 'Current app code:\n' + builtCode + '\n\nIssue to fix: ' + allChanges
        if (fixAttempt > 0) {
          extraMsg += `\n\n⚠️ PREVIOUS FIX FAILED VALIDATION:\n${validation.errors.map((e:string)=>'- '+e).join('\n')}\n\nFix these too. Use Jarvis.signup/login NOT localStorage. NO hardcoded demo creds.`
          addLog(`Fix retry ${fixAttempt}/${FIX_MAX_RETRIES}...`, 'info')
        }

        const improved = await callClaude(sys, extraMsg, 12000, attachments.some(a=>a.type.startsWith('image/')))
        code = improved.replace(/^\`\`\`html\n?/, '').replace(/\n?\`\`\`$/, '').trim()
        validation = validateBuild(code, fixNeedsAuth)
        if (validation.valid || fixAttempt >= FIX_MAX_RETRIES) break
        fixAttempt++
      }

      // v5.2: Re-inject backend in case JARVIS removed it
      if(currentAppId && !code.includes('window.Jarvis')) {
        code = injectBackend(code, currentAppId)
      }
      const tok = Math.round(code.length / 4)
      setBuiltCode(code)
      setTokens(tok.toLocaleString())
      setPhase('done')
      setFeedbackPhase('idle')
      setIsFeedbackLoading(false)
      setPendingFeedback('')

      const frame = document.getElementById('previewFrame') as HTMLIFrameElement
      if(frame) frame.srcdoc = code
      const codeEl = document.getElementById('codeDisplay')
      if(codeEl) codeEl.textContent = code

      const validIcon = validation?.valid ? '✅' : '⚠️'
      addLog(`Fix applied. ${validIcon} ~${tok} tokens.`, 'ok')

      // Auto-run QA after fix
      addLog('Running QA agent on fixed app...', 'build')
      runQA(code)

      setChatLog(l => l.map((m,i) => i === l.length-1 ? { ...m,
        html: `✅ <strong>Fix applied!</strong> Running QA check now...<br><span style="color:#a8a9b3;font-size:11px">~${tok.toLocaleString()} tokens used</span>`
      } : m))

      if(user) {
        if(currentAppId) {
          // Update existing app — don't pollute description with every fix
          await supabase.from('apps').update({
            html_code: code, tokens_used: tok
          }).eq('id', currentAppId)
          // Update local state so the picker reflects new tokens count
          setMyApps(prev => prev.map(a => a.id === currentAppId ? {...a, html_code: code, tokens_used: tok} : a))
        } else {
          const { data: newRow } = await supabase.from('apps').insert({
            user_id: user.id,
            name: (finalPlan?.app_name || 'My App') + ' (fixed)',
            description: `Fixed: ${pendingFeedback.substring(0,100)}`,
            html_code: code, tokens_used: tok, build_time: '0',
            created_at: new Date().toISOString()
          }).select().single()
          if(newRow) {
            setCurrentAppId(newRow.id)
            localStorage.setItem('jf_last_app_id', newRow.id)
            setMyApps(prev => [newRow, ...prev])
          }
        }
      }
      setActiveTab('preview')

      // ── v5.1 fix: Reset all phase states after successful fix ──
      setPhase('done')
      setFeedbackPhase('idle')
      setIsFeedbackLoading(false)
      setPendingFeedback('')
      setDiagnosisResult(null)

    } catch(err: any) {
      addLog('ERROR: '+err.message, 'err')
      addChat('❌ Fix failed: '+err.message)
      setPhase('done')
      setFeedbackPhase('idle')
      setIsFeedbackLoading(false)
    }
  }

  // ── SPRINT 3: QA Agent ──
  async function runQA(codeToTest?: string) {
    const code = codeToTest || builtCode
    if(!code) return
    setIsRunningQA(true)
    addLog('QA Agent running 15-point checklist...', 'build')

    try {
      const sys = `You are a QA Engineer agent. Analyse this HTML/JS app code and test it against a 15-point quality checklist.

Return ONLY valid JSON (no markdown):
{
  "score": 0-100,
  "passed": ["test that passed", ...],
  "failed": ["test that failed with reason", ...],
  "critical": ["critical issue that must be fixed", ...],
  "summary": "One sentence overall verdict",
  "certified": true/false
}

The 15 checks are:
1. Demo login works (email=demo@example.com password=demo123 hardcoded and matches)
2. All navigation items show a screen (no dead links)
3. All buttons have click handlers
4. Forms have validation
5. Data is pre-populated (no empty lists/tables on load)
6. localStorage used for data persistence
7. Mobile responsive (has viewport meta, flexible layout)
8. Google Fonts loaded
9. No JavaScript errors visible in code
10. All tabs/panels show content
11. Success messages on form submissions
12. Header/navbar present and functional
13. Consistent colour scheme throughout
14. No placeholder text (lorem ipsum etc)
15. App looks like a real product (not a demo skeleton)`

      const snippet = code.length > 10000 ? code.substring(0, 10000) + '...(truncated)' : code
      const raw = await callClaude(sys, 'Analyse this app:\n' + snippet, 3000)
      let report
      try { report = JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,'').trim()) }
      catch(e) { report = { score: 70, passed: ['Basic structure present'], failed: [], critical: [], summary: 'App built successfully with minor issues.', certified: false } }

      setQaReport(report)
      setIsRunningQA(false)
      addLog(`QA complete. Score: ${report.score}/100. ${report.certified?'✅ CERTIFIED':'⚠️ Issues found'}`, report.certified?'ok':'warn')

      // Show QA report in chat
      setChatLog(l => [...l, {
        isUser: false,
        html: `<div style="background:#1e1e30;border:1px solid ${report.certified?'rgba(0,229,176,0.3)':'rgba(255,209,102,0.3)'};border-radius:10px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-family:'Space Mono',monospace;font-size:10px;color:${report.certified?'#00e5b0':'#ffd166'};text-transform:uppercase;letter-spacing:1px">🔬 QA Report</div>
            <div style="font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:${report.score>=80?'#00e5b0':report.score>=60?'#ffd166':'#ff4d6d'}">${report.score}/100</div>
          </div>
          <div style="font-size:12px;color:#e8e9ed;margin-bottom:10px">${report.summary}</div>
          ${report.critical?.length > 0 ? `<div style="margin-bottom:8px">${report.critical.map((c:string)=>`<div style="font-size:11px;color:#ff4d6d;margin-bottom:3px;display:flex;gap:5px"><span>✕</span>${c}</div>`).join('')}</div>` : ''}
          ${report.failed?.length > 0 ? `<div style="margin-bottom:8px">${report.failed.slice(0,3).map((f:string)=>`<div style="font-size:11px;color:#ffd166;margin-bottom:3px;display:flex;gap:5px"><span>⚠</span>${f}</div>`).join('')}</div>` : ''}
          ${report.passed?.length > 0 ? `<div style="margin-bottom:10px">${report.passed.slice(0,3).map((p:string)=>`<div style="font-size:11px;color:#a8a9b3;margin-bottom:3px;display:flex;gap:5px"><span style="color:#00e5b0">✓</span>${p}</div>`).join('')}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:${report.certified?'rgba(0,229,176,0.1)':'rgba(255,209,102,0.1)'};border-radius:6px">
            <span style="font-family:'Space Mono',monospace;font-size:10px;color:${report.certified?'#00e5b0':'#ffd166'}">${report.certified?'✅ QA CERTIFIED':'⚠️ NEEDS FIXES'}</span>
            ${!report.certified && report.critical?.length > 0 ? `<button onclick="window.jfAutoFix()" style="padding:5px 12px;background:#8b7cf8;color:#fff;border:none;border-radius:5px;font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">Auto-fix issues</button>` : ''}
          </div>
        </div>`
      }])

      ;(window as any).jfAutoFix = () => {
        const issues = [...(report.critical||[]), ...(report.failed||[])].join(', ')
        setPendingFeedback(issues)
        setDiagnosisResult({ fix_plan: report.critical || [], diagnosis: 'QA found issues that need fixing', root_cause: 'Multiple QA checks failed', question: 'Apply all QA fixes now?' })
        applyFix('')
      }

    } catch(err: any) {
      setIsRunningQA(false)
      addLog('QA error: '+err.message, 'warn')
    }
  }


  // ── v9.7 Phase 4: Capture rendered app screenshot for vision-guided QA ──
  // Renders the HTML in a hidden iframe, html2canvas-snapshots it, returns data URL.
  async function captureAppScreenshot(htmlCode: string): Promise<string | null> {
    if(!htmlCode) return null
    try {
      // html2canvas is loaded for PDF export; reuse it
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      const html2canvas = (window as any).html2canvas
      if(!html2canvas) return null

      // Hidden iframe at desktop size
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:800px;border:0;visibility:hidden'
      iframe.setAttribute('aria-hidden', 'true')
      iframe.srcdoc = htmlCode
      document.body.appendChild(iframe)
      // Wait for load + a small settle for animations
      await new Promise<void>(resolve => {
        const done = () => resolve()
        iframe.addEventListener('load', () => setTimeout(done, 800), { once: true })
        setTimeout(done, 5000)
      })
      const doc = iframe.contentDocument
      if(!doc?.body){ document.body.removeChild(iframe); return null }

      const canvas = await html2canvas(doc.body, {
        backgroundColor: '#ffffff',
        width: 1280,
        height: 800,
        windowWidth: 1280,
        windowHeight: 800,
        logging: false,
        useCORS: true,
      } as any)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      document.body.removeChild(iframe)
      return dataUrl
    } catch(err: any) {
      console.warn('[vision-qa] screenshot failed:', err?.message)
      return null
    }
  }

  // ── v6: Lazy-load a script from CDN (used for jsPDF) ──
  function loadScriptOnce(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-jf-src="${src}"]`)
      if(existing) { resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.setAttribute('data-jf-src', src)
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(s)
    })
  }

  // ── v6.1: Print-quality PDF generator using jsPDF text APIs.
  // White background, black body text, accent colors only on headers and key callouts.
  // Vector text — crisp at any zoom, small file size, proper consulting-deliverable look. ──
  async function downloadProposalPDF() {
    if(!finalPlan) return
    setIsExportingPDF(true)
    addLog('Generating print-quality PDF...', 'info')
    try {
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      const jsPDF = (window as any).jspdf?.jsPDF
      if(!jsPDF) throw new Error('jsPDF failed to load')

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 18
      const contentW = pageW - margin*2

      // Print palette — accent colors only on emphasis. Body always black.
      const C = {
        black: [26,26,26], gray: [100,100,115], lightGray: [185,185,200], hairline: [225,225,235],
        teal: [0,184,148], purple: [110,92,232], gold: [196,150,16], red: [200,55,75], bgFaint: [248,248,251],
      }
      const setText = (rgb: number[]) => pdf.setTextColor(rgb[0],rgb[1],rgb[2])
      const setFill = (rgb: number[]) => pdf.setFillColor(rgb[0],rgb[1],rgb[2])
      const setDraw = (rgb: number[]) => pdf.setDrawColor(rgb[0],rgb[1],rgb[2])

      let y = margin

      // ── v6.2: Vector primitives need to be declared BEFORE drawPageHeader uses them.
      // (const arrow functions aren't hoisted — declaration order matters.) ──
      const drawHexagon = (cx: number, cy: number, r: number, fillColor: number[]) => {
        setFill(fillColor)
        const h = r * 0.866 // sqrt(3)/2
        const half = r / 2
        const pts: number[][] = [[cx, cy - r], [cx + h, cy - half], [cx + h, cy + half], [cx, cy + r], [cx - h, cy + half], [cx - h, cy - half]]
        const deltas: any[] = []
        for(let i=1; i<6; i++) deltas.push([pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]])
        ;(pdf as any).lines(deltas, pts[0][0], pts[0][1], [1, 1], 'F', true)
      }

      // Page header band (drawn on every page) — teal bar with hexagon mark + wordmark
      const drawPageHeader = () => {
        setFill(C.teal); pdf.rect(0, 0, pageW, 11, 'F')
        // White hexagon brand mark (the ⬡ from the landing page)
        drawHexagon(margin + 3, 5.5, 2.2, [255,255,255])
        pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5); pdf.setTextColor(255,255,255)
        pdf.text('JARVISFACTORY.AI', margin + 8, 7)
        pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5)
        pdf.text('Build Proposal · Confidential', pageW - margin, 7, { align: 'right' } as any)
      }
      drawPageHeader()
      y = 24

      const ensureSpace = (needed: number) => {
        if(y + needed > pageH - 18) { pdf.addPage(); drawPageHeader(); y = 22 }
      }
      const writeBody = (text: string, opts: {size?: number, font?: 'normal'|'bold'|'italic', color?: number[], indent?: number, lineGap?: number} = {}) => {
        const size = opts.size||10
        pdf.setFont('helvetica', opts.font||'normal'); pdf.setFontSize(size)
        setText(opts.color || C.black)
        const x = margin + (opts.indent||0)
        const lines = pdf.splitTextToSize(String(text||''), contentW - (opts.indent||0))
        const lineH = size * 0.42
        ensureSpace(lines.length * lineH + 1)
        for(const line of lines){ ensureSpace(lineH); pdf.text(line, x, y); y += lineH }
        y += (opts.lineGap||1)
      }
      const sectionTitle = (text: string, color: number[] = C.teal) => {
        ensureSpace(13)
        setFill(color); pdf.rect(margin, y - 3.6, 1.6, 4.6, 'F')
        pdf.setFont('helvetica','bold'); pdf.setFontSize(10.5); setText(color)
        pdf.text(text.toUpperCase(), margin + 4.2, y)
        y += 6
      }
      const subhead = (text: string, color: number[] = C.black) => {
        ensureSpace(7)
        pdf.setFont('helvetica','bold'); pdf.setFontSize(10); setText(color)
        pdf.text(text, margin, y); y += 5
      }
      const divider = (gap: number = 5) => {
        ensureSpace(gap+1)
        setDraw(C.hairline); pdf.setLineWidth(0.25)
        pdf.line(margin, y, pageW - margin, y); y += gap
      }
      const spacer = (h: number) => { y += h }

      // ── v6.2: Vector-drawn icons (Unicode wasn't supported by Helvetica/WinAnsi).
      // These render as crisp lines at any zoom level. ──
      const drawCheck = (x: number, baseline: number, color: number[]) => {
        setDraw(color); pdf.setLineWidth(0.85); pdf.setLineCap('round')
        pdf.line(x, baseline - 1.4, x + 1.4, baseline - 0.2)
        pdf.line(x + 1.4, baseline - 0.2, x + 4.0, baseline - 3.4)
      }
      const drawOpenDot = (x: number, baseline: number, color: number[]) => {
        setDraw(color); pdf.setLineWidth(0.4)
        pdf.circle(x + 1.6, baseline - 1.5, 1.4, 'S')
      }
      const drawPlus = (x: number, baseline: number, color: number[]) => {
        setDraw(color); pdf.setLineWidth(0.7); pdf.setLineCap('round')
        pdf.line(x, baseline - 1.6, x + 3.2, baseline - 1.6) // horizontal
        pdf.line(x + 1.6, baseline - 3.2, x + 1.6, baseline) // vertical
      }
      const drawArrow = (x: number, y2: number, len: number, color: number[]) => {
        setDraw(color); pdf.setLineWidth(0.5); pdf.setLineCap('round')
        pdf.line(x, y2, x + len, y2)
        pdf.line(x + len, y2, x + len - 1.6, y2 - 1.2)
        pdf.line(x + len, y2, x + len - 1.6, y2 + 1.2)
      }
      const drawWarning = (x: number, baseline: number, color: number[]) => {
        setDraw(color); pdf.setLineWidth(0.55); pdf.setLineJoin('round')
        // Triangle pointing up: bottom-left → bottom-right → top → close
        pdf.line(x, baseline, x + 4.4, baseline)
        pdf.line(x + 4.4, baseline, x + 2.2, baseline - 4)
        pdf.line(x + 2.2, baseline - 4, x, baseline)
        // Exclamation inside (drawn as small line + dot)
        pdf.setLineWidth(0.6)
        pdf.line(x + 2.2, baseline - 2.8, x + 2.2, baseline - 1.6)
        setFill(color); pdf.circle(x + 2.2, baseline - 0.9, 0.25, 'F')
      }
      // (drawHexagon was declared earlier — needed by drawPageHeader on first call)

      // ── v6.2: Smart formatters ──
      const formatBuildTime = (val: any): string => {
        if(!val) return '~90 seconds'
        const s = String(val).trim()
        // Already human-formatted — keep as-is
        if(/[a-z]/i.test(s)) return s
        const sec = parseFloat(s)
        if(isNaN(sec)) return s
        if(sec < 60) return `${Math.round(sec)} seconds`
        const min = Math.floor(sec / 60)
        const remSec = Math.round(sec % 60)
        if(remSec === 0) return `About ${min} minute${min===1?'':'s'}`
        return `${min}m ${remSec}s`
      }
      const inferAppType = (plan: any): string => {
        const ts = plan?.tech_stack || {}
        const fe = String(ts.frontend || '').toLowerCase()
        if(fe.includes('react native') || fe.includes('expo')) return 'Mobile App'
        if(fe.includes('marketing') || fe.includes('static site') || fe.includes('landing')) return 'Marketing Site'
        if(fe.includes('multi-page') || fe.includes('next.js')) return 'Multi-page Web'
        if(fe.includes('single-page') || fe.includes('spa') || fe.includes('html/css/js') || fe.includes('html, css')) return 'Single-page Web'
        if(Array.isArray(plan?.platforms)){
          const p = plan.platforms.map((x:string)=>x.toLowerCase()).join(' ')
          if(p.includes('mobile')) return 'Mobile-friendly Web'
          if(p.includes('marketing')) return 'Marketing Site'
        }
        return 'Web App'
      }

      // ── TITLE BLOCK ──
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8); setText(C.gray)
      pdf.text('BUILD PROPOSAL', margin, y); y += 5
      pdf.setFont('helvetica','bold'); pdf.setFontSize(22); setText(C.black)
      const titleLines = pdf.splitTextToSize(finalPlan.app_name||'Your App', contentW)
      for(const line of titleLines){ ensureSpace(9); pdf.text(line, margin, y); y += 8 }
      if(finalPlan.tagline){
        pdf.setFont('helvetica','italic'); pdf.setFontSize(11); setText(C.gray)
        const tl = pdf.splitTextToSize(finalPlan.tagline, contentW)
        for(const line of tl){ ensureSpace(5); pdf.text(line, margin, y); y += 5 }
      }
      spacer(4)

      // Meta line
      const proposalId = `JF/${Date.now().toString(36).toUpperCase().slice(-6)}`
      const today = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); setText(C.gray)
      pdf.text(`Prepared by ${jarvis?.jarvis_name||'JARVIS'}  ·  ${today}  ·  ${proposalId}`, margin, y); y += 4.5
      const recipient = (typeof user !== 'undefined' && user?.email) ? user.email : ''
      if(recipient){ pdf.text(`Prepared for: ${recipient}`, margin, y); y += 4.5 }
      spacer(2); divider(4)

      // ── EXECUTIVE SUMMARY ──
      if(finalPlan.executive_summary || finalPlan.summary){
        sectionTitle('Executive Summary', C.teal)
        writeBody(finalPlan.executive_summary || finalPlan.summary || '', { size: 10, lineGap: 2 })
        spacer(2)
      }

      // ── KEY STATS ROW ──
      ensureSpace(20)
      const stats: {label: string, value: string}[] = [
        { label: 'TIMELINE', value: formatBuildTime(finalPlan.est_build_time||finalPlan.est_time) },
        { label: 'INVESTMENT', value: String(finalPlan.est_cost_credits||'1 build credit') },
        { label: 'COMPLEXITY', value: String(finalPlan.complexity||'Medium') },
        { label: 'TYPE', value: inferAppType(finalPlan) },
      ]
      const statW = (contentW - 6) / 4
      stats.forEach((s, i) => {
        const x = margin + i * (statW + 2)
        setDraw(C.lightGray); setFill(C.bgFaint); pdf.setLineWidth(0.3)
        pdf.rect(x, y, statW, 16, 'FD')
        pdf.setFont('helvetica','normal'); pdf.setFontSize(6.8); setText(C.gray)
        pdf.text(s.label, x + 3, y + 5)
        pdf.setFont('helvetica','bold'); pdf.setFontSize(10); setText(C.teal)
        const valLines = pdf.splitTextToSize(s.value, statW - 6)
        pdf.text(valLines[0]||'', x + 3, y + 12)
      })
      y += 22

      // ── PROBLEM & SOLUTION ──
      if(finalPlan.problem || finalPlan.solution){
        if(finalPlan.problem){ subhead('The Problem', C.red); writeBody(finalPlan.problem, { lineGap: 2 }) }
        if(finalPlan.solution){ subhead('The Solution', C.teal); writeBody(finalPlan.solution, { lineGap: 2 }) }
        spacer(1); divider(4)
      }

      // ── TARGET USERS + PERSONAS ──
      if(finalPlan.target_users || finalPlan.personas?.length){
        sectionTitle('Who This Is For', C.purple)
        if(finalPlan.target_users){ writeBody(finalPlan.target_users, { size: 10, lineGap: 2 }) }
        if(finalPlan.personas?.length){
          spacer(1); subhead('Personas')
          for(const p of finalPlan.personas){
            ensureSpace(10)
            pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5); setText(C.purple)
            pdf.text(`• ${p.name||'Persona'}`, margin, y); y += 4.5
            writeBody(p.description||'', { size: 9.5, color: C.black, indent: 4, lineGap: 1.5 })
          }
        }
        spacer(2); divider(4)
      }

      // ── FEATURE TIERS ──
      // Each tier has a vector icon (no broken Unicode) drawn before each feature line.
      const drawFeatureBlock = (heading: string, items: string[], iconKind: 'check'|'plus'|'circle', color: number[]) => {
        if(!items?.length) return
        subhead(heading, color)
        for(const f of items){
          ensureSpace(5)
          // Draw the icon
          if(iconKind === 'check') drawCheck(margin, y, color)
          else if(iconKind === 'plus') drawPlus(margin, y, color)
          else drawOpenDot(margin, y, color)
          // Wrap and write the feature text
          pdf.setFont('helvetica','normal'); pdf.setFontSize(10); setText(C.black)
          const lines = pdf.splitTextToSize(f, contentW - 6)
          for(let i=0; i<lines.length; i++){ ensureSpace(4.5); pdf.text(lines[i], margin + 6, y + (i*4.5)) }
          y += Math.max(4.5, lines.length * 4.5) + 0.5
        }
        spacer(1)
      }
      const hasFeatures = (finalPlan.features_mvp?.length||finalPlan.features?.length) || finalPlan.features_v2?.length || finalPlan.features_future?.length
      if(hasFeatures){
        sectionTitle('What You\'ll Get', C.teal)
        drawFeatureBlock('MVP — In this build', finalPlan.features_mvp || finalPlan.features || [], 'check', C.teal)
        drawFeatureBlock('V2 — Next iteration', finalPlan.features_v2 || [], 'plus', C.purple)
        drawFeatureBlock('Future — Roadmap', finalPlan.features_future || [], 'circle', C.gold)
        divider(4)
      }

      // ── ARCHITECTURE / SCREEN MAP ──
      if(finalPlan.screens?.length){
        sectionTitle('App Architecture · Screen Map', C.teal)
        // Lay out screens as small cards in rows of 3, with arrows between
        const cardW = (contentW - 16) / 3
        const cardH = 16
        let col = 0
        let rowY = y
        for(let i=0; i<finalPlan.screens.length; i++){
          if(col === 3){ col = 0; y = rowY + cardH + 4; rowY = y; ensureSpace(cardH + 6) }
          const x = margin + col * (cardW + 8)
          ensureSpace(cardH + 2)
          if(rowY !== y){ rowY = y }
          setDraw(C.teal); setFill(C.bgFaint); pdf.setLineWidth(0.4)
          pdf.rect(x, rowY, cardW, cardH, 'FD')
          pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); setText(C.teal)
          const nameLines = pdf.splitTextToSize(finalPlan.screens[i].name||'', cardW - 4)
          pdf.text(nameLines[0]||'', x + 3, rowY + 5)
          pdf.setFont('helvetica','normal'); pdf.setFontSize(7); setText(C.gray)
          const purpLines = pdf.splitTextToSize(finalPlan.screens[i].purpose||'', cardW - 4)
          pdf.text(purpLines.slice(0,2), x + 3, rowY + 9)
          // Vector arrow to next card if same row
          if(col < 2 && i < finalPlan.screens.length - 1){
            drawArrow(x + cardW + 1, rowY + cardH/2, 6, C.lightGray)
          }
          col++
        }
        y = rowY + cardH + 6
        if(finalPlan.user_flows?.length){
          subhead('Key User Flows')
          for(const f of finalPlan.user_flows){
            // Replace any Unicode arrows in the flow text with " > " (Helvetica-safe)
            const safe = String(f).replace(/[→➝➔➜→]/g, ' > ').replace(/\s{2,}>/g, ' >').replace(/>\s{2,}/g, '> ')
            ensureSpace(4.5)
            // Small teal dot bullet
            setFill(C.teal); pdf.circle(margin + 1, y - 1.4, 0.6, 'F')
            pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); setText(C.black)
            const lines = pdf.splitTextToSize(safe, contentW - 4)
            for(let i=0; i<lines.length; i++){ ensureSpace(4); pdf.text(lines[i], margin + 4, y + (i*4)) }
            y += Math.max(4, lines.length * 4) + 0.5
          }
        }
        spacer(2); divider(4)
      }

      // ── TECHNICAL SPECS ──
      if(finalPlan.tech_stack){
        sectionTitle('Technical Specifications', C.teal)
        const entries = Object.entries(finalPlan.tech_stack)
        for(const [k, v] of entries){
          ensureSpace(7)
          pdf.setFont('helvetica','bold'); pdf.setFontSize(9); setText(C.gray)
          const labelText = k.replace(/_/g,' ').toUpperCase()
          pdf.text(labelText, margin, y)
          pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); setText(C.black)
          const lines = pdf.splitTextToSize(String(v||''), contentW - 30)
          for(let i=0; i<lines.length; i++){ ensureSpace(4); pdf.text(lines[i], margin + 28, y + (i*4)); }
          y += Math.max(5, lines.length * 4 + 1)
        }
        spacer(1); divider(4)
      }

      // ── DATA MODEL ──
      if(finalPlan.data_model?.length){
        sectionTitle('Data Model', C.teal)
        for(const t of finalPlan.data_model){
          ensureSpace(8)
          pdf.setFont('courier','bold'); pdf.setFontSize(9.5); setText(C.teal)
          pdf.text(`${t.table||'table'}`, margin, y); y += 4.5
          pdf.setFont('courier','normal'); pdf.setFontSize(8.5); setText(C.black)
          const lines = pdf.splitTextToSize(String(t.fields||''), contentW - 4)
          for(const line of lines){ ensureSpace(3.8); pdf.text(line, margin + 4, y); y += 3.8 }
          y += 1.5
        }
        spacer(1); divider(4)
      }

      // ── PHASED ROADMAP ──
      // Each phase gets its own accent: P1 = teal (live), P2 = purple (in flight), P3 = gold (future)
      if(finalPlan.phases?.length){
        sectionTitle('Phased Roadmap', C.teal)
        const phaseColors = [C.teal, C.purple, C.gold, C.gray]
        for(let i=0; i<finalPlan.phases.length; i++){
          const p = finalPlan.phases[i]
          const phColor = phaseColors[Math.min(i, phaseColors.length-1)]
          ensureSpace(15)
          // Numbered circle in the phase's color
          setFill(phColor); pdf.circle(margin + 3, y + 1, 3, 'F')
          pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(255,255,255)
          pdf.text(String(i+1), margin + 3, y + 2.3, { align: 'center' } as any)
          // Phase name in black, duration in the phase color (right-aligned)
          pdf.setFont('helvetica','bold'); pdf.setFontSize(10.5); setText(C.black)
          pdf.text(p.name||`Phase ${i+1}`, margin + 9, y + 1)
          pdf.setFont('helvetica','bold'); pdf.setFontSize(9); setText(phColor)
          pdf.text(String(p.duration||''), pageW - margin, y + 1, { align: 'right' } as any)
          y += 6
          if(p.deliverables){ writeBody(p.deliverables, { size: 9.5, indent: 9, color: C.black, lineGap: 1 }) }
          if(p.scope){ writeBody(`Scope: ${p.scope}`, { size: 8.5, indent: 9, color: C.gray, font: 'italic', lineGap: 1 }) }
          spacer(2)
        }
        divider(4)
      }

      // ── RISKS & MITIGATIONS ──
      if(finalPlan.risks?.length){
        sectionTitle('Risks & Mitigations', C.gold)
        for(const r of finalPlan.risks){
          ensureSpace(12)
          // Vector warning triangle in gold
          drawWarning(margin, y, C.gold)
          // Risk title
          pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5); setText(C.gold)
          const riskLines = pdf.splitTextToSize(String(r.risk||'Risk'), contentW - 8)
          for(let i=0; i<riskLines.length; i++){ ensureSpace(4.5); pdf.text(riskLines[i], margin + 7, y + (i*4.5)) }
          y += Math.max(5, riskLines.length * 4.5)
          // Mitigation block — small label + body, indented under the warning
          pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); setText(C.gray)
          pdf.text('MITIGATION', margin + 7, y)
          pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); setText(C.black)
          const mitLines = pdf.splitTextToSize(String(r.mitigation||''), contentW - 32)
          for(let i=0; i<mitLines.length; i++){ ensureSpace(4); pdf.text(mitLines[i], margin + 30, y + (i*4)) }
          y += Math.max(5, mitLines.length * 4 + 2)
        }
        divider(4)
      }

      // ── JARVIS'S RECOMMENDATIONS ──
      if(finalPlan.recommendations?.length){
        sectionTitle("JARVIS's Recommendations", C.purple)
        for(let i=0; i<finalPlan.recommendations.length; i++){
          ensureSpace(7)
          pdf.setFont('helvetica','bold'); pdf.setFontSize(10); setText(C.purple)
          pdf.text(`${i+1}.`, margin, y)
          pdf.setFont('helvetica','normal'); pdf.setFontSize(10); setText(C.black)
          const lines = pdf.splitTextToSize(finalPlan.recommendations[i], contentW - 7)
          for(let j=0; j<lines.length; j++){ ensureSpace(4.5); pdf.text(lines[j], margin + 6, y + (j*4.5)); }
          y += Math.max(5, lines.length * 4.5 + 1.5)
        }
        divider(4)
      }

      // ── BUILD APPROACH ──
      if(finalPlan.approach || finalPlan.note){
        sectionTitle("JARVIS's Build Approach", C.teal)
        writeBody(finalPlan.approach || finalPlan.note || '', { size: 10, lineGap: 2 })
        spacer(2)
      }

      // ── SIGNATURE BLOCK ──
      ensureSpace(28)
      divider(6)
      pdf.setFont('helvetica','bold'); pdf.setFontSize(10); setText(C.black)
      pdf.text('Approval', margin, y); y += 6
      pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); setText(C.gray)
      pdf.text('I approve the scope, timeline and investment described in this proposal.', margin, y); y += 8
      // Two signature lines
      const halfW = (contentW - 8) / 2
      setDraw(C.lightGray); pdf.setLineWidth(0.4)
      pdf.line(margin, y + 6, margin + halfW, y + 6)
      pdf.line(margin + halfW + 8, y + 6, margin + halfW*2 + 8, y + 6)
      pdf.setFontSize(8); setText(C.gray)
      pdf.text('Signature', margin, y + 10)
      pdf.text('Date', margin + halfW + 8, y + 10)
      y += 12

      // ── FOOTER ON ALL PAGES ──
      const totalPages = pdf.internal.pages.length - 1
      for(let i=1; i<=totalPages; i++){
        pdf.setPage(i)
        setDraw(C.hairline); pdf.setLineWidth(0.2)
        pdf.line(margin, pageH - 12, pageW - margin, pageH - 12)
        pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); setText(C.gray)
        pdf.text(`JarvisFactory.ai · ${finalPlan.app_name||'Build Proposal'}`, margin, pageH - 7)
        pdf.text(`Page ${i} of ${totalPages}  ·  ${proposalId}`, pageW - margin, pageH - 7, { align: 'right' } as any)
      }

      const slug = (finalPlan.app_name||'proposal').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)
      const date = new Date().toISOString().slice(0,10)
      pdf.save(`JarvisFactory-${slug}-proposal-${date}.pdf`)
      addLog(`Print-quality PDF downloaded (${totalPages} pages)`, 'ok')
    } catch(err: any) {
      addLog('PDF export failed: ' + err.message, 'err')
      addChat('❌ PDF export failed: ' + err.message)
    } finally {
      setIsExportingPDF(false)
    }
  }

  // ── v6: Reverse-engineer a full proposal from an existing app's HTML.
  // Used for OLD apps built before proposals existed. JARVIS reads the code
  // and produces a clean proposal JSON so the user can download a PDF. ──
  async function regenerateProposalFromCode(app: any): Promise<any> {
    addLog(`Regenerating proposal from "${app.name}"...`, 'info')
    addChat(`📋 No proposal saved for <strong>${app.name}</strong> — JARVIS is reading the code and generating one now...`)
    const code = (app.html_code || '').slice(0, 28000) // cap to be safe with token limits
    const sys = `You are JARVIS, an AI lead engineer reverse-engineering a build proposal from an existing app's HTML.
Read the HTML carefully. Identify what the app does, who it's for, what features it has, the data model, the screens, and how it works.
Return ONLY valid JSON (no markdown fences). Use the EXACT structure below.

{
  "app_name": "${app.name||'App'}",
  "tagline": "One sentence pitch reverse-engineered from the code",
  "executive_summary": "3-4 sentence summary of what this app does and who it's for",
  "problem": "Inferred problem this app solves",
  "solution": "How it solves it, based on the code",
  "target_users": "Specific persona inferred from the UI/labels",
  "personas": [{"name": "Persona name", "description": "Description"}],
  "features_mvp": ["Concrete feature 1 derived from code", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
  "features_v2": ["Logical next-iteration features"],
  "features_future": ["Long-term roadmap items"],
  "screens": [{"name": "Screen name from code", "purpose": "What it does"}],
  "user_flows": ["Flow 1: Step → Step → Step"],
  "data_model": [{"table": "table_name from Jarvis.saveData calls or DOM", "fields": "fields detected"}],
  "tech_stack": {
    "frontend": "Single-page HTML/CSS/JS",
    "backend": "Supabase via Jarvis library",
    "database": "Supabase Postgres (app_users + app_data)",
    "hosting": "Railway / Vercel",
    "ai": "Claude Sonnet 4.6",
    "integrations": "Detected integrations"
  },
  "phases": [
    {"name": "Phase 1 — MVP (already built)", "duration": "Complete", "deliverables": "Working app", "scope": "Current feature set"},
    {"name": "Phase 2 — Iterate", "duration": "On demand", "deliverables": "Refinements via chat feedback", "scope": "Feedback-driven"},
    {"name": "Phase 3 — V2 features", "duration": "Future build", "deliverables": "v2 feature set", "scope": "From features_v2"}
  ],
  "risks": [{"risk": "Specific risk you can see in the code", "mitigation": "How to address"}],
  "recommendations": ["Honest recommendation based on what you read", "Recommendation 2", "Recommendation 3"],
  "complexity": "Simple | Medium | Advanced",
  "est_build_time": "${app.build_time||'~90s'}",
  "est_tokens": "${app.tokens_used||'~5000'}",
  "est_cost_credits": "1 build credit",
  "summary": "${(app.description||'').replace(/"/g,'\\"').slice(0,300)}",
  "approach": "How JARVIS approached this build, inferred from the code"
}

Be specific. Read the actual code. Don't hallucinate features that aren't there.`
    const raw = await callClaude(sys, `App name: ${app.name}\nApp description: ${app.description||'—'}\n\nHTML CODE:\n\n${code}`, 5000)
    let plan: any
    try { plan = JSON.parse(raw.replace(/```json|```/g,'').trim()) }
    catch(e) { plan = { app_name: app.name, summary: app.description, features_mvp:[], approach:'Reverse-engineered from saved code.' } }
    if(!plan.features) plan.features = plan.features_mvp || []
    if(!plan.note && plan.approach) plan.note = plan.approach
    // Persist back to Supabase so we never have to regenerate again
    await supabase.from('apps').update({ proposal_data: plan }).eq('id', app.id)
    setMyApps(prev => prev.map(a => a.id===app.id ? {...a, proposal_data: plan} : a))
    addLog('Proposal regenerated and saved.', 'ok')
    return plan
  }

  // ── v6: Open the proposal modal + auto-download PDF for any app.
  // If the app has no proposal_data yet, regenerate one first. ──
  async function triggerProposalPDF(app: any) {
    let plan = app.proposal_data
    if(!plan) {
      addChat(`📋 Generating proposal from your existing app...`)
      try { plan = await regenerateProposalFromCode(app) } catch(err: any) { addLog('Regeneration failed: '+err.message, 'err'); return }
    }
    setFinalPlan(plan)
    setShowProposal(true)
    // Wait for the modal to render, then trigger PDF download
    setTimeout(() => downloadProposalPDF(), 600)
  }

  function discoveryContext(): string {
    const d = discovery
    const parts: string[] = []
    if(d.vision) parts.push(`Vision/goal: ${d.vision}`)
    if(d.target_users) parts.push(`Target users: ${d.target_users}`)
    if(d.reference_apps) parts.push(`Reference apps the user likes: ${d.reference_apps}`)
    if(d.ui_style) parts.push(`Preferred UI/UX style: ${d.ui_style}`)
    if(d.must_haves) parts.push(`MUST HAVE features: ${d.must_haves}`)
    if(d.nice_haves) parts.push(`Nice to have features: ${d.nice_haves}`)
    if(d.integrations.length) parts.push(`Required integrations: ${d.integrations.join(', ')}`)
    if(d.languages.length) parts.push(`Supported languages: ${d.languages.join(', ')}`)
    if(d.platforms.length) parts.push(`Target platforms: ${d.platforms.join(', ')}`)
    if(d.pricing_model) parts.push(`Pricing/business model: ${d.pricing_model}`)
    if(d.notes) parts.push(`Additional notes: ${d.notes}`)
    return parts.length ? '\n\nDISCOVERY BRIEF FROM CLIENT:\n' + parts.join('\n') : ''
  }

  async function launch() {
    if(!prompt.trim()) return
    setShowDiscovery(false)
    addChat(prompt, true)
    setPhase('planning')
    setQuestions([])
    setQAnswers({})
    setFinalPlan(null)
    addLog(`NEW PROJECT: ${prompt.substring(0,60)}...`, 'build')
    if(attachments.length > 0) addLog(`Using ${attachments.length} reference file(s) as design context`, 'ok')
    const ctx = discoveryContext()
    if(ctx) addLog(`Discovery brief captured (${Object.values(discovery).flat().filter(Boolean).length} fields)`, 'ok')
    addLog('Analysing requirements...', 'info')
    try {
      const sys = `You are ${jarvis?.jarvis_name||'JARVIS'}, an AI lead engineer specialising in ${jarvis?.industry||'general'} apps for SEA / Muslim markets.
The client has shared their initial idea and (optionally) a discovery brief.
Generate exactly 3 clarifying questions that fill in the BIGGEST remaining gaps — do NOT ask about anything already covered in the brief.
Each question should have 3-4 concrete options written in plain language (no jargon).
Return ONLY valid JSON, no markdown:
{"questions":[{"q":"Question?","options":["A","B","C"]}],"app_name":"Name","summary":"One sentence"}`
      const raw = await callClaude(sys, `Client request: ${prompt}${ctx}`, 1500)
      // v7.8: Resilient JSON parsing — try clean parse, then JSON repair, then fall back
      // to safe defaults so the user is never blocked at the questioning step.
      let data: any
      const cleaned = raw.replace(/```json|```/g, '').trim()
      try { data = JSON.parse(cleaned) }
      catch {
        // Try to extract a {...} block via brace-matching (in case Claude wrapped with prose)
        const firstBrace = cleaned.indexOf('{')
        const lastBrace = cleaned.lastIndexOf('}')
        if(firstBrace !== -1 && lastBrace > firstBrace){
          try { data = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) } catch {}
        }
      }
      if(!data){
        // Last resort: synthesize default questions so the flow can continue
        addLog('Question generation parse failed — using default discovery questions.', 'warn')
        data = {
          app_name: 'Your App',
          summary: prompt.slice(0, 120),
          questions: [
            { q: 'Who is the primary user of this app?', options: ['Customers', 'Internal staff', 'Both', 'Other'] },
            { q: 'What is the most important feature to nail first?', options: ['Easy signup/login', 'Beautiful UI', 'Fast data entry', 'Reports/analytics'] },
            { q: 'How will users access this most often?', options: ['Phone', 'Laptop', 'Both equally', 'Tablet'] },
          ]
        }
      }
      setPendingPlan(data)
      // v7.7: sanitize — JARVIS sometimes returns malformed questions (missing `options`).
      // Coerce each question into a safe shape so the JSX never .map()s undefined.
      const safeQuestions = (data.questions || [])
        .map((q: any) => ({
          q: q?.q || q?.question || 'Question',
          options: Array.isArray(q?.options) && q.options.length >= 2
            ? q.options
            : ['Yes', 'No', 'Not sure'],
        }))
        .slice(0, 5)
      setQuestions(safeQuestions)
      setPhase('questioning')
      addLog('Questions ready. Waiting for answers...', 'info')
    } catch(err: any) {
      addLog('ERROR: '+err.message, 'err')
      addChat('❌ Error: '+err.message)
      setPhase('idle')
    }
  }

  function selectAnswer(qIndex: number, val: string) {
    setQAnswers(prev => ({...prev, [qIndex]: val}))
  }

  async function submitAnswers() {
    const answers = questions.map((q:any,i:number) => `${q.q}: ${qAnswers[i]||q.options[0]}`).join('\n')
    setPhase('approving')
    addLog('Generating final build plan...', 'info')
    try {
      const ctx = discoveryContext()
      const sys = `You are JARVIS, an elite AI lead software engineer producing a CONSULTING-GRADE BUILD PROPOSAL.
The client is a non-technical entrepreneur. Write like a senior partner at McKinsey + a Y-Combinator engineer combined.
Be confident, specific, and warm. Use plain English. Numbers and concrete details over jargon.
This proposal is the contract. The richer it is, the more the client trusts JARVIS.

Return ONLY valid JSON (no markdown fences, no commentary). Use this EXACT structure:
{
  "app_name": "Short product-style name",
  "tagline": "One memorable sentence — pitch-deck quality",
  "executive_summary": "3-4 sentence executive summary: what we're building, who it's for, why it matters, what's the unfair advantage",
  "problem": "1-2 sentences naming the specific problem this app solves",
  "solution": "1-2 sentences describing how this app solves it",
  "target_users": "Specific persona: 'F&B operators in Klang Valley with 1-3 outlets who want to stop using paper loyalty cards'",
  "personas": [
    {"name": "Primary persona name", "description": "Who they are, what they need, what frustrates them today"},
    {"name": "Secondary persona name", "description": "Description"}
  ],
  "features_mvp": ["Feature 1 in user-facing language", "Feature 2", "Feature 3", "Feature 4", "Feature 5", "Feature 6"],
  "features_v2": ["Feature 1", "Feature 2", "Feature 3"],
  "features_future": ["Future feature 1", "Future feature 2"],
  "screens": [
    {"name": "Login / Signup", "purpose": "What this screen does for the user"},
    {"name": "Dashboard", "purpose": "Purpose"},
    {"name": "Add Item", "purpose": "Purpose"}
  ],
  "user_flows": [
    "Step 1 → Step 2 → Step 3 (named like a real flow)",
    "Another flow: Step → Step → Step"
  ],
  "data_model": [
    {"table": "users", "fields": "id, email, full_name, role, created_at"},
    {"table": "items", "fields": "id, user_id, name, value, created_at"}
  ],
  "tech_stack": {
    "frontend": "Single-page HTML/CSS/JS injected into Supabase-backed app",
    "backend": "Supabase (Postgres + Auth via Jarvis library)",
    "database": "Supabase Postgres — app_users + app_data (key-value, scoped per app)",
    "hosting": "Railway with custom domain (Builder/Agency tiers)",
    "ai": "Claude Sonnet 4.6 via /api/chat proxy",
    "integrations": "List specific integrations needed (e.g. DuitNow, WhatsApp, Stripe)"
  },
  "phases": [
    {"name": "Phase 1 — MVP", "duration": "60-90 seconds", "deliverables": "Working app with all MVP features deployed live", "scope": "What's in scope"},
    {"name": "Phase 2 — Iterate", "duration": "Conversational, on-demand", "deliverables": "Refinements based on feedback", "scope": "Feedback-driven changes"},
    {"name": "Phase 3 — V2 Features", "duration": "Future build (separate proposal)", "deliverables": "v2 feature set", "scope": "From features_v2"}
  ],
  "risks": [
    {"risk": "Specific risk 1", "mitigation": "How JARVIS handles it"},
    {"risk": "Specific risk 2", "mitigation": "Mitigation"}
  ],
  "recommendations": [
    "Specific recommendation 1 from JARVIS — what to prioritise, what to skip, what to add later",
    "Recommendation 2",
    "Recommendation 3"
  ],
  "complexity": "Simple | Medium | Advanced",
  "est_build_time": "About 90 seconds",
  "est_tokens": "8000-12000",
  "est_cost_credits": "1 build credit (~RM7-10 from your monthly plan)",
  "summary": "One paragraph spoken summary the user can read aloud to feel confident",
  "approach": "2-3 sentences on JARVIS's build strategy — what's prioritised, what's deliberately kept simple, why this approach"
}

RULES:
- Write features as USER OUTCOMES not technical names. ✗ "JWT auth system" ✓ "Customers sign in with email and password and stay logged in for 30 days"
- 'screens' should be 4-8 items minimum
- 'data_model' should have 2-5 tables, listing real fields
- 'risks' should be specific to THIS app, not generic ("AI hallucinations" is generic — bad)
- 'recommendations' should be the specific, opinionated advice JARVIS would give as the lead engineer
- If the discovery brief mentioned reference apps, weave them into 'approach'
- If the discovery brief mentioned UI style, reflect it in 'approach'
- If integrations were listed, reflect them in 'tech_stack.integrations'`
      const raw = await callClaude(sys, `Request: ${prompt}\nAnswers:\n${answers}${ctx}`, 5000)
      let plan; try{plan=JSON.parse(raw.replace(/```json|```/g,'').trim())}catch(e){plan={app_name:'Your App',tagline:prompt.substring(0,80),executive_summary:prompt,problem:'',solution:'',target_users:'You',personas:[],features_mvp:['Core features'],features_v2:[],features_future:[],screens:[],user_flows:[],data_model:[],tech_stack:{frontend:'HTML+CSS+JS',backend:'Supabase',database:'Supabase Postgres',hosting:'Railway',ai:'Claude Sonnet 4.6',integrations:'—'},phases:[],risks:[],recommendations:[],complexity:'Medium',est_build_time:'About 90 seconds',est_tokens:'8000-12000',est_cost_credits:'1 build credit',summary:prompt,approach:'Building as requested.',note:'Building as requested.'}}
      // Backward-compat: keep legacy fields populated so older code paths don't break
      if(!plan.features) plan.features = plan.features_mvp || []
      if(!plan.note && plan.approach) plan.note = plan.approach
      if(!plan.tech && plan.tech_stack) plan.tech = `${plan.tech_stack.frontend} + ${plan.tech_stack.backend}`
      if(!plan.est_time && plan.est_build_time) plan.est_time = plan.est_build_time
      setFinalPlan(plan)
      addLog('Plan ready. Awaiting your approval...', 'info')
    } catch(err: any) {
      addLog('ERROR: '+err.message, 'err')
      setPhase('idle')
    }
  }

  async function approveBuild() {
    if(!finalPlan) return
    setPhase('building')
    addChat(`✅ <strong>Plan approved.</strong> The team is starting work...`)
    addLog('Multi-agent pipeline started.', 'build')
    startRef.current = Date.now()
    timerRef.current = setInterval(() => { setBuildTime(((Date.now()-startRef.current)/1000).toFixed(1)+'s') }, 100)

    // Reset agent statuses (v9.5: includes designer between architect and builder)
    setAgentStatus({
      architect: { status: 'pending' },
      designer: { status: 'pending' },
      builder: { status: 'pending' },
      qa: { status: 'pending' },
    })

    try {
      const input: BuildInput = {
        finalPlan,
        prompt,
        questions,
        qAnswers,
        jarvisId: jarvis?.id || null,
        jarvisName: jarvis?.jarvis_name || 'JARVIS',
        industry: jarvis?.industry,
        brandName: brandName || undefined,
        brandColour: brandColour || undefined,
        attachments: attachments.map(a => ({ name: a.name, type: a.type })),
      }
      const deps: BuildDeps = {
        callClaude,
        callClaudeAgentic,
        captureScreenshot: captureAppScreenshot,
      }
      const { code: builtHtml, qaReport, iterations, toolCallCount } = await runBuild(input, deps)
      let code = builtHtml
      setQaReport(qaReport)
      const validation = qaReport ? { valid: !!qaReport.certified, errors: qaReport.failed || [], warnings: qaReport.warnings || [] } : { valid: true, errors: [], warnings: [] }
      const attempt = 0 // legacy variable used in chat below

      clearInterval(timerRef.current)
      const tok = Math.round(code.length / 4)
      setTokens(tok.toLocaleString())
      setPhase('done')
      const validIcon = validation?.valid ? '✅' : '⚠️'
      addLog(`DONE. ${validIcon} ~${tok} tokens, ${((Date.now()-startRef.current)/1000).toFixed(1)}s, ${attempt+1} attempt${attempt>0?'s':''}`, 'ok')
      addLog('Tip: Type feedback in the chat below to improve anything!', 'ok')
      addChat(`🚀 <strong>Build complete!</strong> ${validIcon} <strong style="color:#00e5b0">${tok.toLocaleString()} tokens</strong> · <strong style="color:#ffd166">${((Date.now()-startRef.current)/1000).toFixed(1)}s</strong>${attempt>0 ? ` · <strong style="color:#ff6b9d">${attempt+1} attempts</strong>` : ''}<br><br>Switch to <strong>⬡ Preview</strong> to test it.<br><br><span style="color:#8b7cf8;font-size:11px">💬 Type feedback below to improve anything — I'm still here!</span>`)
      if(user) {
        const buildTimeStr = ((Date.now()-startRef.current)/1000).toFixed(1)
        const { data: newRow } = await supabase.from('apps').insert({
          user_id: user.id, name: finalPlan.app_name||'My App',
          description: finalPlan.summary||prompt.substring(0,200),
          html_code: code, tokens_used: tok,
          build_time: buildTimeStr,
          proposal_data: finalPlan,  // v6: persist the full proposal so user can download PDF later
          created_at: new Date().toISOString()
        }).select().single()
        if(newRow) {
          // v5.2: Inject backend library NOW that we have the appId
          code = injectBackend(code, newRow.id)
          // Update the saved row with the injected version
          await supabase.from('apps').update({ html_code: code }).eq('id', newRow.id)
          setCurrentAppId(newRow.id)
          localStorage.setItem('jf_last_app_id', newRow.id)
          setMyApps(prev => [{...newRow, html_code: code}, ...prev])

          // ── v9: Record this build's outcome — JARVIS learns from every build ──
          const durationSec = (Date.now()-startRef.current)/1000
          await recordBuildOutcome({
            app_id: newRow.id,
            jarvis_id: jarvis?.id || null,
            qa_score: qaReport?.score,
            qa_certified: !!qaReport?.certified,
            iterations,
            duration_seconds: durationSec,
            errors_caught_by_audit: qaReport?.failed || [],
            features_delivered: finalPlan?.features_mvp || finalPlan?.features || [],
            features_missed: [],
            user_satisfaction: undefined, // user can rate later
            notes: `Builder iterations: ${iterations}, tool calls: ${toolCallCount}`,
          })
          addLog(`🧠 Build outcome recorded to JARVIS memory.`, 'ok')

          // ── v9.8 Phase 3: auto-extract reusable lessons from this build's QA findings ──
          try {
            const lessonsExtracted = await extractLessonsFromQA({
              qaReport,
              proposal: finalPlan,
              jarvisId: jarvis?.id || null,
              callClaude: async (sys, msg, maxTok, mdl) => callClaude(sys, msg, maxTok, false, mdl),
            })
            if (lessonsExtracted.length > 0) {
              addLog(`🧠 +${lessonsExtracted.length} new lesson${lessonsExtracted.length===1?'':'s'} added to JARVIS memory from this build.`, 'ok')
              const lessonList = lessonsExtracted.map(l => `&nbsp;&nbsp;<span style="color:#7c5cff">[${l.category}]</span> ${l.pattern.slice(0, 120)}${l.pattern.length>120?'…':''}`).join('<br>')
              addChat(`🧠 <strong>JARVIS just learned ${lessonsExtracted.length} new lesson${lessonsExtracted.length===1?'':'s'}</strong> from this build:<br>${lessonList}<br><br><span style="color:#6f7079;font-size:11px">These will inform every future build automatically.</span>`)
            }
          } catch (err: any) {
            addLog(`Lesson extraction skipped: ${err?.message}`, 'warn')
          }
        }
      }
      setBuiltCode(code)
      setTimeout(() => setActiveTab('preview'), 800)
    } catch(err: any) {
      clearInterval(timerRef.current)
      addLog('ERROR: '+err.message, 'err')
      addChat('❌ Build failed: '+err.message)
      setPhase('idle')
      // Mark whichever agent was working as failed
      setAgentStatus(s => {
        const updated = { ...s }
        for(const k of Object.keys(updated)){
          if(updated[k].status === 'working') updated[k] = { status: 'failed', note: err.message }
        }
        return updated
      })
    }
  }

  function rejectPlan() {
    setFinalPlan(null)
    setPhase('idle')
    addChat("No problem — update your description and let's try again.")
  }

  function download() {
    if(!builtCode) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([builtCode], {type:'text/html'}))
    a.download = (finalPlan?.app_name||'jarvis-app').replace(/\s+/g,'-').toLowerCase()+'.html'
    a.click()
    addLog('App downloaded.', 'ok')
  }

  const allAnswered = questions.length > 0 && questions.every((_:any,i:number) => qAnswers[i])
  const isWorking = ['planning','questioning','approving','building','iterating'].includes(phase)

  const phaseLabel = {idle:'IDLE',planning:'PLANNING',questioning:'Q&A',approving:'REVIEW',building:'BUILDING',iterating:'ITERATING',done:'DONE'}[phase]

  const c: Record<string,React.CSSProperties> = {
    page:{height:'100vh',display:'flex',flexDirection:'column',background:'#06070b',fontFamily:"'Inter','DM Sans',sans-serif",overflow:'hidden'},
    nav:{height:54,background:'#0c0d12',borderBottom:'1px solid #1c1d24',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 18px',flexShrink:0},
    logo:{fontFamily:"'Space Mono',monospace",fontSize:15,color:'#00e5b0',fontWeight:700},
    main:{display:'flex',flex:1,overflow:'hidden'},
    left:{width:280,background:'#0c0d12',borderRight:'1px solid #1c1d24',display:'flex',flexDirection:'column',flexShrink:0},
    pTitle:{padding:'10px 16px',fontSize:11,fontFamily:"'Space Mono',monospace",color:'#6f7079',textTransform:'uppercase' as const,letterSpacing:1.5,borderBottom:'1px solid #1c1d24',display:'flex',justifyContent:'space-between'},
    phaseTag:{fontSize:10,padding:'3px 9px',borderRadius:10,fontFamily:"'Space Mono',monospace",background:'rgba(90,90,120,0.3)',color:'#a8a9b3'},
    promptArea:{flex:1,padding:12,overflowY:'auto' as const,display:'flex',flexDirection:'column' as const,gap:10},
    textarea:{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:8,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'none' as const,height:110,lineHeight:1.6,outline:'none',boxSizing:'border-box' as const},
    launchBtn:{margin:'0 12px 12px',padding:13,background:'#00e5b0',color:'#000',border:'none',borderRadius:9,fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6},
    center:{flex:1,display:'flex',flexDirection:'column' as const,overflow:'hidden'},
    tabs:{display:'flex',background:'#0c0d12',borderBottom:'1px solid #1c1d24',padding:'0 14px',flexShrink:0},
    tab:{padding:'10px 16px',fontSize:13,fontFamily:"'Space Mono',monospace",color:'#6f7079',cursor:'pointer',borderBottom:'2px solid transparent'},
    term:{height:140,background:'#06070b',borderTop:'1px solid #1c1d24',flexShrink:0,display:'flex',flexDirection:'column' as const},
    termH:{padding:'7px 14px',borderBottom:'1px solid #1c1d24',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
    termB:{flex:1,overflow:'auto',padding:'7px 14px',fontFamily:"'Space Mono',monospace",fontSize:11.5,lineHeight:1.85},
    right:{width:440,background:'#0c0d12',borderLeft:'1px solid #1c1d24',display:'flex',flexDirection:'column' as const,flexShrink:0},
    chatH:{padding:'12px 16px',borderBottom:'1px solid #1c1d24',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
    chatBody:{flex:1,overflowY:'auto' as const,padding:14,display:'flex',flexDirection:'column' as const,gap:12},
    bubble:{fontSize:14.5,lineHeight:1.65,color:'#e8e9ed',background:'#0e0f15',padding:'12px 14px',borderRadius:10,border:'1px solid #252538',wordBreak:'break-word' as const},
    feedbackArea:{padding:'10px 12px',borderTop:'1px solid #1c1d24',flexShrink:0,background:'#080810'},
    feedbackInput:{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:8,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:'10px 12px',resize:'none' as const,height:72,lineHeight:1.55,outline:'none',boxSizing:'border-box' as const,marginBottom:7},
    feedbackRow:{display:'flex',gap:7},
    attachBtn:{padding:'8px 12px',background:'transparent',border:'1px solid #262731',borderRadius:7,color:'#a8a9b3',fontSize:13,cursor:'pointer',fontFamily:"'Space Mono',monospace",flexShrink:0},
    sendBtn:{flex:1,padding:'8px 12px',background:isFeedbackLoading?'#262731':'#8b7cf8',color:isFeedbackLoading?'#6f7079':'#fff',border:'none',borderRadius:7,fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,cursor:isFeedbackLoading?'not-allowed':'pointer'},
  }

  return (
    <div style={c.page}>
      <style>{`@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv" onChange={handleFileAttach} style={{display:'none'}}/>

      {/* ── v6: DEEP DISCOVERY MODAL ──
          Pops up when user clicks Launch. Captures rich context so JARVIS can
          produce a proper proposal — reference apps, UI/UX style, must-haves, etc.
          Every field is optional. The more they fill, the better the proposal. */}
      {showDiscovery && (
        <div style={{position:'fixed' as const,inset:0,background:'rgba(5,5,13,0.85)',backdropFilter:'blur(8px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24,animation:'fadeIn 0.2s ease'}}>
          <div style={{width:'100%',maxWidth:780,maxHeight:'92vh',overflowY:'auto' as const,background:'#0d0d1e',border:'1px solid rgba(0,229,176,0.25)',borderRadius:16,boxShadow:'0 30px 80px rgba(0,0,0,0.6)'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid #1c1d24',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky' as const,top:0,background:'#0d0d1e',zIndex:1}}>
              <div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:3}}>Step 1 of 3 · Deep Discovery</div>
                <div style={{fontSize:18,fontWeight:700,color:'#e8e9ed'}}>Tell JARVIS more about your project</div>
                <div style={{fontSize:13,color:'#a8a9b3',marginTop:3}}>Every field is optional — the more you share, the better the proposal.</div>
              </div>
              <button onClick={()=>setShowDiscovery(false)} style={{width:36,height:36,borderRadius:9,background:'transparent',border:'1px solid #262731',color:'#a8a9b3',fontSize:16,cursor:'pointer'}}>×</button>
            </div>

            <div style={{padding:24,display:'flex',flexDirection:'column' as const,gap:20}}>

              {/* Vision */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>🎯 Vision</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:8}}>What do you want this app to achieve in one or two sentences?</div>
                <textarea value={discovery.vision} onChange={e=>setDiscovery({...discovery,vision:e.target.value})} placeholder="e.g. I want a loyalty app for my coffee shop in Shah Alam so customers earn points and come back more often." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'vertical' as const,minHeight:60,lineHeight:1.5,outline:'none',boxSizing:'border-box' as const}}/>
              </div>

              {/* Target users */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>👥 Target Users</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:8}}>Who is this app for? Be specific — age, role, location, what they do today.</div>
                <textarea value={discovery.target_users} onChange={e=>setDiscovery({...discovery,target_users:e.target.value})} placeholder="e.g. F&B operators in Klang Valley with 1-3 outlets, currently using paper loyalty cards." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'vertical' as const,minHeight:60,lineHeight:1.5,outline:'none',boxSizing:'border-box' as const}}/>
              </div>

              {/* Reference apps */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>🌐 Reference Apps You Like</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:8}}>Paste names or URLs. What do you like about them? (e.g. "Tealive app — clean dashboard. Grab — easy ordering.")</div>
                <textarea value={discovery.reference_apps} onChange={e=>setDiscovery({...discovery,reference_apps:e.target.value})} placeholder="e.g. Tealive app for the rewards UI. Grab for simple ordering. Notion for the calm aesthetic." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'vertical' as const,minHeight:70,lineHeight:1.5,outline:'none',boxSizing:'border-box' as const}}/>
              </div>

              {/* UI Style picker */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>🎨 UI/UX Style</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:10}}>Pick the closest fit — JARVIS will design accordingly.</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',gap:8}}>
                  {[
                    {k:'Modern & Minimal',d:'Lots of white space, clean'},
                    {k:'Bold & Confident',d:'Big type, strong accents'},
                    {k:'Playful & Friendly',d:'Rounded, soft, warm'},
                    {k:'Corporate & Professional',d:'Trustworthy, structured'},
                    {k:'Dark & Premium',d:'Dark mode, neon accents'},
                    {k:'Halal-first / Islamic',d:'Calm, geometric, modest'},
                  ].map(s=>(
                    <button key={s.k} onClick={()=>setDiscovery({...discovery,ui_style:s.k})} style={{padding:'10px 12px',background:discovery.ui_style===s.k?'rgba(0,229,176,0.12)':'#0e0f15',border:`1px solid ${discovery.ui_style===s.k?'#00e5b0':'#262731'}`,borderRadius:9,color:discovery.ui_style===s.k?'#00e5b0':'#a8a8c0',cursor:'pointer',textAlign:'left' as const,transition:'all 0.15s'}}>
                      <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{s.k}</div>
                      <div style={{fontSize:11,color:'#6f7079'}}>{s.d}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Must-haves */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#ffd166',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>⭐ Must-Have Features</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:8}}>Non-negotiable. The app fails without these.</div>
                <textarea value={discovery.must_haves} onChange={e=>setDiscovery({...discovery,must_haves:e.target.value})} placeholder="e.g. Customer signs up with phone number. Earns 1 point per RM10 spent. Redeems free drink at 100 points." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'vertical' as const,minHeight:70,lineHeight:1.5,outline:'none',boxSizing:'border-box' as const}}/>
              </div>

              {/* Nice-to-haves */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#8b7cf8',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>✨ Nice-to-Have Features</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:8}}>Cool to add if budget/time allows. JARVIS will note these for v2.</div>
                <textarea value={discovery.nice_haves} onChange={e=>setDiscovery({...discovery,nice_haves:e.target.value})} placeholder="e.g. Birthday surprise reward. Referral bonuses. Push notifications." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'vertical' as const,minHeight:60,lineHeight:1.5,outline:'none',boxSizing:'border-box' as const}}/>
              </div>

              {/* Integrations multi-select */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>🔌 Required Integrations</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:10}}>Tap to toggle. Add the ones your app needs.</div>
                <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
                  {['DuitNow','Stripe','PayPal','WhatsApp','Telegram','Email','SMS','Google Maps','Google Login','Facebook Login','Apple Login','Calendar','PDF Export','CSV Export','Camera/QR'].map(opt=>(
                    <button key={opt} onClick={()=>toggleArrayValue('integrations',opt)} style={{padding:'7px 13px',background:discovery.integrations.includes(opt)?'rgba(0,229,176,0.15)':'#0e0f15',border:discovery.integrations.includes(opt)?'1px solid #00e5b0':'1px solid #262731',borderRadius:20,fontSize:12.5,color:discovery.integrations.includes(opt)?'#00e5b0':'#a8a8c0',cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif"}}>{discovery.integrations.includes(opt)?'✓ ':''}{opt}</button>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>🌍 Languages</label>
                <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
                  {['English','Bahasa Melayu','Bahasa Indonesia','Mandarin','Arabic','Tamil'].map(opt=>(
                    <button key={opt} onClick={()=>toggleArrayValue('languages',opt)} style={{padding:'7px 13px',background:discovery.languages.includes(opt)?'rgba(0,229,176,0.15)':'#0e0f15',border:discovery.languages.includes(opt)?'1px solid #00e5b0':'1px solid #262731',borderRadius:20,fontSize:12.5,color:discovery.languages.includes(opt)?'#00e5b0':'#a8a8c0',cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif"}}>{discovery.languages.includes(opt)?'✓ ':''}{opt}</button>
                  ))}
                </div>
              </div>

              {/* Platforms */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>📱 Platforms</label>
                <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
                  {['Web app','Mobile-friendly web','iOS native (later)','Android native (later)','Marketing website','Internal tool only'].map(opt=>(
                    <button key={opt} onClick={()=>toggleArrayValue('platforms',opt)} style={{padding:'7px 13px',background:discovery.platforms.includes(opt)?'rgba(0,229,176,0.15)':'#0e0f15',border:discovery.platforms.includes(opt)?'1px solid #00e5b0':'1px solid #262731',borderRadius:20,fontSize:12.5,color:discovery.platforms.includes(opt)?'#00e5b0':'#a8a8c0',cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif"}}>{discovery.platforms.includes(opt)?'✓ ':''}{opt}</button>
                  ))}
                </div>
              </div>

              {/* Pricing model */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>💰 How will this app make money?</label>
                <input value={discovery.pricing_model} onChange={e=>setDiscovery({...discovery,pricing_model:e.target.value})} placeholder="e.g. Free for customers; restaurant pays RM99/mo. Or: subscription, marketplace fees, one-off purchase, internal use only." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:'10px 12px',outline:'none',boxSizing:'border-box' as const}}/>
              </div>

              {/* Documents upload */}
              <div style={{padding:14,background:'rgba(139,124,248,0.05)',border:'1px dashed rgba(139,124,248,0.3)',borderRadius:10}}>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#8b7cf8',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>📎 Briefs, Mockups, Reference Images</label>
                <div style={{fontSize:12,color:'#a8a9b3',marginBottom:10}}>Got a brief, sketch, screenshot, or PDF? Drop it in — JARVIS will read it.</div>
                <button onClick={()=>fileInputRef.current?.click()} style={{padding:'10px 16px',background:'#0e0f15',border:'1px solid #8b7cf8',borderRadius:8,color:'#8b7cf8',fontSize:13,cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",fontWeight:600}}>+ Attach files</button>
                {attachments.length > 0 && (
                  <div style={{marginTop:10,display:'flex',flexWrap:'wrap' as const,gap:6}}>
                    {attachments.map((att,i)=>(
                      <span key={i} style={{padding:'6px 10px',background:'#0e0f15',border:'1px solid #262731',borderRadius:7,fontSize:11,color:'#a8a8c0',display:'flex',alignItems:'center',gap:6}}>
                        {att.preview ? <img src={att.preview} alt="" style={{width:20,height:20,objectFit:'cover',borderRadius:3}}/> : '📄'} {att.name}
                        <button onClick={()=>removeAttachment(i)} style={{background:'none',border:'none',color:'#6f7079',cursor:'pointer',fontSize:13,padding:0}}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{display:'block',fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6}}>💭 Anything Else?</label>
                <textarea value={discovery.notes} onChange={e=>setDiscovery({...discovery,notes:e.target.value})} placeholder="Anything JARVIS should know — constraints, deadlines, the story behind why you're building this..." style={{width:'100%',background:'#0e0f15',border:'1px solid #262731',borderRadius:9,color:'#e8e9ed',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:14,padding:12,resize:'vertical' as const,minHeight:60,lineHeight:1.5,outline:'none',boxSizing:'border-box' as const}}/>
              </div>
            </div>

            {/* Footer with action buttons */}
            <div style={{padding:'16px 24px',borderTop:'1px solid #1c1d24',display:'flex',gap:10,position:'sticky' as const,bottom:0,background:'#0d0d1e'}}>
              <button onClick={()=>{ setShowDiscovery(false); launch() }} style={{padding:'12px 18px',background:'transparent',color:'#a8a9b3',border:'1px solid #262731',borderRadius:9,fontFamily:"'Space Mono',monospace",fontSize:12,cursor:'pointer',letterSpacing:0.5}}>Skip — JARVIS will infer</button>
              <button onClick={launch} style={{flex:1,padding:'12px 18px',background:'#00e5b0',color:'#000',border:'none',borderRadius:9,fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,cursor:'pointer',letterSpacing:0.5,boxShadow:'0 6px 20px rgba(0,229,176,0.25)'}}>Continue to clarifying questions →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── v6: FULL PROPOSAL MODAL ──
          The headline of JarvisFactory. A consulting-grade build proposal with
          architecture, phases, tech specs, costs, risks, and recommendations.
          This is the moment that makes the user feel "Claude-quality". */}
      {showProposal && finalPlan && (
        <div style={{position:'fixed' as const,inset:0,background:'rgba(5,5,13,0.88)',backdropFilter:'blur(10px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20,animation:'fadeIn 0.25s ease'}}>
          <div ref={proposalRef} style={{width:'100%',maxWidth:980,maxHeight:'94vh',overflowY:'auto' as const,background:'linear-gradient(180deg, #0e0e1d 0%, #0c0d12 100%)',border:'1px solid rgba(0,229,176,0.3)',borderRadius:18,boxShadow:'0 40px 100px rgba(0,229,176,0.08), 0 20px 60px rgba(0,0,0,0.7)'}}>

            {/* Sticky Header */}
            <div style={{padding:'18px 28px',borderBottom:'1px solid #1c1d24',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky' as const,top:0,background:'rgba(14,14,29,0.95)',backdropFilter:'blur(8px)',zIndex:2}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:'#00e5b0',boxShadow:'0 0 14px #00e5b0'}}/>
                <div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const}}>Build Proposal · Awaiting Approval</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#6f7079',letterSpacing:0.5,marginTop:2}}>JF/PROPOSAL/{Date.now().toString(36).toUpperCase().slice(-6)} · {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
                </div>
              </div>
              <button data-noexport="1" onClick={()=>setShowProposal(false)} style={{width:36,height:36,borderRadius:9,background:'transparent',border:'1px solid #262731',color:'#a8a9b3',fontSize:16,cursor:'pointer'}}>×</button>
            </div>

            {/* Body */}
            <div style={{padding:'28px 32px'}}>

              {/* Title block */}
              <div style={{marginBottom:28,paddingBottom:24,borderBottom:'1px solid #1c1d24'}}>
                <div style={{fontSize:32,fontWeight:700,color:'#e8e9ed',marginBottom:8,lineHeight:1.15}}>{finalPlan.app_name||'Your App'}</div>
                {finalPlan.tagline && <div style={{fontSize:17,color:'#a8a8c0',fontStyle:'italic',lineHeight:1.5,marginBottom:16}}>{finalPlan.tagline}</div>}
                {finalPlan.executive_summary && <div style={{fontSize:14,color:'#d0d0e0',lineHeight:1.7,maxWidth:760}}>{finalPlan.executive_summary}</div>}
              </div>

              {/* Quick stats grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:1,background:'#252538',border:'1px solid #252538',borderRadius:12,overflow:'hidden',marginBottom:28}}>
                {[
                  {label:'Timeline',value:finalPlan.est_build_time||finalPlan.est_time||'~90s',color:'#00e5b0'},
                  {label:'Investment',value:finalPlan.est_cost_credits||'1 build credit',color:'#00e5b0',sub:`~${finalPlan.est_tokens||'—'} tokens`},
                  {label:'Complexity',value:finalPlan.complexity||'Medium',color:'#e8e9ed'},
                  {label:'Tech',value:finalPlan.tech_stack?.frontend?'Next.js + Supabase':'HTML+JS',color:'#8b7cf8',sub:'Production-ready'},
                ].map((s,i)=>(
                  <div key={i} style={{padding:'14px 16px',background:'#0f0f1f'}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:9.5,color:'#6f7079',letterSpacing:1,textTransform:'uppercase' as const,marginBottom:5}}>{s.label}</div>
                    <div style={{fontSize:14,color:s.color,fontWeight:700}}>{s.value}</div>
                    {s.sub && <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#6f7079',marginTop:3}}>{s.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Problem & Solution */}
              {(finalPlan.problem || finalPlan.solution) && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:28}}>
                  {finalPlan.problem && (
                    <div style={{padding:18,background:'rgba(255,107,157,0.04)',border:'1px solid rgba(255,107,157,0.2)',borderRadius:11}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10.5,color:'#ff6b9d',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:8}}>⚠ Problem</div>
                      <div style={{fontSize:14,color:'#d0d0e0',lineHeight:1.6}}>{finalPlan.problem}</div>
                    </div>
                  )}
                  {finalPlan.solution && (
                    <div style={{padding:18,background:'rgba(0,229,176,0.04)',border:'1px solid rgba(0,229,176,0.2)',borderRadius:11}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10.5,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:8}}>✓ Solution</div>
                      <div style={{fontSize:14,color:'#d0d0e0',lineHeight:1.6}}>{finalPlan.solution}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Target users + Personas */}
              {(finalPlan.target_users || (finalPlan.personas?.length>0)) && (
                <div style={{marginBottom:28}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#8b7cf8',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:12,display:'flex',alignItems:'center',gap:7}}><span>👥</span><span>Who This Is For</span></div>
                  {finalPlan.target_users && <div style={{fontSize:14,color:'#d0d0e0',lineHeight:1.7,marginBottom:14,padding:'12px 16px',background:'rgba(139,124,248,0.05)',border:'1px solid rgba(139,124,248,0.2)',borderRadius:9}}>{finalPlan.target_users}</div>}
                  {finalPlan.personas?.length>0 && (
                    <div style={{display:'grid',gridTemplateColumns:`repeat(auto-fit, minmax(260px, 1fr))`,gap:10}}>
                      {finalPlan.personas.map((p:any,i:number)=>(
                        <div key={i} style={{padding:14,background:'#0f0f1f',border:'1px solid #1c1d24',borderRadius:9}}>
                          <div style={{fontSize:13,fontWeight:700,color:'#b9b0ff',marginBottom:5}}>{p.name}</div>
                          <div style={{fontSize:12.5,color:'#a8a8c0',lineHeight:1.6}}>{p.description}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Feature tiers */}
              <div style={{marginBottom:28}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:14,display:'flex',alignItems:'center',gap:7}}><span>📦</span><span>What You'll Get</span></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',gap:14}}>
                  {finalPlan.features_mvp?.length>0 && (
                    <div style={{padding:16,background:'rgba(0,229,176,0.04)',border:'1px solid rgba(0,229,176,0.25)',borderRadius:11}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10.5,color:'#00e5b0',letterSpacing:1.2,marginBottom:10,fontWeight:700}}>⭐ MVP — In this build</div>
                      {finalPlan.features_mvp.map((f:string,i:number)=>(
                        <div key={i} style={{fontSize:13,color:'#d0d0e0',marginBottom:7,display:'flex',gap:8,lineHeight:1.5}}><span style={{color:'#00e5b0',flexShrink:0}}>✓</span><span>{f}</span></div>
                      ))}
                    </div>
                  )}
                  {finalPlan.features_v2?.length>0 && (
                    <div style={{padding:16,background:'rgba(139,124,248,0.04)',border:'1px solid rgba(139,124,248,0.25)',borderRadius:11}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10.5,color:'#8b7cf8',letterSpacing:1.2,marginBottom:10,fontWeight:700}}>⚡ V2 — Next iteration</div>
                      {finalPlan.features_v2.map((f:string,i:number)=>(
                        <div key={i} style={{fontSize:13,color:'#a8a8c0',marginBottom:7,display:'flex',gap:8,lineHeight:1.5}}><span style={{color:'#8b7cf8',flexShrink:0}}>+</span><span>{f}</span></div>
                      ))}
                    </div>
                  )}
                  {finalPlan.features_future?.length>0 && (
                    <div style={{padding:16,background:'rgba(255,209,102,0.04)',border:'1px solid rgba(255,209,102,0.2)',borderRadius:11}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10.5,color:'#ffd166',letterSpacing:1.2,marginBottom:10,fontWeight:700}}>🚀 Future — On the roadmap</div>
                      {finalPlan.features_future.map((f:string,i:number)=>(
                        <div key={i} style={{fontSize:13,color:'#a8a8c0',marginBottom:7,display:'flex',gap:8,lineHeight:1.5}}><span style={{color:'#ffd166',flexShrink:0}}>○</span><span>{f}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Architecture / Screens diagram */}
              {finalPlan.screens?.length>0 && (
                <div style={{marginBottom:28}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:14,display:'flex',alignItems:'center',gap:7}}><span>🗺</span><span>App Architecture · Screen Map</span></div>
                  <div style={{padding:18,background:'#0f0f1f',border:'1px solid #1c1d24',borderRadius:11}}>
                    <div style={{display:'flex',flexWrap:'wrap' as const,gap:10,alignItems:'center',justifyContent:'center'}}>
                      {finalPlan.screens.map((s:any,i:number)=>(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{padding:'10px 14px',background:'#0e0f15',border:'1px solid rgba(0,229,176,0.3)',borderRadius:9,minWidth:120,textAlign:'center' as const}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#00e5b0',marginBottom:3}}>{s.name}</div>
                            <div style={{fontSize:10.5,color:'#a8a9b3',lineHeight:1.4}}>{s.purpose}</div>
                          </div>
                          {i<finalPlan.screens.length-1 && <span style={{color:'#6f7079',fontSize:14}}>→</span>}
                        </div>
                      ))}
                    </div>
                    {finalPlan.user_flows?.length>0 && (
                      <div style={{marginTop:18,paddingTop:14,borderTop:'1px solid #1c1d24'}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#6f7079',letterSpacing:1,marginBottom:8,textTransform:'uppercase' as const}}>Key User Flows</div>
                        {finalPlan.user_flows.map((f:string,i:number)=>(
                          <div key={i} style={{fontSize:12.5,color:'#a8a8c0',marginBottom:5,fontFamily:"'Space Mono',monospace"}}>· {f}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tech stack */}
              {finalPlan.tech_stack && (
                <div style={{marginBottom:28}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:14,display:'flex',alignItems:'center',gap:7}}><span>⚙</span><span>Technical Specs</span></div>
                  <div style={{padding:18,background:'#0f0f1f',border:'1px solid #1c1d24',borderRadius:11,display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:14}}>
                    {Object.entries(finalPlan.tech_stack).map(([k,v]:any)=>(
                      <div key={k}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#6f7079',letterSpacing:1,textTransform:'uppercase' as const,marginBottom:5}}>{k}</div>
                        <div style={{fontSize:13,color:'#d0d0e0',lineHeight:1.5}}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data model */}
              {finalPlan.data_model?.length>0 && (
                <div style={{marginBottom:28}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:14,display:'flex',alignItems:'center',gap:7}}><span>🗄</span><span>Data Model</span></div>
                  <div style={{padding:18,background:'#0f0f1f',border:'1px solid #1c1d24',borderRadius:11,fontFamily:"'Space Mono',monospace"}}>
                    {finalPlan.data_model.map((t:any,i:number)=>(
                      <div key={i} style={{marginBottom:i<finalPlan.data_model.length-1?12:0,paddingBottom:i<finalPlan.data_model.length-1?12:0,borderBottom:i<finalPlan.data_model.length-1?'1px solid #1c1d24':'none'}}>
                        <div style={{fontSize:13,color:'#00e5b0',fontWeight:700,marginBottom:4}}>{t.table}</div>
                        <div style={{fontSize:11.5,color:'#a8a9b3',lineHeight:1.6}}>{t.fields}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phased roadmap */}
              {finalPlan.phases?.length>0 && (
                <div style={{marginBottom:28}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:14,display:'flex',alignItems:'center',gap:7}}><span>📅</span><span>Phased Roadmap</span></div>
                  <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
                    {finalPlan.phases.map((p:any,i:number)=>(
                      <div key={i} style={{padding:16,background:'#0f0f1f',border:'1px solid #1c1d24',borderRadius:11,display:'flex',gap:14}}>
                        <div style={{width:36,height:36,borderRadius:8,background:'rgba(0,229,176,0.12)',border:'1px solid rgba(0,229,176,0.3)',display:'flex',alignItems:'center',justifyContent:'center',color:'#00e5b0',fontWeight:700,fontFamily:"'Space Mono',monospace",fontSize:13,flexShrink:0}}>{i+1}</div>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4,gap:10}}>
                            <div style={{fontSize:14,fontWeight:700,color:'#e8e9ed'}}>{p.name}</div>
                            <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',whiteSpace:'nowrap' as const}}>{p.duration}</div>
                          </div>
                          <div style={{fontSize:13,color:'#a8a8c0',lineHeight:1.6,marginBottom:p.scope?5:0}}>{p.deliverables}</div>
                          {p.scope && <div style={{fontSize:11.5,color:'#6f7079',lineHeight:1.5,fontStyle:'italic'}}>Scope: {p.scope}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risks & Mitigations */}
              {finalPlan.risks?.length>0 && (
                <div style={{marginBottom:28}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#ffd166',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:14,display:'flex',alignItems:'center',gap:7}}><span>⚠</span><span>Risks & Mitigations</span></div>
                  <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                    {finalPlan.risks.map((r:any,i:number)=>(
                      <div key={i} style={{padding:14,background:'rgba(255,209,102,0.04)',border:'1px solid rgba(255,209,102,0.2)',borderRadius:9}}>
                        <div style={{fontSize:13,color:'#ffd166',fontWeight:700,marginBottom:5}}>⚠ {r.risk}</div>
                        <div style={{fontSize:12.5,color:'#a8a8c0',lineHeight:1.6}}><span style={{color:'#00e5b0',fontFamily:"'Space Mono',monospace",fontSize:10}}>MITIGATION:</span> {r.mitigation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* JARVIS's recommendations */}
              {finalPlan.recommendations?.length>0 && (
                <div style={{marginBottom:28,padding:18,background:'rgba(139,124,248,0.05)',border:'1px solid rgba(139,124,248,0.25)',borderRadius:12}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#8b7cf8',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:12,display:'flex',alignItems:'center',gap:7}}><span>💡</span><span>JARVIS's Recommendations</span></div>
                  {finalPlan.recommendations.map((r:string,i:number)=>(
                    <div key={i} style={{fontSize:13.5,color:'#d0d0e0',marginBottom:10,display:'flex',gap:10,lineHeight:1.6}}><span style={{color:'#8b7cf8',flexShrink:0,fontWeight:700}}>{i+1}.</span><span>{r}</span></div>
                  ))}
                </div>
              )}

              {/* Approach */}
              {(finalPlan.approach || finalPlan.note) && (
                <div style={{marginBottom:14,padding:18,background:'rgba(0,229,176,0.04)',border:'1px solid rgba(0,229,176,0.25)',borderRadius:12}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:10,display:'flex',alignItems:'center',gap:7}}><span>🎯</span><span>JARVIS's Build Approach</span></div>
                  <div style={{fontSize:14,color:'#d0d0e0',lineHeight:1.7}}>{finalPlan.approach||finalPlan.note}</div>
                </div>
              )}
            </div>

            {/* Sticky Footer with action buttons */}
            <div data-noexport="1" style={{padding:'18px 28px',borderTop:'1px solid #1c1d24',display:'flex',gap:10,position:'sticky' as const,bottom:0,background:'rgba(14,14,29,0.97)',backdropFilter:'blur(8px)',flexWrap:'wrap' as const}}>
              <button onClick={()=>{ rejectPlan(); setShowProposal(false) }} style={{padding:'13px 18px',background:'transparent',color:'#a8a9b3',border:'1px solid #262731',borderRadius:10,fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:600,cursor:'pointer',letterSpacing:0.5}}>✕ Revise</button>
              <button onClick={downloadProposalPDF} disabled={isExportingPDF} style={{padding:'13px 18px',background:isExportingPDF?'#1c1d24':'rgba(139,124,248,0.12)',color:isExportingPDF?'#6f7079':'#8b7cf8',border:'1px solid rgba(139,124,248,0.4)',borderRadius:10,fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:600,cursor:isExportingPDF?'not-allowed':'pointer',letterSpacing:0.5,display:'flex',alignItems:'center',gap:7}}>
                {isExportingPDF ? (<><span style={{display:'inline-block',width:11,height:11,border:'2px solid #8b7cf8',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>Generating...</>) : (<>📄 Download PDF</>)}
              </button>
              <button onClick={()=>setShowProposal(false)} style={{padding:'13px 18px',background:'transparent',color:'#a8a9b3',border:'1px solid #262731',borderRadius:10,fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:600,cursor:'pointer',letterSpacing:0.5}}>Close</button>
              <button onClick={()=>{ approveBuild(); setShowProposal(false) }} style={{flex:1,minWidth:200,padding:'13px 20px',background:'#00e5b0',color:'#000',border:'none',borderRadius:10,fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,cursor:'pointer',letterSpacing:0.5,boxShadow:'0 6px 24px rgba(0,229,176,0.3)'}}>✓ Approve & Build it!</button>
            </div>
          </div>
        </div>
      )}

      <nav style={c.nav}>
        <div style={c.logo}>JARVISFACTORY.AI <span style={{fontSize:9,background:'rgba(139,124,248,0.2)',color:'#8b7cf8',padding:'2px 6px',borderRadius:10,marginLeft:6}}>v6</span></div>
        <div style={{display:'flex',gap:10,alignItems:'center',position:'relative' as const}}>
          {currentAppId && finalPlan?.app_name && (
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#00e5b0',padding:'4px 8px',background:'rgba(0,229,176,0.08)',border:'1px solid rgba(0,229,176,0.2)',borderRadius:6,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>📂 {finalPlan.app_name}</span>
          )}
          <button onClick={()=>setShowAppsPicker(!showAppsPicker)} style={{padding:'4px 10px',background:showAppsPicker?'rgba(139,124,248,0.15)':'transparent',border:'1px solid #1c1d24',borderRadius:6,color:'#8b7cf8',fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer'}}>📁 My Apps ({myApps.length})</button>
          <button onClick={newApp} style={{padding:'4px 10px',background:'transparent',border:'1px solid rgba(0,229,176,0.3)',borderRadius:6,color:'#00e5b0',fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer'}}>+ New App</button>
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#a8a9b3'}}>{jarvis?.jarvis_name||'JARVIS'}</span>
          {currentAppId && finalPlan && (
            <button onClick={async()=>{
              const app = myApps.find(a=>a.id===currentAppId)
              if(!app) return
              if(!app.proposal_data) {
                addLog('No proposal saved — regenerating from code...', 'info')
                try {
                  const plan = await regenerateProposalFromCode(app)
                  setFinalPlan(plan)
                } catch(err: any){ addLog('Regeneration failed: '+err.message,'err'); return }
              } else {
                setFinalPlan(app.proposal_data)
              }
              setShowProposal(true)
            }} style={{padding:'4px 10px',background:'rgba(0,229,176,0.08)',border:'1px solid rgba(0,229,176,0.25)',borderRadius:6,color:'#00e5b0',fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer',fontWeight:600}}>📋 View Proposal</button>
          )}
          <button onClick={()=>setShowBrandPanel(!showBrandPanel)} style={{padding:'4px 10px',background:showBrandPanel?'rgba(0,229,176,0.1)':'transparent',border:'1px solid #1c1d24',borderRadius:6,color:'#a8a9b3',fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer'}}>🎨 Brand</button>
          <button style={{padding:'4px 10px',background:'transparent',border:'1px solid #1c1d24',borderRadius:6,color:'#a8a9b3',fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer'}} onClick={()=>router.push('/dashboard')}>← Dashboard</button>

          {/* My Apps dropdown */}
          {showAppsPicker && (
            <div style={{position:'absolute' as const,top:'calc(100% + 8px)',right:0,width:340,maxHeight:480,overflowY:'auto' as const,background:'#0d0d1e',border:'1px solid #1c1d24',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.5)',zIndex:100,padding:8}}>
              <div style={{padding:'8px 10px',fontFamily:"'Space Mono',monospace",fontSize:10,color:'#6f7079',textTransform:'uppercase' as const,letterSpacing:1,borderBottom:'1px solid #1c1d24',marginBottom:6}}>Your Apps ({myApps.length})</div>
              {myApps.length === 0 ? (
                <div style={{padding:'24px 10px',textAlign:'center' as const,fontSize:11,color:'#6f7079'}}>No apps yet. Build your first one!</div>
              ) : myApps.map(app => (
                <div key={app.id} onClick={()=>switchToApp(app)} style={{padding:'10px 12px',marginBottom:4,background:currentAppId===app.id?'rgba(0,229,176,0.08)':'#0e0f15',border:`1px solid ${currentAppId===app.id?'rgba(0,229,176,0.3)':'#1c1d24'}`,borderRadius:8,cursor:'pointer'}}>
                  <div style={{fontSize:12,fontWeight:600,color:currentAppId===app.id?'#00e5b0':'#e8e9ed',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{currentAppId===app.id?'● ':''}{app.name}</div>
                  <div style={{fontSize:10,color:'#a8a9b3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,marginBottom:4}}>{app.description?.substring(0,60)}</div>
                  <div style={{fontSize:9,color:'#6f7079',fontFamily:"'Space Mono',monospace"}}>{new Date(app.created_at).toLocaleDateString()} · {app.tokens_used||0} tokens</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Brand Panel */}
      {showBrandPanel && (
        <div style={{background:'#0d0d1e',borderBottom:'1px solid #1c1d24',padding:'10px 18px',display:'flex',gap:20,alignItems:'center',flexShrink:0}}>
          <span style={{fontSize:11,fontFamily:"'Space Mono',monospace",color:'#a8a9b3'}}>Brand Kit</span>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,color:'#6f7079'}}>Name:</span>
            <input value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="Your brand name" style={{background:'#0e0f15',border:'1px solid #262731',borderRadius:6,color:'#e8e9ed',fontSize:11,padding:'4px 8px',outline:'none',width:140}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,color:'#6f7079'}}>Colour:</span>
            <input type="color" value={brandColour} onChange={e=>setBrandColour(e.target.value)} style={{width:32,height:24,border:'1px solid #262731',borderRadius:4,background:'none',cursor:'pointer',padding:0}}/>
            <span style={{fontSize:11,color:'#6f7079',fontFamily:"'Space Mono',monospace"}}>{brandColour}</span>
          </div>
          <span style={{fontSize:10,color:'#6f7079',fontStyle:'italic'}}>JARVIS will use these in every app it builds for you</span>
        </div>
      )}

      <div style={c.main}>
        {/* LEFT */}
        <div style={c.left}>
          <div style={c.pTitle}><span>Describe App</span><span style={c.phaseTag}>{phaseLabel}</span></div>
          <div style={c.promptArea}>
            <textarea style={c.textarea} placeholder="Describe your app..." value={prompt} onChange={e=>setPrompt(e.target.value)}/>

            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
                {attachments.map((att,i)=>(
                  <div key={i} style={{position:'relative' as const,background:'#0e0f15',border:'1px solid #262731',borderRadius:6,padding:'4px 6px',display:'flex',alignItems:'center',gap:4,maxWidth:'100%'}}>
                    {att.preview ? <img src={att.preview} alt="" style={{width:24,height:24,objectFit:'cover',borderRadius:3}}/> : <span style={{fontSize:14}}>📄</span>}
                    <span style={{fontSize:10,color:'#a8a9b3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,maxWidth:80}}>{att.name}</span>
                    <button onClick={()=>removeAttachment(i)} style={{background:'none',border:'none',color:'#6f7079',cursor:'pointer',fontSize:11,padding:0,marginLeft:2}}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>fileInputRef.current?.click()} style={{flex:1,padding:'6px 0',background:'#0e0f15',border:'1px dashed #262731',borderRadius:6,color:'#a8a9b3',fontSize:10,cursor:'pointer',fontFamily:"'Space Mono',monospace"}}>
                📎 Attach reference
              </button>
              {attachments.length > 0 && <button onClick={()=>setAttachments([])} style={{padding:'6px 8px',background:'transparent',border:'1px solid #262731',borderRadius:6,color:'#6f7079',fontSize:10,cursor:'pointer'}}>Clear</button>}
            </div>

            <div style={{fontSize:9,color:'#6f7079',fontFamily:"'Space Mono',monospace",textTransform:'uppercase' as const,letterSpacing:1}}>Quick starts</div>
            {['DRE Coffee loyalty app with points & referral','Brainy Bunch student progress tracker','Muslim ibadah daily tracker with streaks','Staff birthday gifts manager'].map(p=>(
              <button key={p} onClick={()=>setPrompt(p)} style={{padding:'7px 9px',background:'#0e0f15',border:'1px solid #1c1d24',borderRadius:6,color:'#a8a9b3',fontSize:10,textAlign:'left' as const,cursor:'pointer',lineHeight:1.4}}>{p}</button>
            ))}

            <div style={{background:'#0d0d1e',border:'1px solid #1c1d24',borderRadius:8,padding:10}}>
              <div style={{fontSize:9,fontFamily:"'Space Mono',monospace",color:'#6f7079',textTransform:'uppercase' as const,letterSpacing:1,marginBottom:6}}>Metrics</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#a8a9b3',marginBottom:3}}><span>Tokens</span><span style={{color:'#e8e9ed'}}>{tokens}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#a8a9b3',marginBottom:3}}><span>Build time</span><span style={{color:'#e8e9ed'}}>{buildTime}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#a8a9b3'}}><span>Attachments</span><span style={{color:attachments.length>0?'#00e5b0':'#e8e9ed'}}>{attachments.length}</span></div>
            </div>
          </div>
          <button style={{...c.launchBtn,opacity:isWorking?0.5:1}} onClick={()=>{ if(!prompt.trim()) return; setShowDiscovery(true) }} disabled={isWorking}>
            <span>⚡</span>{phase==='done'?'Rebuild':'Launch '+(jarvis?.jarvis_name||'JARVIS')}
          </button>
          {isWorking && builtCode && (
            <button onClick={()=>{setPhase('done');setFeedbackPhase('idle');setIsFeedbackLoading(false);setPendingFeedback('');setDiagnosisResult(null);addLog('Reset: unstuck.','ok');addChat('🔄 Stuck state cleared. You can give feedback again.')}} style={{margin:'-4px 10px 10px',padding:8,background:'rgba(255,107,157,0.1)',color:'#ff6b9d',border:'1px solid rgba(255,107,157,0.3)',borderRadius:8,fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer'}}>
              🔄 Stuck? Click to reset
            </button>
          )}
          {builtCode && (
            <div style={{margin:'-4px 10px 10px',display:'flex',gap:6}}>
              <button onClick={download} style={{flex:1,padding:8,background:'#0e0f15',color:'#a8a9b3',border:'1px solid #1c1d24',borderRadius:8,fontFamily:"'Space Mono',monospace",fontSize:10,cursor:'pointer'}}>⬇ Download</button>
              <button onClick={()=>runQA()} disabled={isRunningQA} style={{flex:1,padding:8,background:isRunningQA?'#1c1d24':qaReport?.certified?'rgba(0,229,176,0.15)':'rgba(255,209,102,0.15)',color:isRunningQA?'#6f7079':qaReport?.certified?'#00e5b0':'#ffd166',border:`1px solid ${qaReport?.certified?'rgba(0,229,176,0.3)':'rgba(255,209,102,0.3)'}`,borderRadius:8,fontFamily:"'Space Mono',monospace",fontSize:10,cursor:isRunningQA?'not-allowed':'pointer'}}>
                {isRunningQA?'QA...':`🔬 QA ${qaReport?qaReport.score+'/100':''}`}
              </button>
            </div>
          )}
        </div>

        {/* CENTER */}
        <div style={c.center}>
          <div style={c.tabs}>
            <div style={{...c.tab,color:activeTab==='code'?'#00e5b0':'#6f7079',borderBottomColor:activeTab==='code'?'#00e5b0':'transparent'}} onClick={()=>setActiveTab('code')}>index.html</div>
            <div style={{...c.tab,color:activeTab==='preview'?'#00e5b0':'#6f7079',borderBottomColor:activeTab==='preview'?'#00e5b0':'transparent'}} onClick={()=>setActiveTab('preview')}>⬡ Live Preview</div>
          </div>
          <div style={{flex:1,overflow:'auto',display:activeTab==='code'?'flex':'none',flexDirection:'column' as const,background:'#06070b',padding:14}}>
            {!builtCode ? (
              <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',height:'100%',gap:12,color:'#6f7079'}}>
                <div style={{fontSize:36,opacity:0.2}}>⬡</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:12}}>// Waiting for instructions</div>
                <div style={{fontSize:11,textAlign:'center' as const,maxWidth:260,lineHeight:1.7,color:'#6f7079'}}>Attach reference images, set your brand kit, then describe your app. JARVIS will plan first — then build only after you approve.</div>
              </div>
            ) : <pre id="codeDisplay" style={{fontFamily:"'Space Mono',monospace",fontSize:11,lineHeight:1.8,color:'#7ec8a0',whiteSpace:'pre-wrap' as const,wordBreak:'break-all' as const}}>{builtCode}</pre>}
          </div>
          <div style={{flex:1,overflow:'hidden',display:activeTab==='preview'?'flex':'none',flexDirection:'column' as const,background:'#fff'}}>
            {!builtCode ? (
              <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',height:'100%',background:'#0c0d12',gap:10,color:'#6f7079'}}>
                <div style={{fontSize:36,opacity:0.2}}>◻</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:12}}>Preview loads after build</div>
              </div>
            ) : <iframe id="previewFrame" style={{flex:1,border:'none',width:'100%',height:'100%'}} srcDoc={builtCode}/>}
          </div>
          {/* TERMINAL */}
          <div style={c.term}>
            <div style={c.termH}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{display:'flex',gap:4}}><div style={{width:10,height:10,borderRadius:'50%',background:'#ff5f57'}}/><div style={{width:10,height:10,borderRadius:'50%',background:'#febc2e'}}/><div style={{width:10,height:10,borderRadius:'50%',background:'#28c840'}}/></div>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#6f7079',letterSpacing:1}}>TERMINAL</span>
              </div>
              <button onClick={()=>setLogs([])} style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#6f7079',background:'none',border:'none',cursor:'pointer'}}>Clear</button>
            </div>
            <div style={c.termB} ref={termRef}>
              {logs.map((l,i)=>(
                <div key={i}><span style={{color:'#6f7079',marginRight:10}}>{l.t}</span><span style={{color:{info:'#00e5b0',ok:'#06d6a0',err:'#ff4d6d',warn:'#ffd166',build:'#8b7cf8'}[l.type]||'#00e5b0'}}>{l.msg}</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: JARVIS CHAT + FEEDBACK */}
        <div style={c.right}>
          <div style={c.chatH}>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:'#a8a9b3'}}>🤖 <span style={{color:'#00e5b0',fontWeight:700}}>{jarvis?.jarvis_name||'JARVIS'}</span></span>
            <span style={{fontSize:10,color:'#6f7079',fontFamily:"'Space Mono',monospace",letterSpacing:1,textTransform:'uppercase' as const}}>{phase}</span>
          </div>
          <div style={c.chatBody} ref={chatRef}>
            {/* Initial greeting */}
            {jarvisMsg && (
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{width:32,height:32,borderRadius:8,background:'rgba(0,229,176,0.12)',color:'#00e5b0',border:'1px solid rgba(0,229,176,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>J</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:10.5,fontFamily:"'Space Mono',monospace",color:'#6f7079',marginBottom:5,letterSpacing:0.5}}>JARVIS · Now</div><div style={{...c.bubble,borderColor:'rgba(0,229,176,0.15)'}} dangerouslySetInnerHTML={{__html:jarvisMsg}}/></div>
              </div>
            )}
            {/* Chat history */}
            {chatLog.map((msg,i)=>(
              <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{width:32,height:32,borderRadius:8,background:msg.isUser?'rgba(139,124,248,0.12)':'rgba(0,229,176,0.12)',color:msg.isUser?'#8b7cf8':'#00e5b0',border:`1px solid ${msg.isUser?'rgba(139,124,248,0.3)':'rgba(0,229,176,0.3)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>{msg.isUser?'U':'J'}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:10.5,fontFamily:"'Space Mono',monospace",color:'#6f7079',marginBottom:5,letterSpacing:0.5}}>{msg.isUser?'You':'JARVIS'} · Now</div><div style={{...c.bubble,borderColor:msg.isUser?'rgba(139,124,248,0.2)':'rgba(0,229,176,0.15)'}} dangerouslySetInnerHTML={{__html:msg.html}}/></div>
              </div>
            ))}
            {/* Questions */}
            {phase==='questioning' && questions.length>0 && (
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{width:32,height:32,borderRadius:8,background:'rgba(0,229,176,0.12)',color:'#00e5b0',border:'1px solid rgba(0,229,176,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>J</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10.5,fontFamily:"'Space Mono',monospace",color:'#6f7079',marginBottom:5,letterSpacing:0.5}}>JARVIS · Now</div>
                  <div style={{background:'#1e1e30',border:'1px solid rgba(255,209,102,0.25)',borderRadius:12,padding:16}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'#ffd166',marginBottom:14,textTransform:'uppercase' as const,letterSpacing:1.5,display:'flex',alignItems:'center',gap:7}}><span>🔍</span><span>Quick Discovery — pick the closest fit</span></div>
                    {questions.map((q:any,i:number)=>(
                      <div key={i} style={{marginBottom:16}}>
                        <div style={{fontSize:14,color:'#e8e9ed',marginBottom:9,lineHeight:1.5,fontWeight:500}}>{i+1}. {q.q}</div>
                        <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
                          {(Array.isArray(q?.options) ? q.options : ['Yes','No','Not sure']).map((opt:string)=>(
                            <button key={opt} onClick={()=>selectAnswer(i,opt)} style={{padding:'7px 13px',background:qAnswers[i]===opt?'rgba(139,124,248,0.22)':'#0e0f15',border:qAnswers[i]===opt?'1px solid #8b7cf8':'1px solid #262731',borderRadius:20,fontSize:12.5,color:qAnswers[i]===opt?'#b9b0ff':'#a8a8c0',cursor:'pointer',fontFamily:"'Inter','DM Sans',sans-serif",transition:'all 0.15s',fontWeight:qAnswers[i]===opt?600:400}}>{opt}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button onClick={submitAnswers} disabled={!allAnswered} style={{width:'100%',marginTop:8,padding:12,background:allAnswered?'#8b7cf8':'#262731',color:allAnswered?'#fff':'#6f7079',border:'none',borderRadius:9,fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,cursor:allAnswered?'pointer':'not-allowed',letterSpacing:0.5,boxShadow:allAnswered?'0 4px 16px rgba(139,124,248,0.25)':'none'}}>
                      {allAnswered?'Generate Build Proposal →':`Answer all (${Object.keys(qAnswers).length}/${questions.length})`}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* ── v6: BUILD PROPOSAL — chat reminder ──
                The full proposal lives in a modal (auto-opens when ready).
                This inline card is the "re-open proposal" pointer in chat history. */}
            {phase==='approving' && finalPlan && !showProposal && (
              <div style={{display:'flex',gap:10,alignItems:'flex-start',width:'100%'}}>
                <div style={{width:32,height:32,borderRadius:8,background:'rgba(0,229,176,0.12)',color:'#00e5b0',border:'1px solid rgba(0,229,176,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>J</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10.5,fontFamily:"'Space Mono',monospace",color:'#6f7079',marginBottom:5,letterSpacing:0.5}}>JARVIS · Now</div>
                  <div onClick={()=>setShowProposal(true)} style={{cursor:'pointer',padding:18,background:'linear-gradient(135deg, rgba(0,229,176,0.08), rgba(139,124,248,0.05))',border:'1px solid rgba(0,229,176,0.3)',borderRadius:12,transition:'all 0.15s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#00e5b0'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(0,229,176,0.3)'}}>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:10.5,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:8}}>📋 Build Proposal · Ready</div>
                    <div style={{fontSize:17,fontWeight:700,color:'#e8e9ed',marginBottom:6,lineHeight:1.3}}>{finalPlan.app_name||'Your App'}</div>
                    <div style={{fontSize:13,color:'#a8a8c0',lineHeight:1.5,marginBottom:12}}>{finalPlan.tagline||finalPlan.summary||''}</div>
                    <div style={{display:'flex',gap:14,alignItems:'center',fontSize:12,color:'#a8a9b3',marginBottom:12}}>
                      <span><span style={{color:'#6f7079'}}>Time:</span> <strong style={{color:'#e8e9ed'}}>{finalPlan.est_build_time||finalPlan.est_time||'~90s'}</strong></span>
                      <span><span style={{color:'#6f7079'}}>Cost:</span> <strong style={{color:'#00e5b0'}}>{finalPlan.est_cost_credits||'1 credit'}</strong></span>
                      <span><span style={{color:'#6f7079'}}>Complexity:</span> <strong style={{color:'#e8e9ed'}}>{finalPlan.complexity||'Medium'}</strong></span>
                    </div>
                    <button style={{padding:'10px 16px',background:'#00e5b0',color:'#000',border:'none',borderRadius:8,fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,cursor:'pointer',letterSpacing:0.5}}>📖 Read full proposal →</button>
                  </div>
                </div>
              </div>
            )}
            {/* ── Legacy inline card (preserved but never rendered now that modal handles it) ── */}
            {false && phase==='approving' && finalPlan && (
              <div style={{display:'flex',gap:8,alignItems:'flex-start',width:'100%'}}>
                <div style={{width:28,height:28,borderRadius:7,background:'rgba(0,229,176,0.12)',color:'#00e5b0',border:'1px solid rgba(0,229,176,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>J</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:9,fontFamily:"'Space Mono',monospace",color:'#6f7079',marginBottom:6}}>
                    {jarvis?.jarvis_name||'JARVIS'} · BUILD PROPOSAL · {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                  </div>
                  <div style={{background:'linear-gradient(180deg, #15152a 0%, #0f0f1f 100%)',border:'1px solid rgba(0,229,176,0.25)',borderRadius:14,overflow:'hidden',boxShadow:'0 12px 40px rgba(0,229,176,0.06)'}}>
                    {/* Header banner */}
                    <div style={{padding:'14px 18px',borderBottom:'1px solid rgba(0,229,176,0.15)',background:'rgba(0,229,176,0.04)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:'#00e5b0',boxShadow:'0 0 12px #00e5b0'}}/>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const}}>Plan Ready · Awaiting Your Approval</span>
                      </div>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#6f7079',letterSpacing:1}}>JF/PROPOSAL</span>
                    </div>

                    {/* Title block */}
                    <div style={{padding:'18px 18px 14px'}}>
                      <div style={{fontSize:22,fontWeight:700,color:'#e8e9ed',marginBottom:6,lineHeight:1.2}}>{finalPlan.app_name||'Your App'}</div>
                      {finalPlan.tagline && (
                        <div style={{fontSize:13,color:'#a8a8c0',marginBottom:10,lineHeight:1.5,fontStyle:'italic'}}>{finalPlan.tagline}</div>
                      )}
                      {finalPlan.summary && (
                        <div style={{fontSize:12,color:'#a8a9b3',lineHeight:1.6}}>{finalPlan.summary}</div>
                      )}
                      {finalPlan.target_users && (
                        <div style={{marginTop:10,padding:'8px 10px',background:'rgba(139,124,248,0.06)',border:'1px solid rgba(139,124,248,0.18)',borderRadius:7,fontSize:11,color:'#b9b0ff'}}>
                          <span style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#8b7cf8',letterSpacing:1,marginRight:6}}>FOR:</span>{finalPlan.target_users}
                        </div>
                      )}
                    </div>

                    {/* Stats row */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:1,background:'#252538',borderTop:'1px solid #252538',borderBottom:'1px solid #252538'}}>
                      <div style={{padding:'12px 14px',background:'#15152a'}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#6f7079',letterSpacing:1,marginBottom:4,textTransform:'uppercase' as const}}>Timeline</div>
                        <div style={{fontSize:13,color:'#e8e9ed',fontWeight:600}}>{finalPlan.est_time||'~90 seconds'}</div>
                      </div>
                      <div style={{padding:'12px 14px',background:'#15152a'}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#6f7079',letterSpacing:1,marginBottom:4,textTransform:'uppercase' as const}}>Investment</div>
                        <div style={{fontSize:13,color:'#00e5b0',fontWeight:600}}>1 build credit</div>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#6f7079',marginTop:2}}>~{finalPlan.est_tokens||'—'} tokens</div>
                      </div>
                      <div style={{padding:'12px 14px',background:'#15152a'}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:'#6f7079',letterSpacing:1,marginBottom:4,textTransform:'uppercase' as const}}>Complexity</div>
                        <div style={{fontSize:13,color:'#e8e9ed',fontWeight:600}}>{finalPlan.complexity||'Medium'}</div>
                      </div>
                    </div>

                    {/* Features */}
                    <div style={{padding:'14px 18px'}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#00e5b0',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
                        <span>✓</span><span>What's Included</span>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:7}}>
                        {(finalPlan.features||[]).map((f:string,i:number)=>(
                          <div key={i} style={{fontSize:12,color:'#d0d0e0',display:'flex',gap:9,alignItems:'flex-start',lineHeight:1.5}}>
                            <span style={{color:'#00e5b0',fontWeight:700,flexShrink:0,marginTop:1}}>✓</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Approach */}
                    {(finalPlan.approach||finalPlan.note) && (
                      <div style={{padding:'12px 18px 14px',borderTop:'1px solid #252538',background:'rgba(139,124,248,0.03)'}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:'#8b7cf8',letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
                          <span>💡</span><span>JARVIS's Approach</span>
                        </div>
                        <div style={{fontSize:11,color:'#a8a8c0',lineHeight:1.6}}>{finalPlan.approach||finalPlan.note}</div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{padding:'14px 18px 16px',borderTop:'1px solid #252538',display:'flex',gap:8}}>
                      <button onClick={rejectPlan} style={{flex:'0 0 auto',padding:'11px 16px',background:'transparent',color:'#a8a9b3',border:'1px solid #262731',borderRadius:9,fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:600,cursor:'pointer',letterSpacing:0.5,transition:'all 0.15s'}} onMouseEnter={e=>{(e.target as HTMLElement).style.borderColor='#ff6b9d';(e.target as HTMLElement).style.color='#ff6b9d'}} onMouseLeave={e=>{(e.target as HTMLElement).style.borderColor='#262731';(e.target as HTMLElement).style.color='#a8a9b3'}}>✕ Hold on, let me revise</button>
                      <button onClick={approveBuild} style={{flex:1,padding:'11px 16px',background:'#00e5b0',color:'#000',border:'none',borderRadius:9,fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:0.5,boxShadow:'0 6px 20px rgba(0,229,176,0.25)',transition:'all 0.15s'}} onMouseEnter={e=>{(e.target as HTMLElement).style.background='#00ffcc';(e.target as HTMLElement).style.transform='translateY(-1px)'}} onMouseLeave={e=>{(e.target as HTMLElement).style.background='#00e5b0';(e.target as HTMLElement).style.transform='translateY(0)'}}>✓ Looks great — Build it!</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* ── v7: MULTI-AGENT BUILD PROGRESS PANEL ──
                Shows the team working live: Architect → Builder → QA, each with status. */}
            {(phase==='building'||phase==='iterating') && (
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{width:32,height:32,borderRadius:8,background:'rgba(0,229,176,0.12)',color:'#00e5b0',border:'1px solid rgba(0,229,176,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>J</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10.5,fontFamily:"'Space Mono',monospace",color:'#6f7079',marginBottom:5,letterSpacing:0.5}}>{jarvis?.jarvis_name||'JARVIS'} · BUILD IN PROGRESS · {buildTime}</div>
                  {phase==='iterating' ? (
                    <div style={{...c.bubble,borderColor:'rgba(0,229,176,0.15)'}}>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <span style={{width:7,height:7,borderRadius:'50%',background:'#00e5b0',display:'inline-block',animation:'bob 1s infinite'}}/>
                        <span style={{width:7,height:7,borderRadius:'50%',background:'#8b7cf8',display:'inline-block',animation:'bob 1s 0.15s infinite'}}/>
                        <span style={{width:7,height:7,borderRadius:'50%',background:'#ff6b9d',display:'inline-block',animation:'bob 1s 0.3s infinite'}}/>
                        <span style={{marginLeft:10,fontSize:13.5,color:'#a8a8c0'}}>Updating your app…</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{padding:14,background:'#15152a',border:'1px solid rgba(0,229,176,0.2)',borderRadius:11,display:'flex',flexDirection:'column' as const,gap:9}}>
                      {[
                        { id: 'architect', emoji: '🗺', name: 'Architect', desc: 'Designing data model + components' },
                        { id: 'designer',  emoji: '🎨', name: 'Designer',  desc: 'Defining colours, fonts, components' },
                        { id: 'builder',   emoji: '🔨', name: 'Builder',   desc: 'Writing the code from spec' },
                        { id: 'qa',        emoji: '🔍', name: 'QA Engineer', desc: 'Auditing the build' },
                      ].map(a => {
                        const st = agentStatus[a.id]?.status || 'pending'
                        const note = agentStatus[a.id]?.note
                        const palette = {
                          pending: { bg:'#1a1a2e', border:'#262731', dot:'#6f7079', label:'#6f7079', name:'#a8a9b3' },
                          working: { bg:'rgba(0,229,176,0.06)', border:'rgba(0,229,176,0.4)', dot:'#00e5b0', label:'#00e5b0', name:'#e8e9ed' },
                          done:    { bg:'rgba(0,229,176,0.04)', border:'rgba(0,229,176,0.18)', dot:'#00e5b0', label:'#00e5b0', name:'#a8a8c0' },
                          failed:  { bg:'rgba(255,107,157,0.06)', border:'rgba(255,107,157,0.35)', dot:'#ff6b9d', label:'#ff6b9d', name:'#e8e9ed' },
                        }[st]
                        return (
                          <div key={a.id} style={{display:'flex',gap:11,alignItems:'center',padding:'9px 11px',background:palette.bg,border:`1px solid ${palette.border}`,borderRadius:9}}>
                            <div style={{fontSize:18,opacity:st==='pending'?0.4:1}}>{a.emoji}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                                <div style={{fontSize:13,fontWeight:600,color:palette.name}}>{a.name}</div>
                                <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:palette.label,letterSpacing:1,textTransform:'uppercase' as const,whiteSpace:'nowrap' as const}}>
                                  {st==='pending' && '○ Waiting'}
                                  {st==='working' && '◉ Working'}
                                  {st==='done' && '✓ Done'}
                                  {st==='failed' && '✕ Failed'}
                                </div>
                              </div>
                              <div style={{fontSize:11.5,color:'#a8a9b3',marginTop:1.5,lineHeight:1.4}}>
                                {note || a.desc}
                              </div>
                            </div>
                            {st==='working' && (
                              <div style={{display:'flex',gap:3,alignItems:'center'}}>
                                <span style={{width:5,height:5,borderRadius:'50%',background:'#00e5b0',animation:'bob 1s infinite'}}/>
                                <span style={{width:5,height:5,borderRadius:'50%',background:'#00e5b0',animation:'bob 1s 0.15s infinite'}}/>
                                <span style={{width:5,height:5,borderRadius:'50%',background:'#00e5b0',animation:'bob 1s 0.3s infinite'}}/>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SPRINT 1: FEEDBACK INPUT ── */}
          <div style={c.feedbackArea}>
            <div style={{fontSize:9,fontFamily:"'Space Mono',monospace",color:builtCode&&!isWorking?'#8b7cf8':'#6f7079',marginBottom:5,letterSpacing:0.5}}>
              {builtCode && !isWorking ? '💬 JARVIS IS LISTENING — TYPE FEEDBACK TO IMPROVE THE APP' : '⚡ BUILD AN APP FIRST — THEN GIVE FEEDBACK HERE'}
            </div>
            <textarea
              style={{...c.feedbackInput, opacity: builtCode&&!isWorking?1:0.35, borderColor: builtCode&&!isWorking?'rgba(139,124,248,0.4)':'#262731'}}
              placeholder={builtCode ? 'e.g. "Make the header dark blue", "Add a search bar", "Change to DRE Coffee branding"...' : 'Build an app first, then give feedback here...'}
              value={feedbackInput}
              onChange={e=>setFeedbackInput(e.target.value)}
              disabled={!builtCode||isWorking||feedbackPhase!=='idle'}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&builtCode&&!isWorking){e.preventDefault();sendFeedback()}}}
            />
            <div style={c.feedbackRow}>
              <button onClick={()=>fileInputRef.current?.click()} style={c.attachBtn} title="Attach reference image">📎</button>
              <button
                onClick={async()=>{
                  if(!builtCode||!user) return
                  if(currentAppId) {
                    await supabase.from('apps').update({
                      html_code: builtCode,
                      description: (finalPlan?.summary||'') + ' (saved ' + new Date().toLocaleTimeString() + ')'
                    }).eq('id', currentAppId)
                    addLog('App updated.','ok')
                    addChat('✅ App updated in your dashboard!')
                  } else {
                    const { data: newRow } = await supabase.from('apps').insert({
                      user_id:user.id,
                      name:(finalPlan?.app_name||'My App')+' (saved)',
                      description:'Manually saved',
                      html_code:builtCode,
                      tokens_used:0,
                      build_time:'0',
                      proposal_data: finalPlan,  // v6: persist proposal
                      created_at:new Date().toISOString()
                    }).select().single()
                    if(newRow) {
                      setCurrentAppId(newRow.id)
                      localStorage.setItem('jf_last_app_id', newRow.id)
                      setMyApps(prev => [newRow, ...prev])
                    }
                    addLog('App saved to dashboard.','ok')
                    addChat('✅ App saved to your dashboard!')
                  }
                }}
                disabled={!builtCode}
                style={{padding:'6px 10px',background:'transparent',border:'1px solid #262731',borderRadius:6,color:builtCode?'#00e5b0':'#6f7079',fontSize:10,cursor:builtCode?'pointer':'not-allowed',fontFamily:"'Space Mono',monospace",flexShrink:0}}
              >💾 Save</button>
              <button
                onClick={sendFeedback}
                disabled={!feedbackInput.trim()||!builtCode||isWorking||feedbackPhase!=='idle'}
                style={{...c.sendBtn, flex:1, background:(!feedbackInput.trim()||!builtCode||isWorking)?'#262731':'#8b7cf8', color:(!feedbackInput.trim()||!builtCode||isWorking)?'#6f7079':'#fff'}}
              >
                {isFeedbackLoading?'Updating...':'Send ↑'}
              </button>
            </div>
          </div>        </div>
      </div>
    </div>
  )
}
