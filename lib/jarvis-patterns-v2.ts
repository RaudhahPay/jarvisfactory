// ============================================================
// JARVISFACTORY v11 / Phase 7.1 — Multi-file validator
// ============================================================
// Validates a Record<string, string> project tree by:
//   1. Resolving file types (HTML / CSS / JS / TSX / JSON / MD / other)
//   2. Collapsing references (link href, script src) into a single virtual doc
//      for cross-file onclick→function checking
//   3. Running all original v1 checks (localStorage allowlist, demo creds,
//      Jarvis-API-for-auth, etc.) against the combined surface
//   4. Reporting errors as { file, message } pairs so the Builder agent knows
//      where to patch
// ============================================================

import { collapseTreeToSingleHtml } from './builder-tools-v2'

export interface FileIssue {
  file: string
  message: string
}

export interface ValidationResultV2 {
  valid: boolean
  errors: FileIssue[]
  warnings: FileIssue[]
}

// Same allowlist as v1
const ALLOWED_LS_KEYS = new Set([
  'theme', 'darkmode', 'darkMode', 'colorScheme', 'colourScheme',
  'language', 'lang', 'locale', 'i18n',
  'fontSize', 'fontsize',
  'sidebar', 'sidebarOpen', 'sidebarcollapsed',
  'lastVisitedTab', 'activetab', 'activeTab', 'tab',
  'consentAccepted', 'consent', 'cookieConsent',
])
const ALLOWED_LS_PREFIXES = ['jarvis_', 'jf_', 'theme_', 'pref_', 'ui_']
function isAllowedLSKey(k: string): boolean {
  const lower = k.toLowerCase()
  if (ALLOWED_LS_KEYS.has(k)) return true
  if (ALLOWED_LS_KEYS.has(lower)) return true
  return ALLOWED_LS_PREFIXES.some(p => lower.startsWith(p))
}

function classifyFile(path: string): 'html' | 'css' | 'js' | 'tsx' | 'json' | 'md' | 'other' {
  const p = path.toLowerCase()
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'html'
  if (p.endsWith('.css')) return 'css'
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'js'
  if (p.endsWith('.jsx') || p.endsWith('.tsx') || p.endsWith('.ts')) return 'tsx'
  if (p.endsWith('.json')) return 'json'
  if (p.endsWith('.md')) return 'md'
  return 'other'
}

// ──────────────────────────────────────────────────────────────
// MAIN VALIDATOR
// ──────────────────────────────────────────────────────────────
export function validateBuildV2(
  files: Record<string, string>,
  entryPoint: string,
  requiresAuth: boolean
): ValidationResultV2 {
  const errors: FileIssue[] = []
  const warnings: FileIssue[] = []

  // 0. Entry point must exist + be non-trivial
  if (!(entryPoint in files)) {
    errors.push({ file: entryPoint, message: 'Entry point file does not exist in the project tree' })
    return { valid: false, errors, warnings }
  }
  if (files[entryPoint].length < 100) {
    errors.push({ file: entryPoint, message: 'Entry point is too short to be a real app' })
    return { valid: false, errors, warnings }
  }

  // 1. Per-file structural checks
  for (const [path, content] of Object.entries(files)) {
    const kind = classifyFile(path)

    if (kind === 'html') {
      // Resolve <link rel="stylesheet" href="...">  and <script src="..."> against tree
      const linkRe = /<link\s+[^>]*href=["']([^"']+)["'][^>]*>/gi
      const scriptRe = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
      let lm: RegExpExecArray | null
      while ((lm = linkRe.exec(content)) !== null) {
        const href = lm[1]
        if (/^https?:\/\//.test(href) || href.startsWith('//')) continue   // external CDN
        if (href.startsWith('data:')) continue                              // data URL
        const key = href.replace(/^\.?\//, '')
        if (!(key in files)) {
          warnings.push({ file: path, message: `<link href="${href}"> points to "${key}" which is not in the project tree` })
        }
      }
      while ((lm = scriptRe.exec(content)) !== null) {
        const src = lm[1]
        if (/^https?:\/\//.test(src) || src.startsWith('//')) continue
        if (src.startsWith('data:')) continue
        const key = src.replace(/^\.?\//, '')
        if (!(key in files)) {
          warnings.push({ file: path, message: `<script src="${src}"> points to "${key}" which is not in the project tree` })
        }
      }
    }

    if (kind === 'js' || kind === 'tsx') {
      // Self-rolled auth check
      const selfRolledAuth = [
        /const\s+users\s*=\s*\[/,
        /let\s+users\s*=\s*\[/,
        /var\s+users\s*=\s*\[/,
        /JSON\.parse\s*\(\s*localStorage\.getItem\s*\(\s*['"`][^'"`]*user/i,
      ]
      if (requiresAuth) {
        for (const pat of selfRolledAuth) {
          if (pat.test(content)) {
            errors.push({ file: path, message: 'Self-rolled user storage detected (own users array or localStorage user list) — auth MUST go through Jarvis.signup/login' })
            break
          }
        }
      }
    }

    if (kind === 'json') {
      // Validate JSON files parse
      try { JSON.parse(content) }
      catch (e: any) { errors.push({ file: path, message: `Invalid JSON: ${e.message}` }) }
    }
  }

  // 2. Combined-surface checks (collapse tree into virtual single HTML doc)
  const isHtmlEntry = entryPoint.toLowerCase().endsWith('.html')
  if (isHtmlEntry) {
    const combined = collapseTreeToSingleHtml(files, entryPoint)
    runCombinedSurfaceChecks(combined, files, errors, warnings, requiresAuth)
  } else {
    // For React/Next.js entries (Phase 7.2+), we'll add JSX-specific checks later.
    // For Phase 7.1 we'll just do per-file LS allowlist on all JS/TSX files.
    for (const [path, content] of Object.entries(files)) {
      const kind = classifyFile(path)
      if (kind !== 'js' && kind !== 'tsx') continue
      runLocalStorageCheck(content, path, errors, requiresAuth)
    }
  }

  // 3. Soft warnings
  const totalSize = Object.values(files).reduce((a, c) => a + c.length, 0)
  if (totalSize > 200000) {
    warnings.push({ file: '(tree)', message: `Total project size is ${(totalSize/1024).toFixed(0)}KB — consider whether modules can be simplified` })
  }
  if (Object.keys(files).length === 1) {
    warnings.push({ file: '(tree)', message: 'Project has only 1 file — multi-file mode benefits from splitting CSS and JS into their own files' })
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ──────────────────────────────────────────────────────────────
// Combined-surface checks (HTML entry)
// ──────────────────────────────────────────────────────────────
function runCombinedSurfaceChecks(
  combinedHtml: string,
  files: Record<string, string>,
  errors: FileIssue[],
  warnings: FileIssue[],
  requiresAuth: boolean
) {
  if (requiresAuth) {
    // Jarvis API used at all?
    const hasJarvisAuth = /Jarvis\.(signup|login|logout|getCurrentUser|isLoggedIn)\s*\(/.test(combinedHtml)
    if (!hasJarvisAuth) {
      errors.push({ file: '(combined)', message: 'App requires auth but does NOT call Jarvis.signup/login/logout anywhere in the tree — must use the injected backend' })
    }

    // Hardcoded demo credentials
    const demoCredsPatterns = [
      /demo@example\.com/i,
      /password\s*[=:]\s*['"]demo123['"]/i,
      /['"]demo123['"]/,
      /admin@admin\.com/i,
    ]
    for (const pat of demoCredsPatterns) {
      if (pat.test(combinedHtml)) {
        // Try to attribute to a specific file
        const culprit = Object.entries(files).find(([, c]) => pat.test(c))
        errors.push({ file: culprit ? culprit[0] : '(combined)', message: `Hardcoded demo credentials detected (pattern: ${pat}) — auth must use real Jarvis.signup/login` })
        break
      }
    }

    // localStorage allowlist — per file so we can attribute the violation
    for (const [path, content] of Object.entries(files)) {
      runLocalStorageCheck(content, path, errors, true)
    }
  }

  // Cross-file onclick → function existence check
  const handlerRe = /\bon(?:click|submit|change|input|focus|blur|keyup|keydown|mouseover|mouseout)\s*=\s*['"]\s*([a-zA-Z_$][\w$]*)\s*\(/gi
  const referenced = new Set<string>()
  let hMatch: RegExpExecArray | null
  while ((hMatch = handlerRe.exec(combinedHtml)) !== null) {
    const name = hMatch[1]
    if (/^(if|else|for|while|switch|do|try|catch|finally|throw|return|new|typeof|delete|void|in|instanceof|var|let|const|function|class|this|window|document|globalThis|self|parent|top|alert|confirm|prompt|console|setTimeout|setInterval|clearTimeout|clearInterval|requestAnimationFrame|cancelAnimationFrame|fetch|Math|JSON|Date|Number|String|Boolean|Array|Object|Map|Set|Promise|Symbol|RegExp|Error|true|false|null|undefined|NaN|Infinity|event|e)$/.test(name)) continue
    referenced.add(name)
  }
  // Strip the auto-injected Jarvis lib (helpers like login/signup are intentional globals)
  const codeForScan = combinedHtml.replace(
    /<script>\s*\(function\(\)\s*\{[\s\S]*?window\.Jarvis\s*=[\s\S]*?\}\s*\)\(\)\s*;?\s*<\/script>/g,
    ''
  )
  const undefinedFns: string[] = []
  for (const fn of referenced) {
    const defRe = new RegExp(
      `(?:function\\s+${fn}\\b|\\b${fn}\\s*=\\s*(?:async\\s+)?(?:function\\b|\\(|[a-zA-Z_$])|\\b(?:var|let|const)\\s+${fn}\\b|['"]?${fn}['"]?\\s*:\\s*(?:async\\s+)?function\\b|\\b${fn}\\s*:\\s*(?:async\\s*)?\\()`
    )
    if (!defRe.test(codeForScan)) undefinedFns.push(fn)
  }
  if (undefinedFns.length > 0) {
    errors.push({
      file: '(combined)',
      message: `Undefined onclick handlers across the tree: ${undefinedFns.slice(0, 5).join(', ')}${undefinedFns.length > 5 ? ` (+${undefinedFns.length - 5} more)` : ''} — referenced from HTML but never defined in any JS file. Will throw ReferenceError when clicked.`,
    })
  }
}

// ──────────────────────────────────────────────────────────────
// Per-file localStorage allowlist check
// ──────────────────────────────────────────────────────────────
function runLocalStorageCheck(content: string, path: string, errors: FileIssue[], requiresAuth: boolean) {
  if (!requiresAuth) return
  const lsCallRe = /localStorage\.(setItem|getItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g
  const violations = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = lsCallRe.exec(content)) !== null) {
    const key = m[2]
    if (!isAllowedLSKey(key)) violations.add(key)
  }
  if (violations.size > 0) {
    const sample = Array.from(violations).slice(0, 5).join(', ')
    errors.push({
      file: path,
      message: `localStorage abuse — keys not on the UI-pref allowlist: ${sample}${violations.size > 5 ? ` (+${violations.size - 5} more)` : ''}. ALL app data and auth state must go through window.Jarvis (Jarvis.signup, Jarvis.login, Jarvis.saveData, Jarvis.loadData).`,
    })
  }
}
