import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Halal-default palette — deep teal + warm gold (same as JarvisFactory's Designer agent defaults)
        ink: '#0e1216',
        slate: '#3f4654',
        mist: '#a3aab5',
        cloud: '#f3f5f7',
        teal: {
          DEFAULT: '#0d8073',
          dark: '#0a5e55',
          glow: '#1ba892',
        },
        gold: '#c9941a',
        coral: '#e25e6c',
        sage: '#4faa6e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      backgroundImage: {
        'hero-gradient': 'radial-gradient(ellipse at top, rgba(27, 168, 146, 0.20), transparent 60%), radial-gradient(ellipse at bottom right, rgba(201, 148, 26, 0.10), transparent 50%)',
      },
    },
  },
  plugins: [],
}

export default config
