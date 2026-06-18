// Shared workspace UI state types (view mode + device). The build/preview state
// lives in types.ts; this file is only the editor chrome's view state.

export type ViewMode = 'preview' | 'file' | 'code' | 'layers';
export type DeviceMode = 'desktop' | 'mobile';

export const DEVICE_WIDTH: Record<DeviceMode, number | null> = {
  desktop: null, // full width
  mobile: 390,
};
