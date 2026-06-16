import type { LucideIcon } from 'lucide-react';
import { theme } from '@/web/src/lib/theme';

type Tone = 'ink' | 'inkSoft' | 'muted' | 'faint' | 'accent' | 'white';

const toneColor: Record<Tone, string> = {
  ink: theme.color.ink,
  inkSoft: theme.color.inkSoft,
  muted: theme.color.muted,
  faint: theme.color.faint,
  accent: theme.color.accent,
  white: '#ffffff',
};

/**
 * Single icon convention for the app. Wraps a lucide-react icon so every call
 * site shares one size scale and the theme.ts color tones (via SVG currentColor).
 * Use instead of hardcoded emoji. Example: <Icon as={Github} tone="muted" />
 */
export function Icon({
  as: LucideCmp,
  size = 16,
  tone = 'ink',
  strokeWidth = 2,
  style,
}: {
  as: LucideIcon;
  size?: number;
  tone?: Tone;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <LucideCmp
      size={size}
      color={toneColor[tone]}
      strokeWidth={strokeWidth}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
