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
      borderRadius: { card: '12px', control: '8px' },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
