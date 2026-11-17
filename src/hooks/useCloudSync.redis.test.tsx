import { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestRedis } from '../../tests/redisHarness';
import handler from '../../api/sync';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';
import type { UnifiedFinanceData } from '../types/finance';
import { useCloudSync } from './useCloudSync';

const transport = vi.hoisted(() => ({ command: undefined as undefined | ((...args: Array<string | number>) => Promise<any>) }));
vi.mock('@upstash/redis', () => ({ Redis: class {
  get(key: string) { return transport.command!('GET', key); }
  eval(script: string, keys: string[], args: Array<string | number>) {
    return transport.command!('EVAL', script, keys.length, ...keys, ...args);
  }
} }));
const token = (sub: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub }))}.sig`;
const data = (balance = 100, updatedAt = 1000): UnifiedFinanceData => ({
  ...structuredClone(INITIAL_UNIFIED_DATA), wallets: { cash: balance }, updatedAt,
  library: { bills: [], receivables: [], shoots: [] }, logs: {},
});
const key = (sub: string) => `finance_data_g_${sub}`;
const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  key: index => [...values.keys()][index] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, String(value)); },
  removeItem: key => { values.delete(key); }, clear: () => values.clear(),
};
const pendingKeys = (sub: string) => [...values.keys()].filter(key => key.startsWith(`ft_sync_pending_writer:${sub}:`));
const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });

describe.skipIf(process.env.FT_RUN_REDIS_TESTS !== '1')('browser recovery through real Redis sync handler', () => {
  let redis: Awaited<ReturnType<typeof startTestRedis>>;
  let failure: 'none' | 'before-save' | 'after-save';
  let writes: Array<{ sub: string; baseRevision: number; data: UnifiedFinanceData }>;
  let messages: any[];
  beforeAll(async () => { redis = await startTestRedis(); transport.command = redis.command; });
  afterAll(async () => { if (redis) await redis.close(); });
  beforeEach(async () => {
    vi.stubGlobal('localStorage', storage);
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    localStorage.clear(); failure = 'none'; writes = []; messages = [];
    await redis.command('FLUSHDB'); // Only our newly spawned disposable Redis process.
    vi.stubEnv('KV_REST_API_URL', 'https://integration.invalid');
    vi.stubEnv('KV_REST_API_TOKEN', 'synthetic');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'integration-client');
    vi.stubGlobal('BroadcastChannel', class {
      onmessage = null;
      postMessage(message: unknown) { messages.push(message); }
      close() {}
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=')) {
        const supplied = new URL(url).searchParams.get('id_token')!;
        return response(200, { sub: JSON.parse(atob(supplied.split('.')[1])).sub, aud: 'integration-client' });
      }
      if (!url.startsWith('/api/sync')) throw new Error(`Unexpected external request: ${url}`);
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const method = init?.method || 'GET';
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        const sub = JSON.parse(atob(headers.authorization.split(' ')[1].split('.')[1])).sub;
        writes.push({ sub, ...body });
        if (failure === 'before-save') return response(400, { error: 'Synthetic offline edit' });
      }
      const res = { code: 0, body: undefined as any,
        status(code: number) { this.code = code; return this; },
        json(value: unknown) { this.body = value; }, setHeader() {}, end() {},
      };
      await handler({ method, url, headers, body: init?.body }, res);
      if (method === 'PUT' && failure === 'after-save') {
        failure = 'none';
        throw new TypeError('Synthetic lost response after server accepted write');
      }
      return response(res.code, res.body);
    }));
    localStorage.setItem('ft_google_token', token('alice'));
    localStorage.setItem('ft_sync_base_revision_alice', '10');
    localStorage.setItem('ft_master_data_v1_alice', JSON.stringify(data()));
    await redis.command('SET', key('alice'), JSON.stringify({ data: data(), revision: 10 }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  const mount = (initial = data()) => renderHook(() => {
    const [snapshot, setSnapshot] = useState(initial);
    return { snapshot, sync: useCloudSync(snapshot, setSnapshot, vi.fn()) };
  });
  async function edit(hook: ReturnType<typeof mount>, balance: number) {
    act(() => { hook.result.current.sync.commitDataChange(prev => ({ ...prev, wallets: { cash: balance } })); });
    await waitFor(() => expect(hook.result.current.sync.isSyncing).toBe(false));
  }

  it('restores a pending edit into the UI when the main storage write failed, using the original revision', async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.sync.hasInitialSyncCompleted).toBe(true));
    const setItem = storage.setItem;
    const storageFailure = vi.spyOn(storage, 'setItem').mockImplementation(function (name, value) {
      if (name === 'ft_master_data_v1_alice') throw new DOMException('Full', 'QuotaExceededError');
      return setItem(name, value);
    });
    failure = 'before-save';
    await edit(first, 125);
    const pending = pendingKeys('alice')[0];
    expect(JSON.parse(localStorage.getItem(pending)!)).toMatchObject({ baseRevision: 10, snapshot: { wallets: { cash: 125 } } });
    expect(JSON.parse(localStorage.getItem('ft_master_data_v1_alice')!).wallets.cash).toBe(100);
    first.unmount(); storageFailure.mockRestore(); failure = 'none';
    localStorage.setItem('ft_sync_base_revision_alice', '99'); // Pending provenance must win over this stale key.
    const second = mount();
    expect(second.result.current.snapshot.wallets.cash).toBe(125);
    await waitFor(() => expect(second.result.current.sync.canReloadSafely()).toBe(true));
    expect(writes.at(-1)).toMatchObject({ sub: 'alice', baseRevision: 10, data: { wallets: { cash: 125 } } });
    expect(JSON.parse(await redis.command('GET', key('alice')))).toMatchObject({ revision: 11, data: { wallets: { cash: 125 } } });
    expect(pendingKeys('alice')).toEqual([]);
  });

  it.each(['local', 'cloud'] as const)('keeps a newer cloud snapshot until explicit %s conflict resolution', async resolution => {
    const first = mount();
    await waitFor(() => expect(first.result.current.sync.hasInitialSyncCompleted).toBe(true));
    failure = 'before-save'; await edit(first, 125); first.unmount();
    const newerCloud = data(200, Date.now() + 10_000);
    await redis.command('SET', key('alice'), JSON.stringify({ data: newerCloud, revision: 11 }));
    failure = 'none';
    const second = mount();
    await waitFor(() => expect(second.result.current.sync.hasActiveConflict).toBe(true));
    expect(second.result.current.snapshot.wallets.cash).toBe(125);
    expect(JSON.parse(await redis.command('GET', key('alice'))).data.wallets.cash).toBe(200);
    expect(second.result.current.sync.canReloadSafely()).toBe(false);
    expect(pendingKeys('alice')).toHaveLength(1);
    await act(async () => { await second.result.current.sync.resolveConflict(resolution); });
    await waitFor(() => expect(second.result.current.sync.hasActiveConflict).toBe(false));
    const winner = resolution === 'local' ? 125 : 200;
    const revision = resolution === 'local' ? 12 : 11;
    expect(JSON.parse(await redis.command('GET', key('alice')))).toMatchObject({ revision, data: { wallets: { cash: winner } } });
    expect(second.result.current.snapshot.wallets.cash).toBe(winner);
    expect(pendingKeys('alice')).toEqual([]);
    expect(messages).toContainEqual(expect.objectContaining({ type: 'CONFLICT_RESOLVED', payload: expect.objectContaining({ sub: 'alice', winningRevision: revision }) }));
    expect(JSON.parse(localStorage.getItem('ft_sync_conflict_backups_alice')!)).toHaveLength(1);
  });

  it('does not apply an accepted write twice after its response was lost and the app reloads', async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.sync.hasInitialSyncCompleted).toBe(true));
    failure = 'after-save'; await edit(first, 125);
    expect(JSON.parse(await redis.command('GET', key('alice')))).toMatchObject({ revision: 11, data: { wallets: { cash: 125 } } });
    expect(pendingKeys('alice')).toHaveLength(1); first.unmount();
    const second = mount();
    await waitFor(() => expect(second.result.current.sync.hasActiveConflict).toBe(true));
    expect(writes.at(-1)?.baseRevision).toBe(10);
    expect(JSON.parse(await redis.command('GET', key('alice'))).revision).toBe(11);
    await act(async () => { await second.result.current.sync.resolveConflict('cloud'); });
    expect(second.result.current.snapshot.wallets.cash).toBe(125);
    expect(pendingKeys('alice')).toEqual([]);
    expect(JSON.parse(await redis.command('GET', key('alice'))).revision).toBe(11);
  });

  it('does not upload another account’s pending edit when reopening under a different sign-in', async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.sync.hasInitialSyncCompleted).toBe(true));
    failure = 'before-save'; await edit(first, 125); first.unmount();
    localStorage.setItem('ft_google_token', token('bob'));
    localStorage.setItem('ft_sync_base_revision_bob', '0'); failure = 'none';
    const second = mount(data(300));
    await waitFor(() => expect(second.result.current.sync.hasInitialSyncCompleted).toBe(true));
    await edit(second, 350);
    expect(writes.filter(w => w.sub === 'bob')).toHaveLength(1);
    expect(writes.at(-1)).toMatchObject({ sub: 'bob', baseRevision: 0, data: { wallets: { cash: 350 } } });
    expect(JSON.parse(await redis.command('GET', key('bob')))).toMatchObject({ revision: 1, data: { wallets: { cash: 350 } } });
    expect(JSON.parse(await redis.command('GET', key('alice')))).toMatchObject({ revision: 10, data: { wallets: { cash: 100 } } });
    expect(pendingKeys('alice')).toHaveLength(1);
  });
});
