/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        app: "var(--bg-app)",
        shell: "var(--bg-shell)",
        surface: "var(--bg-surface)",
        "surface-elevated": "var(--bg-surface-elevated)",
        "surface-sunken": "var(--bg-surface-sunken)",
        "surface-input": "var(--bg-surface-input)",
        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
      },
    },
  },
  plugins: [],
}
