
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
        inverse: "rgb(var(--color-inverse) / <alpha-value>)",
        app: "var(--bg-app)",
        shell: "var(--bg-shell)",
        surface: "var(--bg-surface)",
        "surface-low": "var(--bg-surface-low)",
        "surface-elevated": "var(--bg-surface-elevated)",
        "surface-high": "var(--bg-surface-high)",
        "surface-sunken": "var(--bg-surface-sunken)",
        "surface-lowest": "var(--bg-surface-lowest)",
        "surface-input": "var(--bg-surface-input)",
        "surface-modal": "var(--bg-surface-modal)",

        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",

        "text-strong": "var(--text-strong)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "text-faint": "var(--text-faint)",
        "text-disabled": "var(--text-disabled)",

        "fill-strong": "var(--bg-fill-strong)",
        "fill": "var(--bg-fill)",
        "fill-subtle": "var(--bg-fill-subtle)",
      },
    },
  },
  plugins: [],
}
