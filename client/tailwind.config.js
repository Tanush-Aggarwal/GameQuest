/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        border: 'var(--border)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        reward: 'var(--reward)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        info: 'var(--info)',
        'status-playing': 'var(--status-playing)',
        'status-completed': 'var(--status-completed)',
        'status-backlog': 'var(--status-backlog)',
        'status-wishlist': 'var(--status-wishlist)',
        'status-dropped': 'var(--status-dropped)',
      },
      borderRadius: { card: '12px', control: '8px' },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
