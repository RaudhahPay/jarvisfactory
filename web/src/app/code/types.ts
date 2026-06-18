export type ProjectFile = { path: string; content: string };

export type BuildPhase = 'queued' | 'generating' | 'writing' | 'installing' | 'starting' | 'ready' | 'error';

export type BuildState = {
  status: 'building' | 'ready' | 'error';
  phase: BuildPhase;
  previewUrl: string;
  files: ProjectFile[];
  error: string;
  seq: number;
};

export type BuildEvent =
  | { type: 'phase'; phase: BuildPhase; detail?: string }
  | { type: 'files'; files: ProjectFile[]; appFiles: ProjectFile[] }
  | { type: 'done'; previewUrl: string; model: string; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: string };
