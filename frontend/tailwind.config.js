/** @type {import('tailwindcss').Config} */
// No colours here: every colour of the app is a token in `app/ui/theme.ts`.
export default {
  content: [
    "./index.html",
    "./{app,graph-editor,gui-editor}/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
