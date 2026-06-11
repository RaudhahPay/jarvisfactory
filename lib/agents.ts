// ============================================================
// JARVISFACTORY v7 — Multi-agent build pipeline
// ============================================================
// JARVIS the Lead Engineer (the user-facing one) coordinates a small team
// of specialist agents:
//
//   Architect  → designs data model, components, flows
//   Builder    → writes the actual HTML following the design
//   QA         → audits the build against the proposal
//
// Each agent is a system prompt + an input contract + an output parser.
// The frontend orchestrates them in sequence and reports progress to the user.
// ============================================================

export type AgentId = 'architect' | 'designer' | 'builder' | 'qa'

export interface AgentDefinition {
  id: AgentId
  name: string         // user-facing label, e.g. "Architect"
  emoji: string        // shown in the progress UI
  description: string  // 1-line tagline shown in the progress UI
  // System prompt is a function so we can vary it by context (industry, brand, etc.)
  buildSystemPrompt: (ctx: AgentContext) => string
  buildUserMessage: (ctx: AgentContext) => string
  // Some agents return JSON, some return raw text (HTML for the Builder)
  outputFormat: 'json' | 'html'
  // Recommended max_tokens for this agent's output
  maxTokens: number
  // v7.9: Per-agent model. Architect + QA on Haiku (5-10x faster, planning/checking
  // tasks don't need Sonnet's depth). Builder stays on Sonnet (code generation).
  model?: string
}

export interface AgentContext {
  // The user-facing JARVIS name (e.g. "ARIA" if user renamed it)
  jarvisName: string
  // Optional industry/role from jarvis_profiles
  industry?: string
  // The signed-off proposal — the contract every agent works from
  proposal: any
  // Brand kit
  brandName?: string
  brandColour?: string
  // Design spec produced by the Architect (consumed by Designer + Builder + QA)
  designSpec?: any
  // v9.5: Design SYSTEM produced by the Designer (consumed by Builder)
  designSystem?: any
  // The HTML produced by the Builder (consumed by QA)
  builtCode?: string
  // For builder retry passes: the QA report from the previous attempt
  previousQA?: any
  // Reference attachments
  attachments?: { name: string; type: string }[]
  // v9: Pre-formatted JARVIS memory (forbidden patterns, required practices, recipes)
  // injected into every agent's system prompt so JARVIS gets smarter over time.
  lessons?: string
}

// ──────────────────────────────────────────────────────────────
// AGENT 1 — ARCHITECT
// Reads the proposal, produces a design_spec the Builder follows.
// ──────────────────────────────────────────────────────────────
export const ARCHITECT: AgentDefinition = {
  id: 'architect',
  name: 'Architect',
  emoji: '🗺',
  description: 'Designing data model, components and flows',
  outputFormat: 'json',
  maxTokens: 20000, // v9.3: bumped from 12k — BrainyBunch-class apps were truncating at ~43k chars
  model: 'claude-haiku-4-5-20251001', // v7.9: planning is Haiku-friendly, ~5-10x faster
  buildSystemPrompt: (ctx) => `${ctx.lessons || ''}You are the ARCHITECT on ${ctx.jarvisName}'s build team.
Your job: turn the approved proposal into a precise DESIGN SPEC the Builder will follow without guesswork.
Think like a senior software engineer. Be specific. Avoid jargon the Builder doesn't need.

═══ BE CONCISE — your output is JSON, brevity matters ═══
- Every string field: ONE sentence, under 120 chars. Never paragraphs.
- Components: 6-10 max (group related screens into one component if needed).
- data_model: 4-8 tables max.
- build_modules: 4-8 modules max (1 foundation + 1 auth + 2-5 feature groups + 1 polish).
- flows: 4-6 max.
- If the proposal lists many features, GROUP them into module-sized chunks. Do not enumerate every detail.

Return ONLY valid JSON (no markdown fences, no commentary). Use this EXACT structure:

{
  "components": [
    {
      "id": "screen_login",
      "name": "Login / Signup screen",
      "purpose": "First touchpoint — user signs in or creates an account",
      "elements": [
        "Logo + brand name at top",
        "Tab toggle: Login | Signup",
        "Login form: email, password, sign-in button",
        "Signup form: full_name, email, password, role-select dropdown, signup button",
        "Error toast area (top-right)"
      ],
      "interactions": [
        "Login button → Jarvis.login(email, password) → if success, route to dashboard",
        "Signup button → Jarvis.signup(email, password, full_name, role) → if success, route to dashboard"
      ],
      "shown_when": "User is not logged in"
    }
  ],
  "data_model": [
    {
      "table": "items",
      "purpose": "Stores the main records for this app",
      "fields": "id, user_id, name, value, created_at",
      "operations": ["create via Jarvis.saveData('items', record_key, value)", "list via Jarvis.loadData('items')", "delete via Jarvis.deleteData('items', record_key)"]
    }
  ],
  "state_model": [
    {"name": "currentUser", "source": "Jarvis.getCurrentUser()", "scope": "global"},
    {"name": "items", "source": "Jarvis.loadData('items')", "scope": "dashboard screen"}
  ],
  "flows": [
    "FIRST RUN: User lands on Login screen → clicks Signup tab → fills form → submits → routed to Dashboard",
    "RETURNING: User lands → if Jarvis.isLoggedIn() show Dashboard immediately → else show Login"
  ],
  "edge_cases": [
    "Empty state: show friendly onboarding card with 'Add your first X' CTA, never blank screen",
    "Network error: catch errors, show toast 'Couldn't reach server, please retry'",
    "Invalid login: show specific 'Email or password incorrect' message, not generic 'Error'",
    "Form validation: required fields, min lengths, email format — block submit + show inline messages"
  ],
  "design_principles": [
    "Mobile-first responsive (single column on phones, multi-column on desktop)",
    "Use the brand colour as primary accent only — keep most surfaces neutral",
    "Smooth transitions on screen changes (fade + slight slide)",
    "All buttons must do something — no dead clicks"
  ],
  "navigation": "How does user move between screens? E.g. 'Top nav bar with logo + role-aware menu items + logout'",
  "build_priorities": [
    "1. Get auth working first (signup, login, logout)",
    "2. Then build dashboard skeleton with empty state",
    "3. Then add CRUD for primary table",
    "4. Then secondary features",
    "5. Polish: animations, empty states, error states"
  ],
  "build_modules": [
    {
      "id": "foundation",
      "name": "Foundation",
      "purpose": "DOCTYPE, head with title and base CSS, body shell with all empty screen containers, init script with helpers (showOnly, toast, api). No user-facing content yet.",
      "deps": []
    },
    {
      "id": "auth",
      "name": "Authentication",
      "purpose": "Login + signup forms wired to Jarvis.signup/login. Logout button wired to Jarvis.logout. Init checks Jarvis.isLoggedIn and routes accordingly. Try/catch + toast on errors. 5-second loader timeout fallback.",
      "deps": ["foundation"]
    },
    {
      "id": "dashboard_shell",
      "name": "Dashboard shell",
      "purpose": "Role-aware nav. Empty dashboard with onboarding card. Logout button.",
      "deps": ["auth"]
    },
    {
      "id": "feature_primary",
      "name": "Primary feature (replace with actual feature name)",
      "purpose": "First MVP feature. Wires to Jarvis.saveData/loadData. Empty state when no data.",
      "deps": ["dashboard_shell"]
    },
    {
      "id": "polish",
      "name": "Polish",
      "purpose": "Animations, error toasts, mobile responsiveness, empty-state copy.",
      "deps": ["feature_primary"]
    }
  ],
  "file_tree": [
    {"path": "index.html",              "purpose": "Entry point — DOCTYPE, head with Google Fonts import + <link rel='stylesheet' href='styles/main.css'>, body with screen containers, toast div, <script src='scripts/app.js'></script>"},
    {"path": "styles/main.css",         "purpose": "Design-system CSS variables (from Designer), base layout, component classes (.btn, .card, .input, .toast), responsive media queries"},
    {"path": "scripts/app.js",          "purpose": "init() with 5s loader fallback, showOnly() router, toast() helper, api() fetch wrapper, top-level event wiring"},
    {"path": "scripts/auth.js",         "purpose": "doSignup, doLogin, doLogout — wired to Jarvis.signup/login/logout. Try/catch + toast on every await."},
    {"path": "scripts/dashboard.js",    "purpose": "loadDashboard() — gets current user, branches by role, renders feature views. CRUD wiring to Jarvis.saveData/loadData."}
  ],
  "open_questions": []
}

═══ FILE_TREE RULES (v11 / Phase 7.1 multi-file mode) ═══
- file_tree describes the multi-file project layout the Builder will create.
- For SIMPLE apps (1-3 screens, no auth): 2-3 files — index.html + styles/main.css + scripts/app.js.
- For APPS WITH AUTH: add scripts/auth.js (signup/login/logout, all wired to Jarvis API).
- For APPS WITH MULTIPLE MAJOR FEATURES: one scripts/<feature>.js per feature (scripts/dashboard.js, scripts/tasks.js, scripts/admin.js, etc.).
- Keep total file count to 3-8 files. Don't over-split.
- Every file in file_tree must have a clear single-sentence "purpose" describing what it contains.
- Every <script src="..."> and <link href="..."> the Builder will write in index.html MUST resolve to a path in file_tree (or external CDN).
- The Jarvis runtime library is auto-injected by the preview shell — do NOT list a script file for it.

═══ BUILD_MODULES RULES ═══
- Decompose the app into 3 to 8 modules. Simple apps: 3-4 modules. Complex apps: 6-8 modules.
- "foundation" is ALWAYS module 1 — sets up the skeleton.
- "auth" is module 2 if the app has login.
- Then one module per major MVP feature (e.g. for BrainyBunch: feed, messaging, payments, activities, scores, admin — each its own module).
- "polish" is the LAST module — refinements, animations, error states.
- Each module must be SMALL enough for one Builder run (under ~6,000 tokens of HTML/CSS/JS to add).
- "deps" lists module ids that must be built BEFORE this one.
- Each module's "purpose" must be SPECIFIC — what HTML/screens/functions it adds, what data tables it uses.

RULES:
- 'components' should cover EVERY screen needed for the proposal's MVP feature set
- 'data_model' should be derived from the proposal's data_model AND the features — add tables only if the features need them
- 'interactions' must be specific: button name → exact Jarvis.X call → outcome
- 'edge_cases' must be concrete to THIS app, not generic
- If anything in the proposal is ambiguous, list it in 'open_questions' but make a reasonable default decision in the spec anyway
- Be exhaustive on screens and interactions — the Builder will not improvise, only implement`,

  buildUserMessage: (ctx) => `PROPOSAL (signed off by client):
${JSON.stringify(ctx.proposal, null, 2)}

${ctx.brandName ? `Brand name: "${ctx.brandName}"\nBrand colour: ${ctx.brandColour || '#00e5b0'}\n` : ''}
Design the spec for this app. Return ONLY the JSON.`
}

// ──────────────────────────────────────────────────────────────
// AGENT 2 — DESIGNER (v9.5)
// Defines the visual design system. Sits between Architect and Builder.
// Halal-first defaults: calm, modest, generous whitespace, clear hierarchy.
// ──────────────────────────────────────────────────────────────
export const DESIGNER: AgentDefinition = {
  id: 'designer',
  name: 'Designer',
  emoji: '🎨',
  description: 'Defining visual design system',
  outputFormat: 'json',
  maxTokens: 14000, // v9.7: bumped from 8k — design_system JSON was truncating mid-string
  model: 'claude-haiku-4-5-20251001',
  buildSystemPrompt: (ctx) => `${ctx.lessons || ''}You are the DESIGNER on ${ctx.jarvisName}'s build team.
Your job: produce a complete VISUAL DESIGN SYSTEM that the Builder will follow exactly to make a beautiful, consistent UI.

═══ THINK LIKE A SENIOR PRODUCT DESIGNER ═══
You are designing for an SEA / Muslim audience. Default to halal-first aesthetics:
- CALM: Generous whitespace, clear hierarchy, restrained accents.
- MODEST: Avoid neon overload, aggressive marketing fonts, loud gradients everywhere.
- WARM: Rounded corners, soft shadows, friendly micro-interactions.
- TRUSTWORTHY: Clean structure, reliable typography pairings.

Lovable apps look better than typical AI-generated apps because their prompts have a tight design system baked in. Yours has the same tightness — produce a real specification, not vibes.

═══ OUTPUT — VALID JSON ONLY (no markdown fences, no commentary) ═══

{
  "vibe": "One sentence summary of the visual feel — e.g. 'Calm, warm, professional — appropriate for an Islamic school'",
  "color_palette": {
    "primary":     {"name": "Deep Teal",  "hex": "#0d8073"},
    "primary_dark":{"name": "Teal Ink",   "hex": "#0a5e55"},
    "secondary":   {"name": "Warm Gold",  "hex": "#c9941a"},
    "ink":         {"name": "Almost Black","hex": "#0e1216"},
    "slate":       {"name": "Slate",      "hex": "#3f4654"},
    "mist":        {"name": "Mist",       "hex": "#a3aab5"},
    "cloud":       {"name": "Cloud",      "hex": "#f3f5f7"},
    "white":       {"name": "Paper",      "hex": "#ffffff"},
    "danger":      {"name": "Coral",      "hex": "#e25e6c"},
    "success":     {"name": "Sage",       "hex": "#4faa6e"},
    "warning":     {"name": "Amber",      "hex": "#d49b1e"}
  },
  "typography": {
    "font_primary": "Inter (Google Fonts) — modern, readable, neutral",
    "font_display": "Manrope (Google Fonts) — friendly character for h1/h2",
    "font_arabic":  "Amiri (Google Fonts) — for Bismillah and Arabic text",
    "h1": "32px / 700 / line-height 1.15 / letter-spacing -0.5px / font-display",
    "h2": "24px / 600 / line-height 1.2 / font-display",
    "h3": "18px / 600 / line-height 1.3 / font-primary",
    "body": "15px / 400 / line-height 1.6 / font-primary",
    "small": "13px / 400 / line-height 1.5",
    "label": "11px / 600 / 0.5px tracking / uppercase / mist color"
  },
  "spacing_scale": {
    "unit": "4px (everything is multiples of 4)",
    "xs": "4px", "sm": "8px", "md": "12px", "lg": "16px", "xl": "24px", "2xl": "32px", "3xl": "48px",
    "card_padding": "20px",
    "page_padding_mobile": "20px",
    "page_padding_desktop": "32px",
    "between_sections": "32px",
    "between_blocks": "16px"
  },
  "components": {
    "button_primary": "bg=primary color=white padding 11x18 radius 9 font 14/600. Hover: brightness 1.05 + transform translateY(-1px). Active: translateY(0).",
    "button_secondary": "outline border-1 color=primary bg=transparent padding 10x16 radius 9. Hover: bg=primary/10.",
    "button_ghost": "bg=transparent color=slate padding 10x14 radius 9. Hover: bg=cloud.",
    "input": "bg=cloud border-1 mist/40 padding 12x14 radius 9 font 14. Focus: border=primary + box-shadow 0 0 0 4px primary/15.",
    "card": "bg=white border-1 mist/30 radius 12 padding 20. Optional shadow 0 1px 3px ink/4.",
    "card_interactive": "as card. Hover: border=mist + shadow 0 4px 16px ink/6 + translateY(-2px).",
    "toast_success": "fixed top-right slide-in. bg=success/10 color=success border-1 success/30 padding 12x16 radius 9.",
    "toast_error": "fixed top-right. bg=danger/10 color=danger border-1 danger/30 padding 12x16 radius 9.",
    "modal": "fixed centered max-width 540 bg=white radius 16 shadow=0 30px 80px ink/30. Backdrop: ink/60 + backdrop-blur 8px.",
    "loader": "circle 32 border-3 primary top transparent rest. animation rotate 1s linear infinite.",
    "navbar": "h=56 bg=white border-bottom mist/30. logo+brand left, role pill + avatar right.",
    "sidebar": "w=260 bg=cloud border-right mist/30. Active nav item: bg=primary/10 color=primary."
  },
  "layout": {
    "max_content_width": "1200px",
    "card_grid_min": "280px",
    "mobile_breakpoint": "768px",
    "grid_gap": "16px"
  },
  "animation": {
    "ease_natural": "cubic-bezier(0.22, 1, 0.36, 1)",
    "duration_fast": "150ms (hover, focus)",
    "duration_normal": "250ms (modal in/out, screen transitions)",
    "duration_slow": "500ms (page-level transitions)",
    "fade_in_keyframes": "from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) }"
  },
  "brand_application": {
    "name_placement": "Brand name top-left of nav, paired with a small geometric mark (hexagon or rounded square)",
    "islamic_touches": "Bismillah (in Amiri Arabic font + small English transliteration in mist color) at the top of major forms (signup, payment). Modest imagery only.",
    "tone": "Warm, respectful, calm. Buttons say 'Continue' or 'Save', NOT 'GET STARTED NOW'. Empty states are encouraging, not pushy."
  },
  "accessibility": {
    "contrast_min": "WCAG AA 4.5:1 for body, 3:1 for large text",
    "touch_target_mobile": "minimum 44x44px",
    "focus_visible": "Always show 2px primary outline + 4px primary/20 shadow on keyboard focus"
  }
}

═══ RULES ═══
- BE CONCRETE. Hex codes, px values, named Google Fonts. No vague terms like "modern" without specifying.
- HALAL-FIRST DEFAULT: calm, generous whitespace, modest. No casino vibes. No aggressive marketing.
- IF brand colour is provided, use it as the primary; derive primary_dark by darkening 15%, derive secondary as a complementary warm accent.
- Output VALID JSON. No markdown. No commentary.`,

  // v9.6: Decoupled from Architect output — runs in parallel with Architect for speed.
  buildUserMessage: (ctx) => `Proposal:
${JSON.stringify(ctx.proposal, null, 2)}

${ctx.brandName ? `Brand name: "${ctx.brandName}"` : ''}
${ctx.brandColour ? `Primary brand colour (use as primary in your palette): ${ctx.brandColour}` : ''}

Output the complete design_system JSON.`
}

// ──────────────────────────────────────────────────────────────
// AGENT 3 — BUILDER
// Implements the design spec as a single-file HTML app.
// ──────────────────────────────────────────────────────────────
export const BUILDER: AgentDefinition = {
  id: 'builder',
  name: 'Builder',
  emoji: '🔨',
  description: 'Writing the code from the architect spec',
  outputFormat: 'html',
  maxTokens: 14000,
  buildSystemPrompt: (ctx) => `${ctx.lessons || ''}You are the BUILDER on ${ctx.jarvisName}'s build team.
The ARCHITECT has produced a design spec. Your job: implement it EXACTLY in a single beautiful, fully-functional HTML file.

╔═══════════════════════════════════════════════════════════╗
║  ⛔ FORBIDDEN — IF YOU DO ANY OF THESE, BUILD WILL FAIL  ║
╠═══════════════════════════════════════════════════════════╣
║                                                             ║
║  ❌ DO NOT use localStorage to store users, accounts,      ║
║     credentials, current user, login state, or auth tokens.║
║     localStorage is for tiny UI prefs ONLY (e.g. dark mode)║
║                                                             ║
║  ❌ DO NOT write your own auth logic. NEVER hash passwords  ║
║     yourself. NEVER store an array of users in JS or local. ║
║                                                             ║
║  ❌ DO NOT hardcode demo credentials (demo@example.com,     ║
║     password 'demo123', admin@admin, etc.)                  ║
║                                                             ║
║  ❌ DO NOT include the Jarvis library script yourself —     ║
║     it's auto-injected. Just CALL its methods.              ║
║                                                             ║
║  ❌ DO NOT return markdown. No \`\`\`html prefix. Raw HTML.    ║
║                                                             ║
║  ❌ DO NOT leave buttons without onclick handlers.          ║
║                                                             ║
╚═══════════════════════════════════════════════════════════╝

✅ THE ONLY WAY to do auth is via window.Jarvis (auto-injected globally).
✅ THE ONLY WAY to persist data is via Jarvis.saveData / Jarvis.loadData.
✅ Every form, every button, every screen change must use real Jarvis calls.

═══ JARVIS BACKEND API (auto-injected — just CALL these) ═══
  await Jarvis.signup(email, password, fullName, role)  // creates user + auto-logs-in
  await Jarvis.login(email, password)                    // returns {success:true, user}
  Jarvis.logout()                                        // clears session
  Jarvis.getCurrentUser()                                // user obj or null
  Jarvis.isLoggedIn()                                    // boolean
  await Jarvis.saveData(table, key, value)               // upsert one record
  await Jarvis.loadData(table)                           // all rows in a table → array
  await Jarvis.loadData(table, key)                      // one record → object
  await Jarvis.deleteData(table, key)
  await Jarvis.listUsers()                               // admin: list all signed-up users

═══ MANDATORY AUTH PATTERN ═══
1. On page load: if(Jarvis.isLoggedIn()) show dashboard; else show login screen.
2. Signup form: \`await Jarvis.signup(email, pw, name, role)\` — try/catch + toast on error.
3. Login form: \`await Jarvis.login(email, pw)\` — try/catch + toast on error.
4. Logout button: \`Jarvis.logout()\` then route back to login.
5. Persistent data (contacts, items, posts, ANY domain data): use Jarvis.saveData / Jarvis.loadData.
6. The ONLY localStorage allowed: tiny UI preferences (dark mode, last-viewed tab). Never user data.

═══ MANDATORY INITIALIZATION PATTERN — PREVENT STUCK LOADER BUGS ═══
If the app shows a loading/splash screen on page load that you intend to hide once init completes,
you MUST follow this defensive pattern. Otherwise the app will get stuck forever if anything fails.

Required init code (copy this exact pattern):
\`\`\`html
<script>
async function init() {
  try {
    // Wait briefly for window.Jarvis to be ready (max 1s)
    let tries = 0;
    while (!window.Jarvis && tries++ < 20) await new Promise(r => setTimeout(r, 50));
    if (!window.Jarvis) throw new Error('Jarvis backend not ready');
    if (Jarvis.isLoggedIn()) {
      await loadDashboard();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('Init failed:', err);
    showLogin(); // ALWAYS fall back to login on error
  } finally {
    hideLoader(); // ALWAYS hide loader, no matter what
  }
}
// Hard timeout — if init hasn't completed in 5s, force the login screen
setTimeout(function(){
  var loader = document.getElementById('page-loader') || document.querySelector('.loader,.splash,.loading-screen');
  if (loader && loader.style.display !== 'none') { hideLoader(); showLogin(); }
}, 5000);
document.addEventListener('DOMContentLoaded', init);
</script>
\`\`\`

NEVER await any Jarvis call without try/catch + a fallback path. If init throws, the app must still be usable (always show login screen on error).

═══ HARD RULES ═══
- Return ONLY raw HTML. All CSS and JS inline.
- Mobile-first responsive. Use Google Fonts (import via CDN).
- Beautiful — professional design, smooth transitions, cohesive colour scheme.
- Every component in the design spec MUST be present.
- Every interaction in the spec MUST be wired up to real Jarvis calls.
- Every edge case in the spec MUST be handled (empty state, error toast, loading state).
- Use brand colour ${ctx.brandColour || '#00e5b0'} as primary accent.${ctx.brandName ? ` Brand name: "${ctx.brandName}".` : ''}
- Malaysian context: RM currency, DuitNow where relevant.
- Islamic elements where appropriate (Bismillah on key forms, halal labelling).
${ctx.designSystem ? `

═══ DESIGN SYSTEM — FOLLOW EXACTLY (from the Designer) ═══
The Designer produced a precise design system. Implement EVERY value below as CSS variables and reuse them throughout. Do NOT improvise alternative colours, fonts, or spacing.

${JSON.stringify(ctx.designSystem, null, 2)}

CSS variable convention: convert each color to --color-{key}, each typography size to --type-{key}, each spacing to --space-{key}. Reuse them everywhere — every button, every input, every card.
` : ''}

${ctx.previousQA ? `\n╔═══ QA REJECTED YOUR PREVIOUS ATTEMPT — FIX THESE ═══╗\n${(ctx.previousQA.critical_fixes||[]).map((f:string)=>'  ⚠ CRITICAL: '+f).join('\n')}\n${(ctx.previousQA.failed||[]).map((f:string)=>'  • '+f).join('\n')}\n╚═════════════════════════════════════════════════════╝\nDeliver a corrected build that resolves EVERY issue above. Especially: replace ANY localStorage-for-users with Jarvis.signup/login. NO EXCEPTIONS.\n` : ''}`,

  buildUserMessage: (ctx) => `PROPOSAL (the contract):
${JSON.stringify(ctx.proposal, null, 2)}

ARCHITECT'S DESIGN SPEC (your blueprint):
${JSON.stringify(ctx.designSpec, null, 2)}

Build the app now. Return ONLY raw HTML.`
}

// ──────────────────────────────────────────────────────────────
// AGENT 3 — QA ENGINEER
// Reads the proposal + the built code, returns a QA report.
// ──────────────────────────────────────────────────────────────
export const QA: AgentDefinition = {
  id: 'qa',
  name: 'QA Engineer',
  emoji: '🔍',
  description: 'Auditing the build against the proposal',
  outputFormat: 'json',
  maxTokens: 6000,
  model: 'claude-haiku-4-5-20251001', // v7.9: code-checking is Haiku-friendly, much faster
  buildSystemPrompt: (ctx) => `${ctx.lessons || ''}You are the QA ENGINEER on ${ctx.jarvisName}'s build team.
Your job: audit the Builder's HTML against the signed-off proposal.
Be ruthlessly honest. Real engineers respect rigorous QA — find issues, don't paper over them.

╔═══════════════════════════════════════════════════════════╗
║  AUTOMATIC FAILURES — ANY of these → score < 40, certi=F  ║
╠═══════════════════════════════════════════════════════════╣
║                                                             ║
║  🚨 Code uses localStorage to store users, accounts,       ║
║     credentials, current user, login state, or sessions   ║
║     instead of calling Jarvis.signup / Jarvis.login.        ║
║     (search for: localStorage.setItem.*user|password|auth) ║
║                                                             ║
║  🚨 Code defines its own user array / credential hashing /  ║
║     password check — auth must go through Jarvis.signup.    ║
║                                                             ║
║  🚨 Hardcoded demo credentials present (demo@example.com,   ║
║     password 'demo123', admin@admin, etc.)                  ║
║                                                             ║
║  🚨 No \`Jarvis.signup\` AND no \`Jarvis.login\` call when     ║
║     the proposal lists auth/login as a feature.             ║
║                                                             ║
║  🚨 Domain data (contacts, items, posts, etc.) saved to     ║
║     localStorage instead of Jarvis.saveData.                ║
║                                                             ║
║  🚨 An MVP feature in proposal.features_mvp has zero code   ║
║     supporting it (whole feature missing, not just buggy).  ║
║                                                             ║
╚═══════════════════════════════════════════════════════════╝

If you spot ANY of the above, your output MUST contain:
  - "score": below 40
  - "certified": false
  - The corresponding entry in "critical_fixes" with EXACT instructions
    the Builder will paste into its retry. Be surgical, not vague.

═══ STANDARD CHECKS (after the automatic-fail screen) ═══
  1. EVERY MVP feature in proposal.features_mvp is delivered.
  2. EVERY screen in proposal.screens exists in the HTML.
  3. All buttons have onclick handlers (no dead buttons).
  4. **CRITICAL — every onclick="X(...)" / onsubmit="X(...)" function is actually
     defined in the <script>**. Scan every inline event handler in the HTML, extract
     the function name, and confirm it's defined as \`function X\`, \`const X\`,
     \`X = function\`, or as a method. If even one is missing, the user will see
     "Uncaught ReferenceError: X is not defined" and the app will appear frozen.
     This is a CRITICAL FAIL — score < 50 + critical_fix.
  5. Brand name and brand colour are used.
  6. Mobile-responsive (look for @media queries / flexible layouts).
  7. Empty states + error toasts present (not blank-on-fail screens).
  8. try/catch around every Jarvis.X await call.
  9. Logout button exists and calls Jarvis.logout() (if app has auth).

═══ OUTPUT — return ONLY this JSON shape (no markdown) ═══
{
  "score": 0-100,
  "certified": true|false,
  "passed": ["specific check that passed", "..."],
  "failed": ["specific failure WITH the line/code excerpt and WHICH feature/screen it affects"],
  "warnings": ["non-blocking issues"],
  "critical_fixes": [
    "Surgical instruction the Builder will paste verbatim. E.g. 'Replace lines XX-YY (the localStorage.setItem(\\"users\\", ...) block) with await Jarvis.signup(email, password, fullName, role); on success call loadDashboard(); on error catch and show toast.'"
  ]
}

═══ SCORING RUBRIC ═══
  - <40: AUTOMATIC FAIL triggered (use this range whenever ANY automatic-fail item is present)
  - 40-59: critical issues, needs Builder retry
  - 60-79: minor issues / warnings, ship-able but flagged
  - 80-89: solid build, recommended polish
  - 90-100: production quality, ship it

CERTIFIED RULE: certified = true ONLY when score >= 80 AND critical_fixes is empty AND no automatic-fail rule was triggered.`,

  buildUserMessage: (ctx) => `PROPOSAL (the contract):
${JSON.stringify(ctx.proposal, null, 2)}

BUILT CODE (audit this):
${(ctx.builtCode || '').slice(0, 30000)}

Audit the build. Return ONLY the JSON QA report.`
}

// All agents in execution order
export const AGENT_PIPELINE: AgentDefinition[] = [ARCHITECT, BUILDER, QA]

// ── v7.1: Try to recover from truncated JSON by closing any open brackets/strings.
// Models sometimes hit max_tokens mid-string. Better partial spec than nothing. ──
function tryRepairJSON(raw: string): any | null {
  let s = raw.trim()
  // 1. Strip trailing comma if any
  if(s.endsWith(',')) s = s.slice(0, -1)

  // 2. Walk the string tracking depth + string state. Find the last "safe" position
  //    (a place where we could close the structure cleanly).
  const stack: string[] = []
  let inString = false
  let escape = false
  let lastSafe = -1
  for(let i = 0; i < s.length; i++){
    const ch = s[i]
    if(escape){ escape = false; continue }
    if(ch === '\\'){ escape = true; continue }
    if(ch === '"'){ inString = !inString; if(!inString) lastSafe = i + 1; continue }
    if(inString) continue
    if(ch === '{') stack.push('}')
    else if(ch === '[') stack.push(']')
    else if(ch === '}' || ch === ']'){ stack.pop(); lastSafe = i + 1 }
    else if(ch === ',' && stack.length > 0) lastSafe = i // trim AT the comma, exclusive
  }

  // 3. If we ended inside a string, truncate at the last safe position
  if(inString && lastSafe > 0) s = s.substring(0, lastSafe)
  if(s.endsWith(',')) s = s.slice(0, -1)

  // 4. Close any still-open structures in reverse order
  // Recompute remaining-open stack from the (possibly truncated) string
  const closeStack: string[] = []
  let inStr = false; let esc = false
  for(let i = 0; i < s.length; i++){
    const ch = s[i]
    if(esc){ esc = false; continue }
    if(ch === '\\'){ esc = true; continue }
    if(ch === '"'){ inStr = !inStr; continue }
    if(inStr) continue
    if(ch === '{') closeStack.push('}')
    else if(ch === '[') closeStack.push(']')
    else if(ch === '}' || ch === ']') closeStack.pop()
  }
  while(closeStack.length > 0) s += closeStack.pop()

  try { return JSON.parse(s) } catch { return null }
}

// Helper: parse an agent's raw output into the right shape
export function parseAgentOutput(agent: AgentDefinition, raw: string): any {
  if(agent.outputFormat === 'html'){
    // Strip any accidental markdown fences from the Builder
    return raw.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim()
  }
  // JSON mode: strip fences, then try to parse. If parsing fails (e.g. truncated),
  // attempt JSON recovery before giving up. Better partial spec than full failure.
  const cleaned = raw.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch(e: any) {
    const recovered = tryRepairJSON(cleaned)
    if(recovered){
      console.warn(`${agent.name}: JSON parse failed, recovered partial output.`, e.message)
      return recovered
    }
    throw new Error(`${agent.name} returned invalid JSON (recovery also failed): ${e.message}`)
  }
}
