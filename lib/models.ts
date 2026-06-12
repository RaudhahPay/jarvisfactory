// ============================================================
// ezclaude — selectable Claude models (shared by UI + routes)
// ============================================================
export interface ModelInfo {
  id: string
  label: string
  blurb: string
}

export const MODELS: ModelInfo[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    blurb: 'Fastest · cheapest',
  },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', blurb: 'Balanced (default)' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', blurb: 'Most capable' },
  { id: 'claude-fable-5', label: 'Fable 5', blurb: 'Creative' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Validate a client-supplied model id against the allowlist (never trust raw input).
export function resolveModel(m?: unknown): string {
  return typeof m === 'string' && MODELS.some(x => x.id === m) ? m : DEFAULT_MODEL
}
