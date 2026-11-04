
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      boxShadow: {
        sm: "var(--shadow-contact)",
        DEFAULT: "var(--shadow-surface)",
        md: "var(--shadow-surface)",
        lg: "var(--shadow-floating)",
        xl: "var(--shadow-floating)",
        "2xl": "var(--shadow-dialog)",
      },
      borderColor: {
        subtle: "color-mix(in srgb, var(--border-subtle) calc(<alpha-value> * 100%), transparent)",
        default: "color-mix(in srgb, var(--border-default) calc(<alpha-value> * 100%), transparent)",
        strong: "color-mix(in srgb, var(--border-strong) calc(<alpha-value> * 100%), transparent)",
      },
      textColor: {
        strong: "var(--text-strong)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        disabled: "var(--text-disabled)",
      },
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
