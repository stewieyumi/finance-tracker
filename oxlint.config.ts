import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "react"],
  rules: {
    "react/rules-of-hooks": "error",
    "eslint/no-debugger": "error",
    "eslint/no-dupe-keys": "error",
    "eslint/no-unreachable": "error",
  },
});
