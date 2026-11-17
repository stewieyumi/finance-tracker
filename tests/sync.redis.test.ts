// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestRedis } from './redisHarness';
import handler from '../api/sync';

// Only the HTTP transport is replaced: the handler's exact Lua executes in real Redis.
const bridge = vi.hoisted(() => ({ command: undefined as undefined | ((...args: Array<string | number>) => Promise<any>) }));
vi.mock('@upstash/redis', () => ({ Redis: class {
  get(key: string) { return bridge.command!('GET', key); }
  eval(script: string, keys: string[], args: Array<string | number>) {
    return bridge.command!('EVAL', script, keys.length, ...keys, ...args);
  }
} }));

const snapshot = (updatedAt = 1000, balance = 100) => ({
  updatedAt, wallets: { cash: balance }, library: { bills: [], receivables: [], shoots: [] }, logs: {}, settings: {},
});
const key = (sub = 'alice') => `finance_data_g_${sub}`;
async function request(method: string, body?: unknown, sub = 'alice', url = '/api/sync') {
  const res = { statusCode: 0, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; }, setHeader() {}, end() {},
  };
  await handler({ method, headers: { authorization: `Bearer eyJ.synthetic.${sub}` }, body, url }, res);
  return res;
}

describe.skipIf(process.env.FT_RUN_REDIS_TESTS !== '1')('sync handler with real Redis Lua', () => {
  let redis: Awaited<ReturnType<typeof startTestRedis>>;
  beforeAll(async () => { redis = await startTestRedis(); bridge.command = redis.command; });
  afterAll(async () => { if (redis) await redis.close(); });
  beforeEach(async () => {
    await redis.command('FLUSHDB'); // This suite owns a newly spawned, socket-only process.
    vi.stubEnv('KV_REST_API_URL', 'https://integration.invalid');
    vi.stubEnv('KV_REST_API_TOKEN', 'synthetic');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'integration-client');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=eyJ.synthetic.')) throw new Error('Unexpected external request');
      return { ok: true, json: async () => ({ sub: url.split('.').at(-1), aud: 'integration-client' }) };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('creates and reads a real envelope, preserving arrays, objects, Unicode and escaped brackets', async () => {
    const data = { ...snapshot(), goalName: '日本 [ trip ] "quoted" \\ path', library: {
      bills: [{ id: 'b', name: '[a, b]', detail: { nested: [[], {}] } }], receivables: [], shoots: [],
    } };
    const saved = await request('PUT', { baseRevision: 0, data });
    expect(saved).toMatchObject({ statusCode: 200, body: { accepted: true, revision: 1 } });
    expect(JSON.parse(await redis.command('GET', key()))).toEqual({ data, revision: 1 });
    expect((await request('GET')).body).toEqual({ ...data, record: data, revision: 1 });
    expect((await request('GET', undefined, 'alice', '/api/sync?version_only=true')).body).toEqual({ updatedAt: 1000, revision: 1 });
    expect(await request('PUT', { baseRevision: 1, data: { ...data, updatedAt: 1001 } })).toMatchObject({ statusCode: 200, body: { revision: 2 } });
  });

  it('accepts exactly one concurrent writer at the same revision and leaves the loser unchanged', async () => {
    const data = snapshot();
    await request('PUT', { baseRevision: 0, data });
    const candidates = [snapshot(2000, 200), snapshot(3000, 300)];
    const results = await Promise.all(candidates.map(data => request('PUT', { baseRevision: 1, data })));
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const winner = candidates[results.findIndex(r => r.statusCode === 200)];
    const loser = results.find(r => r.statusCode === 409)!;
    expect(loser.body).toMatchObject({ accepted: false, error: 'conflict', revision: 2, data: winner });
    const stored = await redis.command('GET', key());
    expect(JSON.parse(stored)).toEqual({ data: winner, revision: 2 });
    expect(await request('PUT', { baseRevision: 1, data: snapshot(9999, 999) })).toMatchObject({ statusCode: 409 });
    expect(await redis.command('GET', key())).toBe(stored);
  });

  it('rejects a stale revision against an empty key without creating a record', async () => {
    expect(await request('PUT', { baseRevision: 5, data: snapshot() })).toMatchObject({ statusCode: 409, body: { empty: true, data: null, revision: 0 } });
    expect(await redis.command('GET', key())).toBeNull();
  });

  it('isolates users and allows independent revision sequences', async () => {
    await request('PUT', { baseRevision: 0, data: snapshot(1000, 10) });
    await request('PUT', { baseRevision: 0, data: snapshot(1000, 20) }, 'bob');
    await request('PUT', { baseRevision: 1, data: snapshot(2000, 30) });
    expect((await request('GET', undefined, 'bob')).body).toMatchObject({ wallets: { cash: 20 }, revision: 1 });
    expect((await request('GET')).body).toMatchObject({ wallets: { cash: 30 }, revision: 2 });
  });

  it('preserves legacy timestamp rejection, then upgrades an accepted legacy write once', async () => {
    const legacy = snapshot();
    await redis.command('SET', key(), JSON.stringify(legacy));
    for (const updatedAt of [999, 1000]) {
      expect(await request('POST', snapshot(updatedAt, 500))).toMatchObject({ statusCode: 200, body: { accepted: false, revision: 0, data: legacy } });
      expect(await redis.command('GET', key())).toBe(JSON.stringify(legacy));
    }
    expect(await request('POST', snapshot(1001, 200))).toMatchObject({ statusCode: 200, body: { accepted: true, revision: 1 } });
    expect(await request('PUT', { baseRevision: 0, data: snapshot(2000) })).toMatchObject({ statusCode: 409 });
  });

  it('keeps compatible legacy top-level arrays while requiring real library arrays', async () => {
    const legacy = { ...snapshot(), wallets: [], logs: [], settings: [] };
    await redis.command('SET', key(), JSON.stringify(legacy));
    expect((await request('GET')).body.record).toEqual(legacy);
    expect(await request('PUT', { baseRevision: 0, data: snapshot(2000) })).toMatchObject({ statusCode: 200, body: { revision: 1 } });
  });

  it.each([
    '{broken', 'null', '[]',
    JSON.stringify({ data: snapshot(), revision: -1 }),
    JSON.stringify({ data: snapshot(), revision: 1.5 }),
    JSON.stringify({ data: snapshot(), revision: 9007199254740992 }),
    JSON.stringify({ data: snapshot(), revision: '1' }),
    JSON.stringify({ ...snapshot(), library: { bills: {}, receivables: [], shoots: [] } }),
    JSON.stringify({ ...snapshot(), library: { bills: [], receivables: {}, shoots: [] } }),
    JSON.stringify({ ...snapshot(), library: [] }),
  ])('rejects malformed stored data without changing its bytes: %s', async raw => {
    await redis.command('SET', key(), raw);
    expect(await request('PUT', { baseRevision: 0, data: snapshot(2000) })).toMatchObject({ statusCode: 500, body: { error: 'INVALID_STORED_ENVELOPE' } });
    expect(await request('GET')).toMatchObject({ statusCode: 500, body: { error: 'INVALID_STORED_ENVELOPE' } });
    expect(await redis.command('GET', key())).toBe(raw);
  });

  it('increments the last safe revision exactly and rejects overflow without mutation', async () => {
    await redis.command('SET', key(), JSON.stringify({ data: snapshot(), revision: Number.MAX_SAFE_INTEGER - 1 }));
    expect(await request('PUT', { baseRevision: Number.MAX_SAFE_INTEGER - 1, data: snapshot(2000) })).toMatchObject({ statusCode: 200, body: { revision: Number.MAX_SAFE_INTEGER } });
    const before = await redis.command('GET', key());
    expect(await request('PUT', { baseRevision: Number.MAX_SAFE_INTEGER, data: snapshot(3000) })).toMatchObject({ statusCode: 503, body: { error: 'REVISION_EXHAUSTED', revision: Number.MAX_SAFE_INTEGER } });
    expect(await redis.command('GET', key())).toBe(before);
  });
});
