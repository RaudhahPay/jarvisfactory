// ============================================================
// JARVISFACTORY v2 / Stage 4 — Layer-3 extraction contracts
// ============================================================
// Frozen contracts for the build pipeline. These types pin the seam between
// app/builder/page.tsx (React UI) and lib/build-pipeline.ts (pure orchestrator)
// BEFORE any logic moves. Nothing in this file has runtime behavior — types only.
//
// Sources (verbatim from app/builder/page.tsx at commit 0b334f4):
//   - Phase            → was inline at the useState on line 27
//   - AgentStatus      → was inline `type AgentStatus` on line 105
//   - AgentStatusMap   → shape of the `agentStatus` state record
//   - DesignSpec / DesignSystem / QAReport → fields approveBuild() actually reads
//     (kept loose with an index signature so parseAgentOutput's `any` payloads
//      flow through unchanged — this is a freeze, not a tightening)
// ============================================================

import type { AgentContext } from "./agents";

// ──────────────────────────────────────────────────────────────
// PHASE STATE MACHINE (idle → planning → questioning → approving →
// building → iterating → done). Promoted out of the component verbatim.
// ──────────────────────────────────────────────────────────────
export type Phase =
  | "idle"
  | "planning"
  | "questioning"
  | "approving"
  | "building"
  | "iterating"
  | "done";

// ──────────────────────────────────────────────────────────────
// AGENT STATUS — per-agent progress shown in the UI panel
// ──────────────────────────────────────────────────────────────
export type AgentStatus = "pending" | "working" | "done" | "failed";

export interface AgentStatusEntry {
  status: AgentStatus;
  note?: string;
}

// The four pipeline agents are keyed by id; kept as a string-keyed record to
// match the existing `agentStatus` state exactly (no behavior change).
export type AgentStatusMap = Record<string, AgentStatusEntry>;

export const INITIAL_AGENT_STATUS: AgentStatusMap = {
  architect: { status: "pending" },
  designer: { status: "pending" },
  builder: { status: "pending" },
  qa: { status: "pending" },
};

// ──────────────────────────────────────────────────────────────
// AGENT OUTPUT SHAPES — exactly the fields approveBuild() reads.
// Loose by design (index signature) so parseAgentOutput()'s `any` output is
// assignable without change. Pinning the *read* surface is the contract.
// ──────────────────────────────────────────────────────────────
export interface BuildModule {
  id?: string;
  name: string;
  purpose?: string;
  deps?: string[];
  [k: string]: any;
}

export interface DesignSpec {
  components?: any[];
  data_model?: any[];
  flows?: any[];
  edge_cases?: any[];
  design_principles?: any[];
  build_modules?: BuildModule[];
  [k: string]: any;
}

export interface DesignSystem {
  vibe?: string;
  color_palette?: Record<string, any>;
  components?: Record<string, any>;
  [k: string]: any;
}

export interface QAReport {
  score?: number;
  certified?: boolean;
  passed?: string[];
  failed?: string[];
  warnings?: string[];
  critical_fixes?: string[];
  [k: string]: any;
}

// The approved proposal/plan. Loose — read in many places with optional chaining.
export interface Proposal {
  app_name?: string;
  summary?: string;
  complexity?: string;
  features_mvp?: string[];
  features?: string[];
  screens?: any[];
  data_model?: any[];
  user_flows?: any[];
  [k: string]: any;
}

// ──────────────────────────────────────────────────────────────
// PIPELINE I/O CONTRACT
// ──────────────────────────────────────────────────────────────

// Everything the pure pipeline reads out of React state/props at call time.
// Captured once by the hook so the pipeline closes over nothing mutable.
export interface BuildInput {
  finalPlan: Proposal;
  prompt: string;
  questions: { q: string; options: string[]; [k: string]: any }[];
  qAnswers: Record<number, string>;
  jarvisId: string | null;
  jarvisName: string;
  industry?: string;
  brandName?: string;
  brandColour?: string;
  attachments: { name: string; type: string }[];
}

// The three genuinely-impure dependencies the pipeline cannot import directly:
//   - callClaude / callClaudeAgentic : network + retry logging (live in lib/claude-client)
//   - captureScreenshot              : DOM-bound (html2canvas) — must stay in the component
// Everything else (parseAgentOutput, loadJarvisLessons, formatLessonsForPrompt,
// validateBuild, promptRequiresAuth, runBuilderAgent, agent defs) is pure lib and
// is imported by the pipeline directly — NOT injected.
export interface BuildDeps {
  callClaude: (
    sys: string,
    msg: string,
    maxTok?: number,
    useAttachments?: boolean,
    model?: string,
    imageDataUrl?: string,
  ) => Promise<string>;
  callClaudeAgentic: (params: {
    system: string;
    messages: any[];
    tools: any[];
    max_tokens: number;
    model?: string;
  }) => Promise<{ content: any[]; stop_reason?: string }>;
  captureScreenshot: (htmlCode: string) => Promise<string | null>;
}

// What the pure pipeline returns. Persistence (Supabase insert, injectBackend,
// recordBuildOutcome, extractLessonsFromQA) happens in the hook AFTER this resolves.
export interface BuildResult {
  code: string;
  qaReport: QAReport | null;
  iterations: number;
  toolCallCount: number;
}

// ──────────────────────────────────────────────────────────────
// PROGRESS EVENTS — the pipeline emits these; the hook maps them onto
// setPhase / setAgentStatus / addLog / addChat / setTokens / etc.
// No setState ever happens inside the pipeline.
// ──────────────────────────────────────────────────────────────
export type BuildEvent =
  | { type: "phase"; phase: Phase }
  | { type: "log"; msg: string; level: string }
  | { type: "chat"; html: string }
  | { type: "agentStatus"; agent: string; status: AgentStatus; note?: string }
  // reset all four agents to their initial pending state (was setAgentStatus({...}))
  | { type: "agentReset" }
  // mark whichever agents are currently 'working' as 'failed' (error handler)
  | { type: "agentFailWorking"; note: string }
  | { type: "tokens"; value: string }
  | { type: "qaReport"; report: QAReport }
  | { type: "builtCode"; code: string };

export type EmitFn = (event: BuildEvent) => void;

// Re-export AgentContext so pipeline consumers have a single import surface.
export type { AgentContext };
