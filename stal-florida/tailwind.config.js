/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ocean: { DEFAULT: '#2D6A7A', light: '#E8F4F8' },
        forest: { DEFAULT: '#2D5A3A', light: '#E8F4E8' },
        warm: { DEFAULT: '#7A4A2D', light: '#FFF5F0' },
        cream: '#F5F2ED',
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
        sans: ['Calibri', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
