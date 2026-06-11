// ============================================================
// JARVISFACTORY v11 / Phase 7.1 — Multi-file Builder tools
// ============================================================
// Replaces v8 single-`html` state with a Record<string, string> file map.
// The Builder agent can now create/edit/delete arbitrary files in a tree.
//
// File tree conventions (Phase 7.1 — pre-React):
//   index.html              entry point (always required)
//   styles/main.css         shared styles
//   styles/<screen>.css     per-screen styles (optional)
//   scripts/app.js          main controller
//   scripts/auth.js         auth-specific JS (optional)
//   scripts/<feature>.js    per-feature JS (optional)
//   assets/                 static assets (binary refs stored as data URLs for now)
//   README.md               human-readable summary (Builder may write this)
//
// Phase 7.2+ will add React conventions:
//   app/page.tsx, app/layout.tsx, components/ui/*.tsx, lib/jarvis.ts,
//   package.json, tailwind.config.js, tsconfig.json
// ============================================================

import { validateBuildV2 } from './jarvis-patterns-v2'

// ──────────────────────────────────────────────────────────────
// TOOL SCHEMAS — sent to Claude as `tools` in agentic loop
// ──────────────────────────────────────────────────────────────
export const BUILDER_TOOLS_V2 = [
  {
    name: 'write_file',
    description:
      'Create a new file or overwrite an existing one. Use for any file in the project tree. ' +
      'Paths are relative (no leading slash). Common paths: "index.html", "styles/main.css", "scripts/app.js". ' +
      'After all files are written, call audit_build to check the tree, then finalize.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative file path. Examples: "index.html", "styles/main.css", "scripts/app.js", "components/Login.jsx", "package.json".',
        },
        content: {
          type: 'string',
          description: 'Full file content. For index.html, must start with <!DOCTYPE html>.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'append_to_file',
    description:
      'Insert a chunk into an existing file just before a specified anchor string. ' +
      'Use when adding to a file would exceed the single-tool-call token budget — write a skeleton with write_file, then append_to_file for each chunk. ' +
      'Common anchors: "</main>" or "</body>" (HTML), "/* END_STYLES */" (CSS sections), "// END_HANDLERS" (JS sections), "}" closing the last function (JS append).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path. Must already exist (created by write_file).' },
        chunk: { type: 'string', description: 'The content to insert. Should be self-contained and syntactically valid for that file type.' },
        anchor: { type: 'string', description: 'String to insert before. Must exist exactly once in the file.' },
      },
      required: ['path', 'chunk', 'anchor'],
    },
  },
  {
    name: 'read_file',
    description:
      'Return the current content of a file in the tree. Use sparingly — only when you need to verify the current state of a file before editing. Returns up to 30,000 chars; truncates with marker if longer.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path to read.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'Return an array of every file path currently in the project tree, along with each file size in bytes. Use to verify the tree structure before audit/finalize.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_file',
    description: 'Remove a file from the project tree. Use sparingly — only if you wrote a file by mistake or are reorganizing. Cannot delete the entry point (index.html or app/page.tsx).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path to delete.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'audit_build',
    description:
      'Audit the entire project tree. Checks: (1) entry point exists, (2) all linked CSS/JS files resolve, (3) no localStorage abuse, (4) no demo creds, (5) no broken onclick handler refs across files, (6) Jarvis API used for auth/data. Returns specific issue list per file. Call after all files written, fix issues, then re-audit before finalize.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'finalize',
    description:
      'Mark the build as complete. ONLY call this AFTER audit_build returned clean. Project tree will be shipped to the user (preview + GitHub push).',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One-sentence summary of what was built (shown to user).' },
      },
      required: ['summary'],
    },
  },
]

// ──────────────────────────────────────────────────────────────
// MULTI-FILE BUILDER STATE
// ──────────────────────────────────────────────────────────────
export interface BuilderStateV2 {
  files: Record<string, string>  // path → content
  entryPoint: string             // typically 'index.html' (Phase 7.1) or 'app/page.tsx' (Phase 7.2+)
  finalized: boolean
  finalSummary: string
  iterations: number
  toolCalls: { name: string; ok: boolean; note?: string }[]
}

export function createBuilderStateV2(entryPoint = 'index.html'): BuilderStateV2 {
  return {
    files: {},
    entryPoint,
    finalized: false,
    finalSummary: '',
    iterations: 0,
    toolCalls: [],
  }
}

// ──────────────────────────────────────────────────────────────
// PATH HYGIENE — prevent path traversal, normalize separators
// ──────────────────────────────────────────────────────────────
function sanitizePath(raw: string): string | null {
  if (!raw) return null
  let p = String(raw).trim()
  // Strip leading slashes
  p = p.replace(/^\/+/, '')
  // Normalize backslashes (Windows-style) to forward slashes
  p = p.replace(/\\/g, '/')
  // Reject path traversal attempts
  if (p.includes('..')) return null
  // Reject absolute paths after sanitization
  if (p.startsWith('/')) return null
  // Reject empty after sanitization
  if (!p) return null
  // Cap path depth (sanity check, no project should need >8 levels deep)
  if (p.split('/').length > 8) return null
  // Cap path length
  if (p.length > 200) return null
  return p
}

// ──────────────────────────────────────────────────────────────
// TOOL EXECUTORS — pure functions on state
// ──────────────────────────────────────────────────────────────
type ToolResult = { ok: boolean; content: string }

export function executeBuilderToolV2(
  name: string,
  input: any,
  state: BuilderStateV2,
  ctx: { needsAuth: boolean; moduleMode?: boolean; integrationMode?: boolean }
): ToolResult {
  switch (name) {
    case 'write_file': {
      const rawPath = String(input?.path || '')
      const content = String(input?.content ?? '')
      const path = sanitizePath(rawPath)
      if (!path) return { ok: false, content: `ERROR: invalid path "${rawPath}". Paths must be relative (no leading slash), no ".." traversal, no absolute paths.` }
      if (!content || content.length < 10) return { ok: false, content: `ERROR: content for "${path}" is empty or too short.` }
      // Special validation for entry point
      if (path === state.entryPoint && state.entryPoint === 'index.html' && !content.toLowerCase().includes('<!doctype html')) {
        return { ok: false, content: `ERROR: entry point ${path} must start with <!DOCTYPE html>.` }
      }
      const existed = path in state.files
      state.files[path] = content
      return {
        ok: true,
        content: `${existed ? 'Overwrote' : 'Created'} ${path} (${content.length.toLocaleString()} chars). ` +
          `Tree now has ${Object.keys(state.files).length} files. ` +
          (Object.keys(state.files).length >= 3 ? 'Consider calling audit_build to verify the tree.' : 'Continue adding files.'),
      }
    }

    case 'append_to_file': {
      const rawPath = String(input?.path || '')
      const chunk = String(input?.chunk || '')
      const anchor = String(input?.anchor || '')
      const path = sanitizePath(rawPath)
      if (!path) return { ok: false, content: `ERROR: invalid path "${rawPath}".` }
      if (!(path in state.files)) return { ok: false, content: `ERROR: file "${path}" does not exist. Use write_file to create it first.` }
      if (!chunk) return { ok: false, content: 'ERROR: chunk is empty.' }
      if (!anchor) return { ok: false, content: 'ERROR: anchor is empty.' }
      const fileContent = state.files[path]
      const occurrences = fileContent.split(anchor).length - 1
      if (occurrences === 0) return { ok: false, content: `ERROR: anchor "${anchor}" not found in ${path}. Use read_file to inspect the file, then choose a unique anchor (common: "</main>", "</body>", "</script>", "</style>", "// END_HANDLERS").` }
      if (occurrences > 1) return { ok: false, content: `ERROR: anchor "${anchor}" appears ${occurrences} times in ${path} — must be unique. Add more surrounding context.` }
      state.files[path] = fileContent.replace(anchor, chunk + '\n' + anchor)
      return { ok: true, content: `Appended ${chunk.length.toLocaleString()} chars to ${path} before "${anchor}". File now ${state.files[path].length.toLocaleString()} chars.` }
    }

    case 'read_file': {
      const rawPath = String(input?.path || '')
      const path = sanitizePath(rawPath)
      if (!path) return { ok: false, content: `ERROR: invalid path "${rawPath}".` }
      if (!(path in state.files)) return { ok: false, content: `ERROR: file "${path}" not in tree. Available files: ${Object.keys(state.files).join(', ') || '(none)'}` }
      const max = 30000
      const c = state.files[path]
      if (c.length <= max) return { ok: true, content: c }
      return { ok: true, content: c.slice(0, max) + `\n\n[...truncated. Total length: ${c.length} chars]` }
    }

    case 'list_files': {
      const paths = Object.keys(state.files).sort()
      if (paths.length === 0) return { ok: true, content: '(tree is empty — call write_file to start)' }
      const lines = paths.map(p => `  ${p}  (${state.files[p].length.toLocaleString()} chars)`)
      const total = paths.reduce((a, p) => a + state.files[p].length, 0)
      return { ok: true, content: `Project tree (${paths.length} files, ${total.toLocaleString()} chars total):\n${lines.join('\n')}` }
    }

    case 'delete_file': {
      const rawPath = String(input?.path || '')
      const path = sanitizePath(rawPath)
      if (!path) return { ok: false, content: `ERROR: invalid path "${rawPath}".` }
      if (!(path in state.files)) return { ok: false, content: `ERROR: file "${path}" not in tree.` }
      if (path === state.entryPoint) return { ok: false, content: `ERROR: cannot delete entry point "${path}". Use write_file to overwrite it instead.` }
      delete state.files[path]
      return { ok: true, content: `Deleted ${path}. Tree now has ${Object.keys(state.files).length} files.` }
    }

    case 'audit_build': {
      if (Object.keys(state.files).length === 0) return { ok: false, content: 'ERROR: project tree is empty — write_file at least the entry point first.' }
      if (!(state.entryPoint in state.files)) return { ok: false, content: `ERROR: entry point ${state.entryPoint} is missing from the tree.` }
      const v = validateBuildV2(state.files, state.entryPoint, ctx.needsAuth)
      if (v.valid && v.warnings.length === 0) {
        return { ok: true, content: `AUDIT CLEAN. ${Object.keys(state.files).length} files, no errors, no warnings. You may now call finalize.` }
      }
      const lines: string[] = []
      if (v.errors.length) {
        lines.push('ERRORS (must fix before finalize):')
        v.errors.forEach((e, i) => lines.push(`  ${i + 1}. [${e.file}] ${e.message}`))
      }
      if (v.warnings.length) {
        lines.push('WARNINGS (non-blocking, but consider fixing):')
        v.warnings.forEach((w, i) => lines.push(`  ${i + 1}. [${w.file}] ${w.message}`))
      }
      return { ok: false, content: lines.join('\n') }
    }

    case 'finalize': {
      if (Object.keys(state.files).length === 0) return { ok: false, content: 'ERROR: project tree is empty — cannot finalize.' }
      if (!(state.entryPoint in state.files)) return { ok: false, content: `ERROR: entry point ${state.entryPoint} is missing — cannot finalize.` }
      if (!ctx.moduleMode && !ctx.integrationMode) {
        const v = validateBuildV2(state.files, state.entryPoint, ctx.needsAuth)
        if (!v.valid) {
          return { ok: false, content: `ERROR: Cannot finalize — audit_build still reports errors:\n${v.errors.map(e => `  • [${e.file}] ${e.message}`).join('\n')}\n\nFix these first, re-audit, then finalize.` }
        }
      }
      state.finalized = true
      state.finalSummary = String(input?.summary || 'Build complete.')
      return {
        ok: true,
        content: ctx.moduleMode
          ? `MODULE COMPLETE. Orchestrator will run the next module. (Final audit happens after all modules.)`
          : `BUILD FINALIZED. ${Object.keys(state.files).length} files. Returning to user.`,
      }
    }

    default:
      return { ok: false, content: `ERROR: unknown tool "${name}".` }
  }
}

// ──────────────────────────────────────────────────────────────
// HELPER: collapse multi-file tree → single HTML doc for legacy preview
// Used when Phase 7.1 needs to render in the existing iframe srcDoc
// until Sandpack is wired up (Phase 7.6-ish).
//
// Strategy: read index.html, inline every <link rel="stylesheet" href="...">
// and <script src="..."> whose target is in the tree.
// ──────────────────────────────────────────────────────────────
export function collapseTreeToSingleHtml(files: Record<string, string>, entryPoint = 'index.html'): string {
  const entry = files[entryPoint]
  if (!entry) return '<!-- ERROR: entry point not found in tree -->'
  let html = entry

  // Inline <link rel="stylesheet" href="..."> for files in tree
  html = html.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      const key = href.replace(/^\.\//, '').replace(/^\//, '')
      if (key in files) return `<style data-from="${key}">\n${files[key]}\n</style>`
      return match  // external (e.g. Google Fonts) — keep as-is
    }
  )
  // Same for reverse attr order: href before rel
  html = html.replace(
    /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi,
    (match, href) => {
      const key = href.replace(/^\.\//, '').replace(/^\//, '')
      if (key in files) return `<style data-from="${key}">\n${files[key]}\n</style>`
      return match
    }
  )

  // Inline <script src="..."> for files in tree (preserves order)
  html = html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      const key = src.replace(/^\.\//, '').replace(/^\//, '')
      if (key in files) return `<script data-from="${key}">\n${files[key]}\n</script>`
      return match  // external CDN script — keep as-is
    }
  )

  return html
}
