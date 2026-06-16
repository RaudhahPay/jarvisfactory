// ezclaude design tokens — the single source of truth for the app's visual
// language. Extracted from the Landing page (`/`), which is the canonical "clean"
// reference. Every route should consume these instead of hardcoding values so the
// product stays visually coherent.

export const theme = {
  color: {
    accent: '#10b981',     // ezclaude teal
    accentAlt: '#7b6fff',  // violet (logo gradient partner)
    ink: '#0a0a18',        // near-black ink (primary text + solid buttons)
    inkSoft: '#3a3a52',    // secondary text
    muted: '#5a5a72',      // tertiary text / descriptions
    faint: '#9a9aac',      // captions, periods, placeholders
    bg: '#ffffff',         // page background
    surface: '#faf9f6',    // off-white section background
    surfaceWarm: '#f7f5ef', // warm panel (prompt box)
    border: '#ececf3',      // hairline card border
    borderInput: '#e3e3ee', // input / outline-button border
  },
  font: {
    sans: "'Plus Jakarta Sans','DM Sans',sans-serif",
    body: "'DM Sans',sans-serif",
  },
  radius: {
    pill: 9,
    button: 11,
    card: 18,
    panel: 26,
  },
  shadow: {
    card: '0 8px 30px -20px rgba(40,30,80,0.25)',
    panel: '0 24px 60px -24px rgba(40,30,80,0.28), 0 2px 6px rgba(0,0,0,0.04)',
    accent: '0 18px 50px -24px rgba(16,185,129,0.4)',
  },
} as const;

// Reusable building blocks (match Landing's button language exactly).
export const ui: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: theme.color.bg,
    color: theme.color.ink,
    fontFamily: theme.font.sans,
  },
  logoMark: {
    width: 24,
    height: 24,
    borderRadius: 7,
    background: `linear-gradient(135deg, ${theme.color.accent}, ${theme.color.accentAlt})`,
    boxShadow: '0 2px 8px rgba(16,185,129,0.35)',
  },
  btnSolid: {
    padding: '9px 18px',
    background: theme.color.ink,
    color: '#fff',
    border: 'none',
    borderRadius: theme.radius.button,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnOutline: {
    padding: '9px 18px',
    background: '#fff',
    color: theme.color.ink,
    border: `1px solid ${theme.color.borderInput}`,
    borderRadius: theme.radius.button,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    background: '#fff',
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.card,
    boxShadow: theme.shadow.card,
    padding: '30px 26px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: `1px solid ${theme.color.borderInput}`,
    borderRadius: theme.radius.button,
    fontSize: 15,
    fontFamily: theme.font.body,
    outline: 'none',
    color: theme.color.ink,
    background: '#fff',
  },
};
