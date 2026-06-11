// ============================================================
// JARVIS_PATTERNS — Reference patterns shown to JARVIS in build prompts
// These are battle-tested code snippets that JARVIS must mimic.
// Embedding small focused examples >> long abstract instructions.
// ============================================================

export const AUTH_PATTERN_REFERENCE = `
Below is a working reference pattern. Your output MUST follow this exact structure for any app that needs login:

\`\`\`html
<!-- BOOT: decide which screen to show -->
<script>
document.addEventListener('DOMContentLoaded', function(){
  // Wire up all buttons here, then route:
  if(window.Jarvis && Jarvis.isLoggedIn()){
    loadDashboard();
  } else {
    showOnly('screen-login');
  }
});

// ROUTING — show one screen, hide others
function showOnly(screenId){
  ['screen-login','screen-signup','screen-dash'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  document.getElementById(screenId).style.display = '';
}

// SIGNUP — uses Jarvis.signup, not localStorage
async function doSignup(){
  var email = document.getElementById('signup-email').value.trim();
  var pw = document.getElementById('signup-password').value;
  var name = document.getElementById('signup-name').value.trim();
  var role = document.getElementById('signup-role').value;
  if(!email || !pw){ toast('Email and password required', 'error'); return; }
  if(pw.length < 6){ toast('Password must be 6+ chars', 'error'); return; }
  try {
    await Jarvis.signup(email, pw, name, role);
    toast('Welcome ' + name, 'success');
    await loadDashboard();
  } catch(e){
    var msg = (e.message||'').indexOf('duplicate') !== -1
      ? 'Email already registered. Try signing in.'
      : ('Signup failed: ' + e.message);
    toast(msg, 'error');
  }
}

// LOGIN — uses Jarvis.login, not localStorage
async function doLogin(){
  var email = document.getElementById('login-email').value.trim();
  var pw = document.getElementById('login-password').value;
  if(!email || !pw){ toast('Email and password required', 'error'); return; }
  try {
    await Jarvis.login(email, pw);
    await loadDashboard();
  } catch(e){
    toast('Login failed: ' + e.message, 'error');
  }
}

// LOGOUT
function doLogout(){
  Jarvis.logout();
  showOnly('screen-login');
}

// DASHBOARD — gets current user, branches by role, loads data via Jarvis
async function loadDashboard(){
  var user = Jarvis.getCurrentUser();
  if(!user){ showOnly('screen-login'); return; }
  showOnly('screen-dash');
  // Display user info, render role-specific UI
  document.getElementById('dash-name').textContent = user.full_name;
  if(user.role === 'admin'){
    var allRecords = await Jarvis.loadData('items') || [];
    renderAdminView(allRecords);
  } else {
    var myRecords = (await Jarvis.loadData('items') || [])
      .filter(function(r){ return r.userId === user.id; });
    renderUserView(myRecords);
  }
}

// SAVE — uses Jarvis.saveData (upsert by record_key)
async function saveItem(data){
  var key = 'item-' + Date.now();
  await Jarvis.saveData('items', key, data);  // table='items', key=unique, value=any object
  await loadDashboard();  // refresh
}

// TOAST helper for errors/success
function toast(msg, type){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type||'info') + ' show';
  setTimeout(function(){ t.classList.remove('show'); }, 3500);
}
</script>
\`\`\`

Copy this exact pattern. Adapt the table names ('items' → 'staff', 'gifts', 'orders', etc.) for your app.
`;

// ============================================================
// VALIDATOR — Layer 2: Catch broken builds before user sees them
// ============================================================
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateBuild(html: string, requiresAuth: boolean): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic sanity
  if (!html || html.length < 200) {
    errors.push('Output is too short to be a real app');
    return { valid: false, errors, warnings };
  }
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    errors.push('Output does not look like an HTML document');
  }

  if (requiresAuth) {
    // ── Critical: must use Jarvis backend, not localStorage hacks ──
    const hasJarvisAuth = /Jarvis\.(signup|login|logout|getCurrentUser|isLoggedIn)\s*\(/.test(html);
    if (!hasJarvisAuth) {
      errors.push('App requires auth but does NOT call Jarvis.signup/login/logout — must use the injected backend');
    }

    // ── Forbidden: hardcoded demo credentials ──
    const demoCredsPatterns = [
      /demo@example\.com/i,
      /password\s*[=:]\s*['"]demo123['"]/i,
      /['"]demo123['"]/,
      /admin@admin\.com/i,
    ];
    for (const pat of demoCredsPatterns) {
      if (pat.test(html)) {
        errors.push(`Hardcoded demo credentials detected (${pat}) — auth must use real Jarvis.signup/login`);
        break;
      }
    }

    // ── v7.2: HARDENED — localStorage allowlist instead of narrow denylist ──
    // Anything written to localStorage that isn't a known UI-pref key is a violation.
    // This catches the previous slip-throughs: 'staffMembers', 'birthdays',
    // 'sessionToken', 'isLoggedIn', 'companySettings', 'authenticated', etc.
    const ALLOWED_KEYS = new Set([
      'theme', 'darkmode', 'darkMode', 'colorScheme', 'colourScheme',
      'language', 'lang', 'locale', 'i18n',
      'fontSize', 'fontsize',
      'sidebar', 'sidebarOpen', 'sidebarcollapsed',
      'lastVisitedTab', 'activetab', 'activeTab', 'tab',
      'consentAccepted', 'consent', 'cookieConsent',
    ]);
    const ALLOWED_PREFIXES = ['jarvis_', 'jf_', 'theme_', 'pref_', 'ui_'];
    const isAllowedKey = (k: string): boolean => {
      const lower = k.toLowerCase();
      if (ALLOWED_KEYS.has(k)) return true;
      if (ALLOWED_KEYS.has(lower)) return true;
      return ALLOWED_PREFIXES.some(p => lower.startsWith(p));
    };
    const lsCallRe = /localStorage\.(setItem|getItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const violations = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = lsCallRe.exec(html)) !== null) {
      const key = m[2];
      if (!isAllowedKey(key)) violations.add(key);
    }
    if (violations.size > 0) {
      const sample = Array.from(violations).slice(0, 5).join(', ');
      errors.push(`localStorage abuse — keys not on the UI-pref allowlist: ${sample}${violations.size>5?` (+${violations.size-5} more)`:''}. ALL app data and auth state must go through window.Jarvis (Jarvis.signup, Jarvis.login, Jarvis.saveData, Jarvis.loadData).`);
    }

    // ── Catch self-rolled auth: code defining its own user array / hashing ──
    const selfRolledAuth = [
      /const\s+users\s*=\s*\[/,                     // const users = [...]
      /let\s+users\s*=\s*\[/,
      /var\s+users\s*=\s*\[/,
      /JSON\.parse\s*\(\s*localStorage\.getItem\s*\(\s*['"`][^'"`]*user/i,
    ];
    for (const pat of selfRolledAuth) {
      if (pat.test(html)) {
        errors.push('Self-rolled user storage detected (own users array or localStorage user list) — auth MUST go through Jarvis.signup/login.');
        break;
      }
    }

    // ── Required: signup form should call Jarvis.signup somewhere downstream ──
    const hasSignupHandler = /(?:onclick|addEventListener|onsubmit)[\s\S]{0,80}(?:doSignup|Jarvis\.signup)/i.test(html);
    if (!hasSignupHandler) {
      warnings.push('Could not detect a signup handler wired to a button — verify signup flow works');
    }
  }

  // ── v7.5: Static check — every onclick="X(...)" must have a matching function defined.
  // Catches the "Uncaught ReferenceError: X is not defined" class of build bugs. ──
  // Extract function names from inline event handlers (onclick, onsubmit, onchange, etc.)
  const handlerRe = /\bon(?:click|submit|change|input|focus|blur|keyup|keydown|mouseover|mouseout)\s*=\s*['"]\s*([a-zA-Z_$][\w$]*)\s*\(/gi;
  const referenced = new Set<string>();
  let hMatch: RegExpExecArray | null;
  while ((hMatch = handlerRe.exec(html)) !== null) {
    const name = hMatch[1];
    // Skip noise: builtins, no-ops, this/return/alert/console, etc.
    // Skip noise: JS keywords, builtins, no-ops. These appear inside expressions like
    // onclick="if(x) doY()" or onclick="event.preventDefault()" where the first token
    // captured by the regex is NOT actually a function call.
    if (/^(if|else|for|while|switch|do|try|catch|finally|throw|return|new|typeof|delete|void|in|instanceof|var|let|const|function|class|this|window|document|globalThis|self|parent|top|alert|confirm|prompt|console|setTimeout|setInterval|clearTimeout|clearInterval|requestAnimationFrame|cancelAnimationFrame|fetch|Math|JSON|Date|Number|String|Boolean|Array|Object|Map|Set|Promise|Symbol|RegExp|Error|true|false|null|undefined|NaN|Infinity|event|e)$/.test(name)) continue;
    referenced.add(name);
  }
  // Strip the auto-injected JARVIS lib block before scanning (those are library helpers, not user code)
  const codeForScan = html.replace(/<script>\s*\(function\(\)\s*\{[\s\S]*?window\.Jarvis\s*=[\s\S]*?\}\s*\)\(\)\s*;?\s*<\/script>/g, '');
  const undefinedFns: string[] = [];
  for (const fn of referenced) {
    // Look for: function X(, X = (, X = function, X = async, var/let/const X = ..., X: function (object methods)
    const defRe = new RegExp(
      `(?:function\\s+${fn}\\b|\\b${fn}\\s*=\\s*(?:async\\s+)?(?:function\\b|\\(|[a-zA-Z_$])|\\b(?:var|let|const)\\s+${fn}\\b|['"]?${fn}['"]?\\s*:\\s*(?:async\\s+)?function\\b|\\b${fn}\\s*:\\s*(?:async\\s*)?\\()`
    );
    if (!defRe.test(codeForScan)) undefinedFns.push(fn);
  }
  if (undefinedFns.length > 0) {
    errors.push(`Undefined onclick handlers: ${undefinedFns.slice(0,5).join(', ')}${undefinedFns.length>5?` (+${undefinedFns.length-5} more)`:''} — these functions are referenced from HTML event attributes but never defined in the <script>. Will throw "ReferenceError: X is not defined" the moment the user clicks them. Define each one or change the handler.`);
  }

  // ── Soft warnings: not blocking but worth flagging ──
  if (html.length > 100000) {
    warnings.push('App is very large (>100KB) — consider simplifying for faster loading');
  }
  if (!html.includes('toast') && !html.includes('alert(')) {
    warnings.push('No error display mechanism detected — users won\'t see error messages');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================
// Detect whether a user prompt requires auth
// Used to decide whether to apply auth-specific validation
// ============================================================
export function promptRequiresAuth(prompt: string, answers: string): boolean {
  const combined = (prompt + ' ' + answers).toLowerCase();
  const authKeywords = [
    'login', 'log in', 'log-in', 'logon',
    'sign up', 'signup', 'sign-up', 'register',
    'authentication', 'auth', 'account',
    'multi-user', 'multiple users', 'users can',
    'admin', 'staff', 'role', 'permission',
    'private', 'profile',
  ];
  return authKeywords.some(kw => combined.includes(kw));
}
