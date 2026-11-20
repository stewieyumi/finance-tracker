import type { UnifiedFinanceData } from '../src/types/finance';
import { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useCloudSync, notifyAuthTokenChanged } from '../src/hooks/useCloudSync';
import { prepareAccountEpoch } from '../src/utils/accountData';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Redis } from '@upstash/redis';
import { startTestRedis } from './redisHarness';
import accountHandler from '../api/account';
import syncHandler from '../api/sync';
import shortcutHandler from '../api/quick-expense';
import { createFinanceSession } from '../server/financeSession';
import { accountEpochKey } from '../server/accountLifecycle';
import { calendarUserKey, saveAppleConnection } from '../server/appleCalendarConnection';
import { INITIAL_UNIFIED_DATA } from '../src/constants/initialData';

const transport = vi.hoisted(() => ({ command: undefined as undefined | ((...args: Array<string | number>) => Promise<any>), beforeEval: undefined as undefined | ((script: string, keys: string[]) => Promise<void>) }));
vi.mock('@upstash/redis', () => ({ Redis: class {
  deserialize: boolean;
  constructor(options: { automaticDeserialization?: boolean }) { this.deserialize = options.automaticDeserialization !== false; }
  async get(key: string) { const value = await transport.command!('GET', key); if (this.deserialize && typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } } return value; }
  set(key: string, value: unknown, options?: { ex?: number; nx?: boolean }) { return transport.command!('SET', key, typeof value === 'string' ? value : JSON.stringify(value), ...(options?.ex ? ['EX', options.ex] : []), ...(options?.nx ? ['NX'] : [])); }
  del(key: string) { return transport.command!('DEL', key); }
  async eval(script: string, keys: string[], args: Array<string | number>) { await transport.beforeEval?.(script, keys); return transport.command!('EVAL', script, keys.length, ...keys, ...args); }
} }));
const data = () => ({ ...structuredClone(INITIAL_UNIFIED_DATA), updatedAt: 100, wallets: { main: 1000 }, settings: { customWallets: [{ id: 'main', label: 'Test wallet' }] } });
async function call(handler: typeof accountHandler, request: any) {
  const response = { code: 0, body: undefined as any, headers: {} as Record<string, string>, status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; }, setHeader(key: string, value: string) { this.headers[key] = value; }, end() {} };
  await handler(request, response); return response;
}
async function login(sub: string) {
  const session = await createFinanceSession({ sub, email: `${sub}@example.invalid` });
  const headers: Record<string, string> = { cookie: session.cookie.split(';')[0], 'x-finance-session': session.binding, 'x-finance-auth': '1', 'sec-fetch-site': 'same-origin', ...(session.accountEpoch ? { 'x-finance-account': session.accountEpoch } : {}) };
  return { session, headers };
}
const deleteRequest = (headers: Record<string, string>, sub = 'alice') => ({ method: 'DELETE', headers, body: { confirmation: 'DELETE', expectedSub: sub } });

describe.skipIf(process.env.FT_RUN_REDIS_TESTS !== '1')('account deletion with real isolated Redis', () => {
  let redis: Awaited<ReturnType<typeof startTestRedis>>;
  beforeAll(async () => { redis = await startTestRedis(); transport.command = redis.command; });
  afterAll(async () => { if (redis) await redis.close(); });
  beforeEach(async () => {
    await redis.command('FLUSHDB'); transport.beforeEval = undefined;
    vi.stubEnv('KV_REST_API_URL', 'https://deletion-test.invalid'); vi.stubEnv('KV_REST_API_TOKEN', 'synthetic-only');
    vi.stubEnv('CALENDAR_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64')); vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'deletion-test-client');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ sub: 'alice', aud: 'deletion-test-client' }) })));
    for (const sub of ['alice', 'bob']) await redis.command('SET', `finance_data_g_${sub}`, JSON.stringify({ data: data(), revision: 4 }));
  });
  afterEach(() => { transport.beforeEval = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('requires same-origin session, correct owner, and explicit confirmation before deleting', async () => {
    const a = await login('alice');
    expect((await call(accountHandler, { ...deleteRequest(a.headers), method: 'POST' })).code).toBe(405);
    expect((await call(accountHandler, deleteRequest({ ...a.headers, 'sec-fetch-site': 'cross-site' }))).code).toBe(403);
    expect((await call(accountHandler, deleteRequest({ ...a.headers, cookie: '' }))).code).toBe(401);
    expect((await call(accountHandler, deleteRequest(a.headers, 'bob'))).code).toBe(400);
    expect((await call(accountHandler, { ...deleteRequest(a.headers), body: { confirmation: 'delete', expectedSub: 'alice' } })).code).toBe(400);
    expect(await redis.command('GET', 'finance_data_g_alice')).not.toBeNull(); expect(await redis.command('GET', 'finance_data_g_bob')).not.toBeNull();
  });
  it('atomically removes owned data and connections, revokes every old session, and preserves other users', async () => {
    const a = await login('alice'); const otherAlice = await login('alice'); const b = await login('bob');
    const owner = 'ft_shortcut_owner_v1:alice'; const digest = 'a'.repeat(64);
    await redis.command('SET', owner, digest); await redis.command('SET', 'ft_shortcut_v1:' + digest, 'synthetic connection');
    await redis.command('SET', `ft_apple_connection_v1:${calendarUserKey('alice')}`, 'synthetic encrypted record');
    await redis.command('SET', `ft_apple_connection_v1:${calendarUserKey('bob')}`, 'other user record');
    const result = await call(accountHandler, deleteRequest(a.headers)); expect(result.code).toBe(200); expect(result.body).toEqual({ deleted: true, sub: 'alice' });
    for (const key of ['finance_data_g_alice', owner, 'ft_shortcut_v1:' + digest, `ft_apple_connection_v1:${calendarUserKey('alice')}`]) expect(await redis.command('GET', key)).toBeNull();
    expect(await redis.command('GET', accountEpochKey('alice'))).toMatch(/^v1_[a-f0-9]{32}$/);
    expect((await call(syncHandler, { method: 'GET', headers: otherAlice.headers })).code).toBe(401);
    expect((await call(syncHandler, { method: 'GET', headers: b.headers })).code).toBe(200);
    expect(await redis.command('GET', `ft_apple_connection_v1:${calendarUserKey('bob')}`)).toBe('other user record');
    expect(result.headers['Set-Cookie']).toBeUndefined();
  });
  it('rejects a stale sync write even when deletion occurs after session validation and before the Lua commit', async () => {
    const a = await login('alice'); let injected = false;
    transport.beforeEval = async script => { if (!injected && script.includes('local rawCurrent')) { injected = true; expect((await call(accountHandler, deleteRequest(a.headers))).code).toBe(200); } };
    const result = await call(syncHandler, { method: 'PUT', headers: a.headers, body: { baseRevision: 4, data: { ...data(), updatedAt: 9999 } } });
    expect(injected).toBe(true); expect(result.code).toBe(401); expect(await redis.command('GET', 'finance_data_g_alice')).toBeNull();
  });
  it('blocks old bearer clients and allows a fresh bound session to create only a new profile', async () => {
    const a = await login('alice'); await call(accountHandler, deleteRequest(a.headers));
    const legacy = { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.sig' };
    expect((await call(syncHandler, { method: 'PUT', headers: legacy, body: { baseRevision: 0, data: data() } })).code).toBe(401);
    const fresh = await login('alice'); expect(fresh.session.accountEpoch).toMatch(/^v1_/);
    const oldClientHeaders = { ...fresh.headers }; delete oldClientHeaders['x-finance-account'];
    expect((await call(syncHandler, { method: 'GET', headers: oldClientHeaders })).code).toBe(401);
    const empty = { ...data(), wallets: { main: 0 }, updatedAt: 200 };
    const result = await call(syncHandler, { method: 'PUT', headers: fresh.headers, body: { baseRevision: null, data: empty } });
    expect(result.code).toBe(200); expect(JSON.parse(await redis.command('GET', 'finance_data_g_alice')).data.wallets).toEqual({ main: 0 });
  });
  it('waits for an in-flight calendar action before deleting anything', async () => {
    const a = await login('alice'); await redis.command('SET', `ft_apple_calendar_lock:${calendarUserKey('alice')}`, 'busy', 'EX', 60);
    expect((await call(accountHandler, deleteRequest(a.headers))).code).toBe(409);
    expect(await redis.command('GET', 'finance_data_g_alice')).not.toBeNull(); expect(await redis.command('GET', accountEpochKey('alice'))).toBeNull();
  });
  it('prevents an in-flight shortcut connection from being saved after deletion', async () => {
    const a = await login('alice'); let injected = false;
    transport.beforeEval = async (_script, keys) => { if (!injected && keys.length === 3 && keys[2] === accountEpochKey('alice')) { injected = true; await call(accountHandler, deleteRequest(a.headers)); } };
    const result = await call(shortcutHandler, { method: 'POST', headers: { ...a.headers, 'x-finance-shortcut': '1' }, body: { action: 'connect', walletId: 'main' } });
    expect(injected).toBe(true); expect(result.code).toBe(401); expect(await redis.command('GET', 'ft_shortcut_owner_v1:alice')).toBeNull();
  });
  it('prevents old calendar credentials from being persisted after deletion', async () => {
    const a = await login('alice'); await call(accountHandler, deleteRequest(a.headers));
    await expect(saveAppleConnection(new Redis({ url: 'https://deletion-test.invalid', token: 'synthetic-only' }), 'alice', { username: 'calendar@example.invalid', password: 'abcd-efgh-ijkl-mnop' })).rejects.toMatchObject({ status: 409 });
    expect(await redis.command('GET', `ft_apple_connection_v1:${calendarUserKey('alice')}`)).toBeNull();
  });
  it('does not acknowledge or clear data if the atomic deletion cannot execute', async () => {
    const a = await login('alice'); transport.beforeEval = async script => { if (script.includes("return 'deleted'")) throw new Error('Synthetic unavailable store'); };
    expect((await call(accountHandler, deleteRequest(a.headers))).code).toBe(503);
    expect(await redis.command('GET', 'finance_data_g_alice')).not.toBeNull(); expect(await redis.command('GET', accountEpochKey('alice'))).toBeNull();
  });
  it('drops old pending memory and late acknowledgements when the same account is recreated', async () => {
    const a = await login('alice'); let cookie = a.headers.cookie;
    const values = new Map<string, string>();
    const storage: Storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
      getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => { values.delete(key); }, clear: () => values.clear() };
    const previous = Object.getOwnPropertyDescriptor(window, 'localStorage');
    vi.stubGlobal('localStorage', storage); Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    vi.stubGlobal('BroadcastChannel', class { onmessage = null; postMessage() {} close() {} });
    storage.setItem('ft_app_session', JSON.stringify({ profile: { sub: 'alice' }, binding: a.session.binding }));
    storage.setItem('ft_master_data_v1_alice', JSON.stringify(data())); storage.setItem('ft_sync_base_revision_alice', '4');
    const late: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.startsWith('/api/sync')) throw new Error('Unexpected request in isolated account-reset test');
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const response = await call(syncHandler, { method: init?.method ?? 'GET', url, headers: { ...headers, cookie }, body: init?.body });
      const result = { ok: response.code >= 200 && response.code < 300, status: response.code, json: async () => structuredClone(response.body) };
      if (init?.method === 'PUT' && headers['x-finance-session'] === a.session.binding) return new Promise(resolve => late.push(() => resolve(result)));
      return result;
    }));
    try {
      const hook = renderHook(() => { const [snapshot, setSnapshot] = useState<UnifiedFinanceData>(data()); return { snapshot, sync: useCloudSync(snapshot, setSnapshot, vi.fn()) }; });
      await waitFor(() => expect(hook.result.current.sync.hasInitialSyncCompleted).toBe(true));
      act(() => { hook.result.current.sync.commitDataChange({ ...data(), updatedAt: 200, wallets: { main: 800 } }); });
      await waitFor(() => expect(late.length).toBeGreaterThan(0), { timeout: 5000 });
      expect((await call(accountHandler, deleteRequest(a.headers))).code).toBe(200);
      const fresh = await login('alice'); cookie = fresh.headers.cookie;
      act(() => {
        prepareAccountEpoch('alice', fresh.session.accountEpoch);
        storage.setItem('ft_app_session', JSON.stringify({ profile: { sub: 'alice' }, binding: fresh.session.binding, accountEpoch: fresh.session.accountEpoch }));
        notifyAuthTokenChanged();
      });
      await waitFor(() => expect(Object.values(hook.result.current.snapshot.wallets).every(balance => balance === 0)).toBe(true));
      await act(async () => { for (const release of late) release(); });
      await waitFor(() => expect(hook.result.current.sync.hasInitialSyncCompleted).toBe(true));
      await act(async () => { await hook.result.current.sync.forceManualSync(); });
      const saved = JSON.parse(await redis.command('GET', 'finance_data_g_alice'));
      expect(Object.values(saved.data.wallets).every(balance => balance === 0)).toBe(true);
      expect(hook.result.current.snapshot.library.expenses ?? []).toEqual([]);
      expect([...values.keys()].some(key => key.startsWith('ft_sync_pending_writer:alice:'))).toBe(false);
      expect(JSON.parse(await redis.command('GET', 'finance_data_g_bob')).data.wallets.main).toBe(1000);
      hook.unmount();
    } finally { cleanup(); if (previous) Object.defineProperty(window, 'localStorage', previous); }
  });

});
