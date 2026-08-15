/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#051427',
        'ink-2': '#0B2138',
        gold: '#C79439',
        'gold-2': '#E4B95B',
        paper: '#F7F4EE',
        line: '#E5DFD2',
        ok: '#1F7A5C',
        bad: '#B3402E'
      },
      fontFamily: {
        body: ['Tajawal', 'sans-serif'],
        display: ['Cairo', 'Tajawal', 'sans-serif']
      },
      boxShadow: {
        card: '0 18px 44px -18px rgba(5,20,39,.45)',
        soft: '0 8px 28px -14px rgba(5,20,39,.22)'
      }
    }
  },
  plugins: []
}
