// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
let fixture: string;
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'ft-build-config-'));
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
  writeFileSync(join(fixture, 'vite.config.js'), readFileSync(join(root, 'vite.config.js')));
  writeFileSync(join(fixture, 'index.html'), '<div>Build configuration fixture</div>');
  symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'junction');
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));

function build(clientId?: string, mode?: string) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
  if (clientId !== undefined) env.VITE_GOOGLE_CLIENT_ID = clientId;
  return spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', ...(mode ? ['--mode', mode] : [])], {
    cwd: fixture, env, encoding: 'utf8', timeout: 15000,
  });
}

describe('production build configuration', () => {
  it.each([undefined, '', '   '])('rejects a missing or blank Google client ID (%s)', value => {
    const result = build(value);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('VITE_GOOGLE_CLIENT_ID is required for production builds');
  });

  it.each(['development', 'test'])('also rejects a missing client ID in a %s-mode build', mode => {
    const result = build(undefined, mode);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('VITE_GOOGLE_CLIENT_ID is required');
  });

  it('loads the public client ID from the production env file', () => {
    writeFileSync(join(fixture, '.env.production'), 'VITE_GOOGLE_CLIENT_ID=000000000000-build-test.apps.googleusercontent.com\n');
    const result = build();
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(fixture, 'dist/index.html'), 'utf8')).toContain('Build configuration fixture');
  });

  it('honors an explicitly blank process variable over an env-file value', () => {
    writeFileSync(join(fixture, '.env.production'), 'VITE_GOOGLE_CLIENT_ID=000000000000-build-test.apps.googleusercontent.com\n');
    const result = build(' ');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('VITE_GOOGLE_CLIENT_ID is required');
  });

  it('allows a synthetic public client ID for credential-free CI compilation', () => {
    const result = build('000000000000-ci-build.apps.googleusercontent.com');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });
});
