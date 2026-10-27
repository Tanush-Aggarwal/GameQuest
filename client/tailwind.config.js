// Colours come from CSS variables (src/styles/tokens.css is the only source of colour). Tailwind 3 cannot
// put an opacity on a plain var() colour, so `bg-bg/50`, `from-bg/90` or `border-accent/30` would silently
// generate NOTHING. Each colour is therefore a function: with an opacity it becomes
// color-mix(in srgb, var(--token) N%, transparent), without one it stays the bare variable.
const token =
  (name) =>
  ({ opacityValue }) =>
    opacityValue === undefined || opacityValue === '1'
      ? `var(--${name})`
      : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;

const names = [
  'bg',
  'surface',
  'surface-raised',
  'border',
  'text',
  'text-muted',
  'accent',
  'accent-fg',
  'accent-text',
  'reward',
  'danger',
  'success',
  'warning',
  'info',
  'status-playing',
  'status-completed',
  'status-backlog',
  'status-wishlist',
  'status-dropped',
];

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((name) => [name, token(name)])),
      // `text-accent` (and `decoration-accent`) is the accent in its readable-on-dark form; `bg-accent`, `border-accent` and
      // `ring-accent` keep the brand colour itself. Text on an accent fill is `text-accent-fg`.
      textColor: { accent: token('accent-text') },
      textDecorationColor: { accent: token('accent-text') },
      borderRadius: { card: '12px', control: '8px' },
      // The sign-in collage: a column of covers, repeated twice, slides by exactly one copy and starts over unseen.
      keyframes: {
        'drift-up': { from: { transform: 'translateY(0)' }, to: { transform: 'translateY(-50%)' } },
        'drift-down': { from: { transform: 'translateY(-50%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        'drift-up': 'drift-up 90s linear infinite',
        'drift-down': 'drift-down 110s linear infinite',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
