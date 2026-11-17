/// <reference types="node" />
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Test-only Redis: private Unix socket, no TCP listener, credentials or disk persistence. */
export async function startTestRedis() {
  const directory = await mkdtemp('/tmp/ft-redis-');
  const socket = join(directory, 'redis.sock');
  const server = spawn(process.env.REDIS_SERVER_BIN || 'redis-server', [
    '--port', '0', '--unixsocket', socket, '--unixsocketperm', '700',
    '--save', '', '--appendonly', 'no', '--dir', directory, '--loglevel', 'warning',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let startupError: Error | undefined;
  let output = '';
  server.on('error', error => { startupError = error; });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise<void>(resolve => { server.once('exit', () => resolve()); server.once('error', () => resolve()); });

  async function command(...args: Array<string | number>): Promise<any> {
    const { stdout } = await run(process.env.REDIS_CLI_BIN || 'redis-cli', [
      '-s', socket, '--json', ...args.map(String),
    ], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout);
  }
  async function close() {
    if (server.exitCode === null && !startupError) {
      server.kill('SIGTERM');
      const timeout = setTimeout(() => server.kill('SIGKILL'), 2000);
      await exited;
      clearTimeout(timeout);
    }
    await rm(directory, { recursive: true, force: true });
  }
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (server.exitCode !== null) throw new Error(output);
      try {
        if (await command('PING') === 'PONG') return { command, close };
      } catch { /* The private socket may not be ready yet. */ }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Redis did not become ready: ${output}`);
  } catch (error) {
    await close();
    throw new Error('Redis integration requires redis-server and redis-cli on PATH (or REDIS_SERVER_BIN / REDIS_CLI_BIN).', { cause: error });
  }
}
