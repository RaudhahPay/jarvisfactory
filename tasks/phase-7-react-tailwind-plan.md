# Phase 7 — React + Tailwind multi-file output

> **⚠️ SUPERSEDED — May 16, 2026.**
>
> This plan has been replaced by the **Phase 7 Strategic Reset**. The original 6-week sequence (multi-file HTML splitter → React baseline → Tailwind → shadcn → JARVIS hook → deploy) walked through an intermediate "multi-file HTML" target that has no production value.
>
> The replacement is a 14-week sequence that jumps directly to producing real Next.js 15 + Tailwind + shadcn + Supabase + Cloudflare Workers projects per the **Software Development SOP §4.1**.
>
> **Active documents:**
> - Strategic replan: `/Users/coachfadzilhashim/jarvisuniverse/Phase-7-RESET-Strategic-Replan.md`
> - PRD: `/Users/coachfadzilhashim/jarvisuniverse/PRD-Phase-7-NextJS-Pipeline.md`
> - Architecture note: `/Users/coachfadzilhashim/jarvisuniverse/ArchNote-Phase-7-NextJS-Pipeline.md`
>
> The content below is preserved for historical reference. Do not use it as the current plan.
>
> ---

*Planning document. Not yet implemented. Estimated effort: 4-6 weeks of focused work.*
*Drafted by Claude after Phases 1-6 shipped. Updated: May 8, 2026.*

---

## Why this matters

Currently JarvisFactory generates **single-file HTML apps** (one big index.html with inline CSS and JS). This was the right starting point — fast to ship, easy to preview in an iframe, easy to push to a single GitHub file. But it has real ceilings:

1. **Single file = single Builder call risk.** Even with modular `append_html`, the whole app lives in ONE state. One bug breaks everything.
2. **No component reuse.** Every "button" is rewritten per screen. Same with "card", "modal", etc.
3. **Tailwind can't be a default.** Inline CSS doesn't compose; Tailwind needs the proper build pipeline.
4. **No real production deploy story.** Single HTML can't ship to Vercel/Railway like a real app.
5. **Comparison to Lovable.** They generate full Next.js + Tailwind + shadcn/ui projects. That's why their output looks 5× more polished by default.

Phase 7 is the **architectural upgrade that puts us in Lovable's league**. Until we ship this, we're producing demo-class apps. After we ship this, we're producing production-class apps.

---

## What changes — high level

| Today (v10) | After Phase 7 |
|---|---|
| Single `index.html` with inline CSS+JS | Multi-file project: `app/`, `components/`, `lib/`, `package.json` |
| Vanilla JavaScript with `window.Jarvis` | React 18 + Next.js 14 App Router |
| Inline `<style>` tags | Tailwind CSS with shared `tailwind.config.js` |
| `Jarvis.signup(...)` global | `useJarvis()` hook + Supabase JS client |
| Preview in iframe srcDoc | Preview via Sandpack-react OR StackBlitz embed OR local Next.js build |
| GitHub push: 1 file (index.html) | GitHub push: dozens of files (full repo) |
| Builder tools: `write_full_html`, `append_html` | Builder tools: `write_file(path, content)`, `read_file(path)`, `list_files()`, `delete_file(path)` |

---

## Sub-phases (incremental shipping)

### Phase 7.1 — Multi-file foundation (Week 1-2)

**Goal:** Builder can produce multi-file projects. Preview works. No React yet — just split single HTML into multiple HTML/CSS/JS files.

- New `BUILDER_TOOLS_V2`:
  - `write_file(path, content)`
  - `append_to_file(path, content, anchor)`
  - `read_file(path)`
  - `list_files()`
  - `delete_file(path)`
  - `audit_build()` — adapted for multi-file
  - `finalize(summary)`
- New `BuilderStateV2`: `Record<string, string>` instead of single `html` string
- Architect produces a `file_tree` array in design_spec: `[{path: "index.html"}, {path: "styles/main.css"}, {path: "scripts/auth.js"}]`
- Preview: combine files into a virtual file system, serve via Sandpack or iframe with proper imports
- GitHub push: iterate over file_tree, PUT each file

**Risk:** Preview is the hard part. Sandpack is the most likely answer (free, embeddable). Backup: build a tiny static file server inside JarvisFactory that resolves relative paths.

### Phase 7.2 — React baseline (Week 3)

**Goal:** Builder produces React (not vanilla JS) files. JSX. Standard React patterns.

- Update Builder system prompt + Designer system prompt: "you produce React components, not HTML"
- Project structure scaffold:
  ```
  app/
    page.tsx
    layout.tsx
    components/
    lib/jarvis.ts  ← React-flavored Jarvis client
  package.json
  tailwind.config.js
  ```
- Sandpack template: `react-ts` or `nextjs`
- Audit: parse JSX for undefined hooks, missing imports, etc.

**Risk:** AST-level audit is harder than regex on HTML. Use Anthropic's QA agent for semantic checks; reserve regex for cheap structural checks.

### Phase 7.3 — Tailwind + design tokens (Week 4)

**Goal:** Designer outputs Tailwind config; Builder uses Tailwind classes everywhere.

- Designer's output now produces a `tailwind.config.js` snippet (extends theme with brand colors, fonts, spacing)
- Builder writes Tailwind class names instead of inline styles
- Sandpack template includes Tailwind preconfigured
- Old `inline CSS` patterns explicitly forbidden in Builder prompt

**Risk:** Tailwind class explosion if Builder doesn't reuse patterns. Mitigate via shared component library.

### Phase 7.4 — shadcn/ui as default (Week 5)

**Goal:** Builder reaches for shadcn/ui components instead of inventing buttons/inputs/dialogs every time.

- Pre-install shadcn primitives in the project scaffold (Button, Input, Card, Dialog, Toast, Sheet, etc.)
- Builder system prompt: "use the existing shadcn components from `@/components/ui/*`. Do NOT reinvent. Only add new components when shadcn doesn't have what you need."
- Designer's output ties shadcn variants to brand palette

**Risk:** Builder ignores the convention and rewrites. Mitigate via strict prompt + audit gate that flags inline button divs.

### Phase 7.5 — Production-class JARVIS hook (Week 6)

**Goal:** `lib/jarvis.ts` is a properly typed React hook + Supabase client, not a globals-on-window hack.

- `useJarvis()` returns `{ user, signup, login, logout, saveData, loadData, isLoggedIn, listUsers }`
- Backed by `createBrowserClient` from `@supabase/ssr`
- TypeScript types for the full API
- Auth state managed via React context, not localStorage globals
- Loading/error states baked in

**Risk:** Existing apps (v6-v10 HTML apps) break because they reference `window.Jarvis`. Keep the global glue as a compatibility shim until the user migrates.

### Phase 7.6 — Preview & deploy infrastructure (Week 7+)

**Goal:** Users can preview multi-file projects in JarvisFactory AND deploy to Vercel/Railway with one click.

- Sandpack-react preview: bundle the file_tree, render live in an iframe
- One-click Vercel deploy: use Vercel's deploy hooks or git integration
- Live URL per app (subdomain or custom domain)
- Phase 8 (billing) ties to deploy usage

**Risk:** Sandpack's bundle size is large (~MB). Lazy-load only when user clicks Preview tab.

---

## What this enables (business case)

After Phase 7 ships, JarvisFactory can credibly claim:

- "Production-class React apps, not demos"
- "Tailwind + shadcn — looks beautiful by default"
- "Real Next.js, deployable to Vercel/Railway in one click"
- "Code lives on your GitHub — you own everything"

That positions JarvisFactory **on par with Lovable architecturally**, while keeping our differentiating moats (Bahasa, halal-first, plan-first PDF, self-learning JARVIS, Brainy Bunch distribution).

---

## What's required to start

Coach Fadzil's input needed before Phase 7 work begins:

1. **Confirm the scope** — agree Phase 7 is the right multi-week investment, not a side bet.
2. **Backwards compatibility decision** — do we keep generating single-file HTML for the Starter tier (cheaper, faster), and reserve React output for Builder/Agency tiers? My recommendation: yes, two-track offering.
3. **Preview provider** — Sandpack-react is the obvious choice (free, embeddable, fast). Stackblitz is the alternative (better DX but heavier). Should validate which works in our setup.
4. **shadcn/ui scope** — start with the 8 most common components (Button, Input, Label, Card, Dialog, Sheet, Toast, Table) and expand. Or include all 40+ from day one (slower init, but more capability)?
5. **Deploy partner** — Vercel (default for Next.js, but has cost concerns at scale) vs Railway (your current host, cheaper but less plug-and-play for Next).

---

## Risks honestly listed

- **Sandpack bundle size.** Solvable but adds ~500KB to page load.
- **GitHub API rate limits.** Each app push = many files = many API calls. Mitigation: batch via Git Data API (trees + blobs in one commit).
- **Existing apps incompatible.** v1-v10 apps don't transfer to v11 React format. Mitigation: keep dual generation pipelines + provide a "convert to React" tool.
- **Builder may hallucinate React anti-patterns.** Compounding bugs across files harder to debug than single-file. Mitigation: stricter Architect contracts + Builder audit gates per file.
- **Compute cost goes up.** More files = more agent context = more tokens. Estimated 2-3× per build vs current. Pricing model needs to accommodate.

---

## Decision needed

**Option A — Start Phase 7 now** as a 6-week dedicated effort. Coach Fadzil and Claude work session-by-session through 7.1 → 7.6. Other features (Phase 8 billing, Phase 9 mobile) wait.

**Option B — Defer Phase 7** until JarvisFactory has paying users on the current architecture. Use revenue + user feedback to fund and prioritize the rewrite. Continue with Phase 8 (billing) and small fixes first.

**Option C — Hybrid: Phase 7.1 only** (multi-file foundation, no React yet). Ships in 1-2 weeks. Sets up the architecture without committing to the full rewrite. Lets us test multi-file builds with simple HTML before the React jump.

**My recommendation: Option C.** Validate the multi-file architecture with the cheapest possible change first. If that works, commit to 7.2-7.6. If it doesn't work cleanly, we know early and can correct course.

---

*Awaiting Coach Fadzil's decision: A, B, or C.*
