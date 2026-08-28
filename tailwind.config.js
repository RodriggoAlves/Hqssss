/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        netflix: {
          dark: '#141414',
          gray: '#2f2f2f',
          red: '#e50914',
        }
      }
    },
  },
  plugins: [],
}
