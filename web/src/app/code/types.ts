export type ProjectFile = { path: string; content: string };

export type BuildState = {
  status: 'building' | 'ready' | 'error';
  previewUrl: string;
  files: ProjectFile[];
  error: string;
  seq: number;
};
