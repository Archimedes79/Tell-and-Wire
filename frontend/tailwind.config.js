/** @type {import('tailwindcss').Config} */
// No colours here: every colour of the app is a token in `deployment/gui/kit/ui/theme.ts`.
export default {
  content: [
    "./index.html",
    "./{editor,deployment}/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
