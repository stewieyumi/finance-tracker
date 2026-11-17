import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run', 'tests/sync.redis.test.ts', 'src/hooks/useCloudSync.redis.test.tsx',
], { cwd: root, stdio: 'inherit', env: { ...process.env, FT_RUN_REDIS_TESTS: '1' } });
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
