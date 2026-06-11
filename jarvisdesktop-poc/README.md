# JarvisDesktop — Proof of Concept

**3-day prototype.** Goal: feel whether "Cowork for vibe coders" actually clicks before committing to a 10-week build.

A native Mac app. Beautiful UI. Voice-friendly. Claude inside doing the actual work. Builds whatever you describe — Mac scripts, web apps, Excel automations, anything Claude can do — into real files on your computer. Customer never sees a terminal, never opens an Anthropic account, never reads code unless they want to.

## Stack

- **Tauri 2** (Rust shell + native WebView, ~10MB bundle, Apple Silicon native)
- **React 19** + **TypeScript** + **Tailwind** (inside the WebView)
- **Claude Sonnet 4.6** via Anthropic Messages API with tool_use
- **Web Speech API** for voice (Mac native, no extra dependency)
- **JSON persistence** for memory (upgrade to SQLite post-POC)
- **Sandboxed filesystem + bash tools** scoped to `~/JarvisDesktop/Projects/<project>/`

## What the POC proves

| Question | Pass criteria |
|---|---|
| Does it look like Lovable, not Cowork? | Coach opens the app — first reaction is "wow", not "looks like a developer tool" |
| Does it feel agentic? | Coach says "build me a markdown notes app" — sees friendly progress messages — app appears in his ~/JarvisDesktop/Projects folder — opens in browser automatically |
| Does it remember? | Coach says "make the next one dark by default" — JARVIS remembers the preference, applies it without being asked next time |
| Does voice work? | Coach taps the mic, speaks a prompt, JARVIS does the right thing |
| Is bundle size reasonable? | Under 25MB DMG download |
| Is launch fast? | App is usable within 2 seconds of clicking icon |

## Run it

```bash
# Prerequisites (one-time)
xcode-select --install                   # Apple Command Line Tools
brew install rust pnpm                   # If not already

# From this directory
pnpm install                             # ~30s
pnpm tauri dev                           # ~2min first build, then instant on rebuild
```

A native window opens. Enter your Anthropic API key on first run (stored in macOS Keychain). Start chatting.

## Demo flow (try this first)

1. Launch the app
2. In the chat: **"Build me a markdown notes app I can use locally on my Mac"**
3. Watch JARVIS think → plan → write files
4. When done, the notes app opens in your browser
5. Files are in `~/JarvisDesktop/Projects/markdown-notes/`
6. Continue the conversation: **"Add dark mode"** — JARVIS edits the same project
7. Type or say: **"Remember I always want dark mode by default"** — JARVIS commits this to memory
8. Start a new project: **"Build me a habit tracker"** — JARVIS applies dark mode without being asked

If steps 1-8 work fluently, the POC has answered "yes" to the central question.

## What's NOT in the POC (scoped out, by design)

- Token credit purchasing (POC uses your own Anthropic key)
- Multi-tab editing
- App marketplace / template gallery
- Multi-language UI
- Auto-update
- Code signing / notarization
- The Architect / Designer / QA agents from JarvisFactory (just one Builder agent for POC)
- Output templates beyond simple HTML projects

These all go in the full build if the POC validates.

## Files

```
jarvisdesktop-poc/
├── package.json              Frontend deps
├── vite.config.ts            Vite + React + Tauri integration
├── tsconfig.json             Strict TS
├── tailwind.config.ts        Brand palette (deep teal + warm gold)
├── postcss.config.js
├── index.html                Vite entry
├── src/                      React frontend
│   ├── main.tsx              React root
│   ├── App.tsx               Main UI shell
│   ├── styles.css            Tailwind
│   ├── lib/
│   │   ├── api.ts            invoke() wrappers
│   │   └── types.ts          shared types
│   └── components/
│       ├── ChatInput.tsx
│       ├── MessageList.tsx
│       ├── VoiceButton.tsx
│       └── ApiKeyDialog.tsx
├── src-tauri/                Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs           Tauri entry
│       ├── lib.rs            Module wiring
│       ├── claude.rs         Anthropic API + tool_use loop
│       ├── tools.rs          Filesystem + bash, sandboxed
│       ├── memory.rs         Persistent memory (JSON for POC)
│       ├── projects.rs       Active project management
│       └── keychain.rs       macOS Keychain API key storage
└── README.md (this file)
```

## License

Proprietary. © 2026 Raudhah Tech / Coach Fadzil Hashim.
