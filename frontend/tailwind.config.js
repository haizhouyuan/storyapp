const defaultTheme = require('tailwindcss/defaultTheme');

const withOpacity = (variable) => ({ opacityValue }) => {
  if (opacityValue === undefined) {
    return `rgb(var(${variable}))`;
  }
  return `rgb(var(${variable}) / ${opacityValue})`;
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "../shared/src/**/*.{js,jsx,ts,tsx}",
  ],
  mode: 'jit',
  theme: {
    extend: {
      fontFamily: {
        quicksand: ['Quicksand', ...defaultTheme.fontFamily.sans],
        nunito: ['Nunito', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        points: {
          primary: withOpacity('--points-primary'),
          'primary-dark': withOpacity('--points-primary-dark'),
          secondary: withOpacity('--points-secondary'),
          accent: withOpacity('--points-accent'),
          'accent-soft': withOpacity('--points-accent-soft'),
          magenta: withOpacity('--points-magenta'),
          success: withOpacity('--points-success'),
          warning: withOpacity('--points-warning'),
          danger: withOpacity('--points-danger'),
          surface: withOpacity('--points-surface'),
          'surface-elevated': withOpacity('--points-surface-elevated'),
          hud: withOpacity('--points-hud-bg'),
          border: withOpacity('--points-border'),
          'border-strong': withOpacity('--points-border-strong'),
          disabled: withOpacity('--points-disabled'),
          text: withOpacity('--points-text'),
          'text-strong': withOpacity('--points-text-strong'),
          'text-muted': withOpacity('--points-text-muted'),
          'text-inverse': withOpacity('--points-text-inverse'),
        },
        // legacy 子主题，逐步替换
        child: {
          mint: '#A8E6CF',
          cream: '#FFF8DC',
          yellow: '#FFEB9C',
          blue: '#B3D9FF',
          green: '#B8E6B8',
          orange: '#FFD4A3',
          pink: '#FFB3BA',
          gold: '#FFD700',
          purple: '#DDA0DD',
          gray: {
            100: '#F7FAFC',
            200: '#EDF2F7',
            300: '#E2E8F0',
            400: '#CBD5E0',
            500: '#A0AEC0',
          },
        },
      },
      borderRadius: {
        'points-sm': 'var(--radius-sm)',
        'points-md': 'var(--radius-md)',
        'points-lg': 'var(--radius-lg)',
        'points-xl': 'var(--radius-xl)',
        'points-pill': 'var(--radius-pill)',
      },
      boxShadow: {
        'points-soft': 'var(--shadow-soft)',
        'points-glow': '0 0 0 3px rgba(88, 204, 2, 0.25)',
        'points-pressed': 'var(--shadow-pressed)',
      },
      backgroundImage: {
        'points-hero': 'var(--gradient-primary)',
        'points-surface-glass': 'var(--gradient-surface)',
        'points-magenta-wave': 'var(--gradient-magenta)',
      },
      spacing: {
        'points-gutter': 'var(--radius-lg)',
        'points-stack': 'clamp(1.5rem, 3vw, 3rem)',
      },
      dropShadow: {
        points: '0 12px 18px rgba(88, 204, 2, 0.22)',
      },
      animation: {
        'pulse-celebrate': 'pulseCelebration 2.5s var(--transition-snappy) infinite',
        'float-soft': 'floatSoft 6s ease-in-out infinite',
      },
      keyframes: {
        pulseCelebration: {
          '0%, 100%': { transform: 'scale(1)', filter: 'saturate(110%)' },
          '50%': { transform: 'scale(1.05)', filter: 'saturate(130%)' },
        },
        floatSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
  ],
};
