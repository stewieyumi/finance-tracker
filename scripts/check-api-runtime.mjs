import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(join(tmpdir(), "ft-api-runtime-"));
try {
  // Match the transpiled server modules, then load them with Node rather than Vite's resolver.
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"),
    "-p", "tsconfig.api.json", "--noEmit", "false", "--outDir", output], { cwd: root, stdio: "inherit" });
  writeFileSync(join(output, "package.json"), JSON.stringify({ type: "module" }));
  symlinkSync(join(root, "node_modules"), join(output, "node_modules"), "junction");
  const entries = readdirSync(join(root, "api"))
    .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map(name => pathToFileURL(join(output, "api", name.replace(/\.ts$/, ".js"))).href);
  // Importing only checks startup. No handler is invoked and no user data or provider is accessed.
  execFileSync(process.execPath, ["--input-type=module", "--eval", `
    for (const url of ${JSON.stringify(entries)}) {
      const entry = await import(url);
      if (typeof entry.default !== "function") throw new Error("API handler missing: " + url);
    }
    console.log("Native Node imports passed for ${entries.length} API handlers.");
  `], {
    cwd: output, stdio: "inherit",
    env: { ...process.env, KV_REST_API_URL: "https://api-runtime.invalid", KV_REST_API_TOKEN: "runtime-check-only" },
  });
} finally {
  rmSync(output, { recursive: true, force: true });
}
