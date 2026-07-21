// ============================================================
// JARVISFACTORY v2 / Stage 4 — Layer 7: agent permission policy
// ============================================================
// Pure, testable guardrails applied BEFORE the agent's sandbox tools execute
// (CLAUDE.md §7). The sandbox is isolated, but we still refuse to auto-run the
// genuinely dangerous classes: filesystem wipes, deploys, secret exfiltration,
// reverse shells, pipe-to-shell installs, and path traversal out of the workspace.
// "review" is reserved for a future human-in-the-loop gate; today the runner treats
// deny as blocked and allow as run. No I/O here — just classification.
// ============================================================

export type PolicyDecision = 'allow' | 'deny' | 'review'

export interface PolicyResult {
  decision: PolicyDecision
  reason?: string
  category?: string
}

const ALLOW: PolicyResult = { decision: 'allow' }

// `rm` with a recursive flag (-r/-R/--recursive, alone or combined with other
// short flags like -rf/-fr/-Rf) is denied REGARDLESS OF TARGET. A target-based
// check (only deny `rm -rf /`, `~`, `$HOME`, `/*`, `..`) was bypassable via
// `rm -rf .`, `rm -rf ./`, `rm -rf *`, or any relative directory — recursive
// delete alone is enough to wipe the sandbox workspace; -f only suppresses
// confirmation, it isn't what makes this dangerous. The agent's build flow never
// needs recursive delete (npm/vite installs manage their own state), so there is
// no legitimate case to preserve.
function commandHasRecursiveRm(cmd: string): boolean {
  const statements = cmd.split(/[;&|\n]+/)
  for (const stmt of statements) {
    const tokens = stmt.trim().split(/\s+/)
    const rmIdx = tokens.findIndex(t => t === 'rm')
    if (rmIdx === -1) continue
    for (const tok of tokens.slice(rmIdx + 1)) {
      if (tok === '--recursive') return true
      if (/^-[a-zA-Z]+$/.test(tok) && /[rR]/.test(tok.slice(1))) return true
    }
  }
  return false
}

// Genuinely destructive / exfil / deploy patterns — deny outright.
const DENY: { re: RegExp; reason: string; category: string }[] = [
  {
    re: /\b(mkfs|fdisk)\b/i,
    reason: 'disk format',
    category: 'destructive-fs',
  },
  {
    re: /\bdd\b[^\n]*\bof=\/dev\//i,
    reason: 'raw write to a device',
    category: 'destructive-fs',
  },
  {
    re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: 'fork bomb',
    category: 'dos',
  },
  {
    re: /\b(wrangler|vercel|netlify|flyctl|fly|gh)\s+deploy\b/i,
    reason: 'deploy command (deploys go through our flow, not the agent)',
    category: 'deploy',
  },
  {
    re: /\bgit\s+push\b/i,
    reason: 'git push (publishing goes through our deploy flow)',
    category: 'deploy',
  },
  {
    re: /\b(curl|wget|fetch)\b[^|\n]*\|\s*(sudo\s+)?(sh|bash|zsh|python|node)\b/i,
    reason: 'pipe-from-network straight into a shell/interpreter',
    category: 'untrusted-exec',
  },
  {
    re: /\/dev\/tcp\//,
    reason: 'reverse shell via /dev/tcp',
    category: 'exfil',
  },
  {
    re: /\b(nc|ncat|netcat)\b[^\n]*\s-[a-z]*e/i,
    reason: 'reverse shell (nc -e)',
    category: 'exfil',
  },
  {
    re: /(printenv|env|cat\b[^\n]*\.env)[^\n]*\|\s*(curl|wget|nc)\b/i,
    reason: 'environment/secret exfiltration',
    category: 'exfil',
  },
  {
    // Closes the bypass in the rule above: no pipe is needed when the secret file
    // is referenced directly as a network-tool argument, e.g. `curl -d @.env`,
    // `curl --data-binary @/workspace/.env`, `wget --post-file=.env`.
    re: /\b(curl|wget|nc|ncat|netcat)\b[^\n;&|]*(?:\.env(?:\.[\w.-]+)?|\.npmrc|\.git-credentials|id_rsa\w*|\.pem|\.p12|\.pfx|credentials(?:\.json)?|secrets?\.\w+|\.ssh\/[\w.-]+|\.aws\/credentials)/i,
    reason: 'network tool references a secret/credential file directly (no pipe needed)',
    category: 'exfil',
  },
  {
    re: /\bsudo\b/i,
    reason: 'privilege escalation is not permitted in the sandbox',
    category: 'privilege',
  },
]

// Evaluate a shell command the agent wants to run inside the sandbox.
export function evaluateCommand(command: string): PolicyResult {
  const cmd = String(command || '').slice(0, 4000) // bound regex work
  if (!cmd.trim()) return { decision: 'deny', reason: 'empty command', category: 'invalid' }
  if (commandHasRecursiveRm(cmd))
    return { decision: 'deny', reason: 'recursive delete (rm -r/-R, any target)', category: 'destructive-fs' }
  for (const p of DENY) {
    if (p.re.test(cmd)) return { decision: 'deny', reason: p.reason, category: p.category }
  }
  return ALLOW
}

// Evaluate a relative file path the agent wants to write/read/delete. Must stay
// inside the project workspace — no traversal, no absolute escape.
export function evaluatePath(path: string): PolicyResult {
  const p = String(path || '')
  if (!p.trim()) return { decision: 'deny', reason: 'empty path', category: 'invalid' }
  if (p.includes('\0'))
    return {
      decision: 'deny',
      reason: 'null byte in path',
      category: 'invalid',
    }
  const normalized = p.replace(/\\/g, '/')
  if (normalized.startsWith('/'))
    return {
      decision: 'deny',
      reason: 'absolute path escapes the workspace',
      category: 'traversal',
    }
  if (normalized.split('/').some(seg => seg === '..'))
    return {
      decision: 'deny',
      reason: 'path traversal (..) escapes the workspace',
      category: 'traversal',
    }
  if (p.length > 300) return { decision: 'deny', reason: 'path too long', category: 'invalid' }
  return ALLOW
}

export interface PromptValidation {
  ok: boolean
  value: string
  reason?: string
}

// Validate/sanitize a user prompt before it reaches the agent loop (CLAUDE.md §7).
export function validatePrompt(prompt: unknown): PromptValidation {
  if (typeof prompt !== 'string') return { ok: false, value: '', reason: 'prompt must be a string' }
  const value = prompt.replace(/\0/g, '').trim()
  if (!value) return { ok: false, value, reason: 'prompt is empty' }
  if (value.length > 20000)
    return {
      ok: false,
      value: value.slice(0, 20000),
      reason: 'prompt exceeds 20,000 characters',
    }
  return { ok: true, value }
}
