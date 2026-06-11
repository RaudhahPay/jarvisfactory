#!/usr/bin/env node
// JarvisFactory v11 / Phase 7.1 — smoke test for multi-file Builder primitives.
// Run from project root: `node scripts/test-builder-v2.mjs`
// Tests every BUILDER_TOOLS_V2 executor + validator against synthetic inputs.

import { executeBuilderToolV2, createBuilderStateV2, collapseTreeToSingleHtml } from '../lib/builder-tools-v2.ts'
import { validateBuildV2 } from '../lib/jarvis-patterns-v2.ts'

const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'

let pass = 0, fail = 0
function assert(cond, name, detail) {
  if (cond) { console.log(`${GREEN}✓${RESET} ${name}`); pass++ }
  else { console.log(`${RED}✗${RESET} ${name}${detail ? `\n  → ${detail}` : ''}`); fail++ }
}
function section(title) { console.log(`\n${CYAN}── ${title} ──${RESET}`) }

// ──────────────────────────────────────────────────────────────
section('write_file')
// ──────────────────────────────────────────────────────────────
{
  const s = createBuilderStateV2()
  const r1 = executeBuilderToolV2('write_file', { path: 'index.html', content: '<!DOCTYPE html><html><body>Hi</body></html>' }, s, { needsAuth: false })
  assert(r1.ok, 'creates index.html with DOCTYPE')

  const r2 = executeBuilderToolV2('write_file', { path: 'index.html', content: 'no doctype here' }, s, { needsAuth: false })
  assert(!r2.ok, 'rejects index.html without DOCTYPE', r2.content)

  const r3 = executeBuilderToolV2('write_file', { path: '../etc/passwd', content: 'x' }, s, { needsAuth: false })
  assert(!r3.ok, 'rejects path traversal (..)', r3.content)

  const r4 = executeBuilderToolV2('write_file', { path: '/abs/path.html', content: '<!DOCTYPE html>x'.repeat(20) }, s, { needsAuth: false })
  assert(r4.ok, 'normalizes leading slash')

  const r5 = executeBuilderToolV2('write_file', { path: 'styles/main.css', content: 'body { color: red; }' }, s, { needsAuth: false })
  assert(r5.ok, 'creates nested path styles/main.css')
  assert('styles/main.css' in s.files, 'state.files has styles/main.css')
}

// ──────────────────────────────────────────────────────────────
section('append_to_file')
// ──────────────────────────────────────────────────────────────
{
  const s = createBuilderStateV2()
  executeBuilderToolV2('write_file', { path: 'index.html', content: '<!DOCTYPE html><html><body><main></main></body></html>' }, s, { needsAuth: false })

  const r1 = executeBuilderToolV2('append_to_file', { path: 'index.html', chunk: '<div id="screen-login"></div>', anchor: '</main>' }, s, { needsAuth: false })
  assert(r1.ok, 'appends before </main>')
  assert(s.files['index.html'].includes('<div id="screen-login"></div>\n</main>'), 'chunk inserted before anchor')

  const r2 = executeBuilderToolV2('append_to_file', { path: 'nonexistent.js', chunk: 'x', anchor: 'y' }, s, { needsAuth: false })
  assert(!r2.ok, 'rejects append to nonexistent file')

  const r3 = executeBuilderToolV2('append_to_file', { path: 'index.html', chunk: 'x', anchor: 'NOPE' }, s, { needsAuth: false })
  assert(!r3.ok, 'rejects unknown anchor')
}

// ──────────────────────────────────────────────────────────────
section('list_files + read_file')
// ──────────────────────────────────────────────────────────────
{
  const s = createBuilderStateV2()
  executeBuilderToolV2('write_file', { path: 'index.html', content: '<!DOCTYPE html><html></html>'.padEnd(120, '!') }, s, { needsAuth: false })
  executeBuilderToolV2('write_file', { path: 'styles/main.css', content: 'a{}'.padEnd(50, ' ') }, s, { needsAuth: false })

  const list = executeBuilderToolV2('list_files', {}, s, { needsAuth: false })
  assert(list.ok && list.content.includes('index.html') && list.content.includes('styles/main.css'), 'list_files returns both paths')

  const r1 = executeBuilderToolV2('read_file', { path: 'styles/main.css' }, s, { needsAuth: false })
  assert(r1.ok && r1.content.startsWith('a{}'), 'read_file returns css content')

  const r2 = executeBuilderToolV2('read_file', { path: 'nope.js' }, s, { needsAuth: false })
  assert(!r2.ok, 'read_file errors on missing path')
}

// ──────────────────────────────────────────────────────────────
section('delete_file')
// ──────────────────────────────────────────────────────────────
{
  const s = createBuilderStateV2()
  executeBuilderToolV2('write_file', { path: 'index.html', content: '<!DOCTYPE html>x'.repeat(20) }, s, { needsAuth: false })
  executeBuilderToolV2('write_file', { path: 'scripts/aux.js', content: 'aux content'.padEnd(40, ' ') }, s, { needsAuth: false })

  const r1 = executeBuilderToolV2('delete_file', { path: 'scripts/aux.js' }, s, { needsAuth: false })
  assert(r1.ok && !('scripts/aux.js' in s.files), 'deletes aux file')

  const r2 = executeBuilderToolV2('delete_file', { path: 'index.html' }, s, { needsAuth: false })
  assert(!r2.ok, 'refuses to delete entry point')
}

// ──────────────────────────────────────────────────────────────
section('collapseTreeToSingleHtml')
// ──────────────────────────────────────────────────────────────
{
  const files = {
    'index.html': `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles/main.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css">
</head>
<body>
  <main></main>
  <script src="scripts/app.js"></script>
  <script src="https://cdn.example.com/lib.js"></script>
</body>
</html>`,
    'styles/main.css': 'body { color: red; }',
    'scripts/app.js': 'console.log("hi")',
  }
  const combined = collapseTreeToSingleHtml(files)
  assert(combined.includes('<style data-from="styles/main.css">'), 'inlines local stylesheet')
  assert(combined.includes('body { color: red; }'), 'css content present')
  assert(combined.includes('<script data-from="scripts/app.js">'), 'inlines local script')
  assert(combined.includes('console.log("hi")'), 'js content present')
  assert(combined.includes('https://fonts.googleapis.com/css'), 'preserves external CDN <link>')
  assert(combined.includes('https://cdn.example.com/lib.js'), 'preserves external CDN <script>')
}

// ──────────────────────────────────────────────────────────────
section('validateBuildV2 — clean app')
// ──────────────────────────────────────────────────────────────
{
  const files = {
    'index.html': `<!DOCTYPE html>
<html><head>
  <link rel="stylesheet" href="styles/main.css">
</head><body>
  <main>
    <div id="screen-login">
      <button onclick="doLogin()">Login</button>
    </div>
  </main>
  <script src="scripts/auth.js"></script>
</body></html>`,
    'styles/main.css': 'body { background: #fff; }',
    'scripts/auth.js': `async function doLogin() { try { await Jarvis.login('a','b'); } catch(e) { toast(e.message,'error'); } }
function toast(m,t){}`,
  }
  const v = validateBuildV2(files, 'index.html', true)
  assert(v.valid, 'clean app passes', v.errors.map(e => `[${e.file}] ${e.message}`).join('; '))
  assert(v.errors.length === 0, 'no errors')
}

// ──────────────────────────────────────────────────────────────
section('validateBuildV2 — catches cross-file undefined onclick')
// ──────────────────────────────────────────────────────────────
{
  const files = {
    'index.html': `<!DOCTYPE html><html><body>
      <button onclick="undefinedFn()">Click</button>
      <script src="scripts/app.js"></script>
    </body></html>`,
    'scripts/app.js': 'function definedFn(){}',  // undefinedFn is NOT here
  }
  const v = validateBuildV2(files, 'index.html', false)
  assert(!v.valid, 'flags undefined cross-file handler')
  assert(v.errors.some(e => e.message.includes('undefinedFn')), 'error mentions the missing function name')
}

// ──────────────────────────────────────────────────────────────
section('validateBuildV2 — catches localStorage abuse per file')
// ──────────────────────────────────────────────────────────────
{
  const files = {
    'index.html': `<!DOCTYPE html><html><body>
      <button onclick="signUp()">Sign up</button>
      <script src="scripts/auth.js"></script>
    </body></html>`,
    'scripts/auth.js': `function signUp() {
      localStorage.setItem('users', JSON.stringify([{email:'a',pw:'b'}]));
      localStorage.setItem('theme', 'dark');  // allowed
    }`,
  }
  const v = validateBuildV2(files, 'index.html', true)
  assert(!v.valid, 'flags localStorage user abuse')
  const ls = v.errors.find(e => e.message.includes('localStorage'))
  assert(ls && ls.file === 'scripts/auth.js', 'attributes localStorage error to scripts/auth.js')
  assert(ls && ls.message.includes('users'), 'mentions the disallowed key')
}

// ──────────────────────────────────────────────────────────────
section('validateBuildV2 — warns on missing local file reference')
// ──────────────────────────────────────────────────────────────
{
  const files = {
    'index.html': `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="styles/missing.css">
    </head><body><script src="scripts/missing.js"></script></body></html>`,
  }
  const v = validateBuildV2(files, 'index.html', false)
  assert(v.warnings.some(w => w.message.includes('missing.css')), 'warns about missing css ref')
  assert(v.warnings.some(w => w.message.includes('missing.js')), 'warns about missing js ref')
}

// ──────────────────────────────────────────────────────────────
section('validateBuildV2 — rejects invalid JSON files')
// ──────────────────────────────────────────────────────────────
{
  const files = {
    'index.html': '<!DOCTYPE html><html><body></body></html>',
    'package.json': '{ "name": "broken", invalid }',
  }
  const v = validateBuildV2(files, 'index.html', false)
  assert(v.errors.some(e => e.file === 'package.json'), 'flags invalid JSON in package.json')
}

// ──────────────────────────────────────────────────────────────
section('audit_build + finalize gate')
// ──────────────────────────────────────────────────────────────
{
  const s = createBuilderStateV2()
  executeBuilderToolV2('write_file', { path: 'index.html', content: `<!DOCTYPE html><html><body>
    <button onclick="undefFn()">x</button>
    <script src="scripts/app.js"></script>
  </body></html>` }, s, { needsAuth: false })
  executeBuilderToolV2('write_file', { path: 'scripts/app.js', content: 'function realFn(){}' }, s, { needsAuth: false })

  const audit = executeBuilderToolV2('audit_build', {}, s, { needsAuth: false })
  assert(!audit.ok, 'audit_build catches undefined handler')

  const fin = executeBuilderToolV2('finalize', { summary: 'test' }, s, { needsAuth: false })
  assert(!fin.ok, 'finalize blocked when audit has errors')
  assert(!s.finalized, 'state.finalized stays false')

  // Fix the broken handler by overwriting scripts/app.js
  executeBuilderToolV2('write_file', { path: 'scripts/app.js', content: 'function undefFn(){}' }, s, { needsAuth: false })
  const audit2 = executeBuilderToolV2('audit_build', {}, s, { needsAuth: false })
  assert(audit2.ok, 'audit_build passes after fix')

  const fin2 = executeBuilderToolV2('finalize', { summary: 'fixed' }, s, { needsAuth: false })
  assert(fin2.ok && s.finalized, 'finalize succeeds after audit clean')
}

// ──────────────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`)
if (fail > 0) {
  console.log(`${RED}FAILED${RESET}`)
  process.exit(1)
}
console.log(`${GREEN}ALL PASS — Phase 7.1 foundation primitives green${RESET}`)
