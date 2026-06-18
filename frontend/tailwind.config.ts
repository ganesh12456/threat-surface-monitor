import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'cyber-bg': '#0a0e1a',
        'cyber-surface': '#0f1629',
        'cyber-surface-2': '#131d35',
        'cyber-border': '#1e2d4e',
        'cyber-cyan': '#00d4ff',
        'cyber-cyan-dim': '#0099bb',
        'cyber-purple': '#7b68ee',
        'cyber-green': '#00ff88',
        'cyber-green-dim': '#00cc6a',
        'cyber-red': '#ff3366',
        'cyber-orange': '#ff8c42',
        'cyber-yellow': '#ffd700',
        'cyber-text': '#e2e8f0',
        'cyber-text-dim': '#94a3b8',
        'cyber-text-muted': '#475569',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-cyan': 'pulse-cyan 2s infinite',
        'scan-line': 'scan-line 3s linear infinite',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'pulse-cyan': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'fade-in-up': {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.8)' },
        },
      },
      backgroundImage: {
        'cyber-grid': `
          linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px)
        `,
        'cyber-gradient': 'linear-gradient(135deg, #0a0e1a 0%, #0f1629 50%, #0a0e1a 100%)',
      },
      backgroundSize: {
        'cyber-grid': '40px 40px',
      },
      boxShadow: {
        'cyber-cyan': '0 0 20px rgba(0, 212, 255, 0.3)',
        'cyber-red': '0 0 20px rgba(255, 51, 102, 0.3)',
        'cyber-green': '0 0 20px rgba(0, 255, 136, 0.3)',
        'cyber-purple': '0 0 20px rgba(123, 104, 238, 0.3)',
        'cyber-orange': '0 0 20px rgba(255, 140, 66, 0.3)',
      },
    },
  },
  plugins: [],
}

export default config
