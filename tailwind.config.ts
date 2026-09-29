import type { Config } from 'tailwindcss';

// Akili palette: an exam-hall desk. Chalk-white page, navy ink for text,
// biro blue for actions, a highlighter for "you are here", and the two
// marking colours (green tick, red pencil) for right and wrong.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chalk: '#F4F5F7',
        paper: '#FFFFFF',
        ink: { DEFAULT: '#16204A', soft: '#2A3566' },
        muted: '#5B6480',
        rule: '#DCE0E9',
        biro: { DEFAULT: '#2F45D0', dark: '#2336A8', wash: '#E9ECFB' },
        marker: { DEFAULT: '#F5D547', wash: '#FDF6D3' },
        tick: { DEFAULT: '#14784C', wash: '#E4F4EC' },
        redpen: { DEFAULT: '#C7342A', wash: '#FBE9E7' },
      },
      fontFamily: {
        ui: ['var(--font-ui)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        read: ['var(--font-read)', 'Georgia', 'Cambria', 'serif'],
      },
      keyframes: {
        sheet: { from: { transform: 'translateY(24px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        slide: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(350%)' } },
      },
      animation: {
        sheet: 'sheet .22s ease-out',
        fade: 'fade .18s ease-out',
        slide: 'slide 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
