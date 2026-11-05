import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloudSync, notifyAuthTokenChanged, setLocalPasscode, loadScopedConflictBackups, loadScopedFinanceData } from './useCloudSync';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockBroadcastPostMessage = vi.fn();
let mockBroadcastChannels: MockBroadcastChannel[] = [];
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: { data: any }) => void) | null = null;
  postMessage = mockBroadcastPostMessage;
  close() {
    mockBroadcastChannels = mockBroadcastChannels.filter((ch) => ch !== this);
  }
  constructor(name: string) {
    this.name = name;
    mockBroadcastChannels.push(this);
  }
}
function deliverBroadcastMessage(data: any, channelName = 'ft_sync_channel') {
  for (const ch of [...mockBroadcastChannels]) {
    if (ch.name === channelName) {
      ch.onmessage?.({ data });
    }
  }
}
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

// Bulletproof Dictionary Store
let store: Record<string, string> = {};
const mockStorage = {
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
  getItem: vi.fn((key: string) => store[key] || null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value?.toString() || ''; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { store = {}; })
};

// Force the mock globally
vi.stubGlobal('localStorage', mockStorage);
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true
    });
  } catch (e) {}
}

describe('useCloudSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBroadcastChannels = [];

    // DIRECTLY seed the data dictionary instead of calling window.localStorage.setItem()
    store = {
      'ft_google_token': 'header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig'
    };

    mockStorage.getItem.mockImplementation((key: string) => store[key] || null);
    mockStorage.setItem.mockImplementation((key: string, value: string) => { store[key] = value?.toString() || ''; });
    mockStorage.removeItem.mockImplementation((key: string) => { delete store[key]; });
    mockStorage.clear.mockImplementation(() => { store = {}; });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, accepted: true, revision: 1 })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("recovers an unaccepted edit with its original base revision after reload", async () => {
    const initial = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const setData = vi.fn();
    const toast = vi.fn();
    localStorage.setItem("ft_sync_base_revision_user_123", "10");
    const first = renderHook(() => useCloudSync(initial, setData, toast));
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

    await act(async () => {
      first.result.current.commitDataChange({ ...initial, targetFund: 42000 });
    });
    const key = Object.keys(store).find(key => key.startsWith("ft_sync_pending_writer:user_123:"))!;
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
      version: 1, sub: "user_123", baseRevision: 10, snapshot: { targetFund: 42000 },
    });
    first.unmount();

    localStorage.setItem("ft_sync_base_revision_user_123", "99");
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, accepted: true, revision: 11 }),
    });
    await act(async () => {
      renderHook(() => useCloudSync(initial, setData, toast));
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const request = mockFetch.mock.calls[0][1];
    expect(request.method).toBe("PUT");
    expect(JSON.parse(request.body)).toMatchObject({
      baseRevision: 10, data: { targetFund: 42000 },
    });
    expect(setData).toHaveBeenLastCalledWith(expect.objectContaining({ targetFund: 42000 }));
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("11");
  });

  it("uploads a large full snapshot without the browser's keepalive limit", async () => {
    const initial = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const { result } = renderHook(() => useCloudSync(initial, vi.fn(), vi.fn()));
    const largeSnapshot = { ...initial, goalName: "x".repeat(70 * 1024) };

    await act(async () => {
      result.current.commitDataChange(largeSnapshot);
    });

    const request = mockFetch.mock.calls.find(([, init]) => init?.method === "PUT")?.[1];
    expect(request.body.length).toBeGreaterThan(64 * 1024);
    expect(JSON.parse(request.body).data.goalName).toBe(largeSnapshot.goalName);
    expect(request.keepalive).not.toBe(true);
  });

  it("retains separate pending edits from two mounted tabs", async () => {
    const initial = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const first = renderHook(() => useCloudSync(initial, vi.fn(), vi.fn()));
    const second = renderHook(() => useCloudSync(initial, vi.fn(), vi.fn()));
    mockFetch.mockResolvedValue({ ok: false, status: 400 });

    await act(async () => {
      first.result.current.commitDataChange({ ...initial, targetFund: 111 });
      second.result.current.commitDataChange({ ...initial, targetFund: 222 });
    });

    const pending = Object.entries(store)
      .filter(([key]) => key.startsWith("ft_sync_pending_writer:user_123:"))
      .map(([, raw]) => JSON.parse(raw).snapshot.targetFund);
    expect(pending.sort()).toEqual([111, 222]);

    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, accepted: true, revision: 1 }),
    });
    await act(async () => {
      await first.result.current.forceManualSync();
    });

    const remaining = Object.entries(store)
      .filter(([key]) => key.startsWith("ft_sync_pending_writer:user_123:"))
      .map(([, raw]) => JSON.parse(raw).snapshot.targetFund);
    expect(remaining).toEqual([222]);
  });

  it('commitDataChange instantly updates local state and pushes a new snapshot to the cloud', async () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockFetch.mockClear();

    await act(async () => {
      result.current.commitDataChange((prev: any) => ({
        ...prev,
        targetFund: 99999
      }));
    });

    expect(mockSetGlobalData).toHaveBeenCalled();
    const newData = mockSetGlobalData.mock.calls[mockSetGlobalData.mock.calls.length - 1][0];
    expect(newData.targetFund).toBe(99999);
    expect(newData.updatedAt).toBeGreaterThan(1000);

    const fetchArgs = mockFetch.mock.calls.find(call => call[1]?.method === 'PUT');
    expect(fetchArgs).toBeDefined();
    expect(fetchArgs![0]).toContain('/api/sync');
  });

  it('pullLatestData fetches from the cloud and overwrites state if cloud is newer', async () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockFetch.mockClear();
    mockSetGlobalData.mockClear();

    const evenNewerData = { ...INITIAL_UNIFIED_DATA, updatedAt: 5000, targetFund: 12345 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => evenNewerData
    });

    await act(async () => {
      await result.current.pullLatestData();
    });

    expect(mockSetGlobalData).toHaveBeenCalledWith(evenNewerData);
  });

  it('silently ignores pullLatestData if unauthenticated', async () => {
    store = {}; // Empty the dictionary to simulate no token

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync(INITIAL_UNIFIED_DATA, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockFetch.mockClear();

    await act(async () => {
      await result.current.pullLatestData();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ==========================================
  // P1.5.1: Structural Validation in applyRemoteData
  // ==========================================
  it('rejects structurally invalid remote data without replacing local state', async () => {
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockSetGlobalData.mockClear();

    // Missing library and wallets
    const corruptedRemoteData = {
      updatedAt: 99999,
      someRandomKey: true
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => corruptedRemoteData
    });

    await act(async () => {
      await result.current.pullLatestData();
    });

    expect(mockSetGlobalData).not.toHaveBeenCalled();
  });

  // ==========================================
  // P1.5.1: Local Persistence Failure Feedback
  // ==========================================
  it('shows toast when localStorage persistence throws during applyRemoteData', async () => {
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockFetch.mockClear();
    mockShowToast.mockClear();

    const validNewerData = { ...INITIAL_UNIFIED_DATA, updatedAt: 5000 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validNewerData
    });

    mockStorage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    await act(async () => {
      await result.current.pullLatestData();
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      '⚠️ Device storage full: local changes may not be saved.'
    );
  });

  it('shows toast when localStorage persistence throws during local state change', async () => {
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const { rerender } = renderHook(
      ({ data }) => useCloudSync(data, mockSetGlobalData, mockShowToast),
      { initialProps: { data: initialData } }
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockShowToast.mockClear();

    mockStorage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });

    const updatedData = { ...initialData, updatedAt: 2000, targetFund: 12345 };
    await act(async () => {
      rerender({ data: updatedData });
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      '⚠️ Device storage full: local changes may not be saved.'
    );
  });

  // ==========================================
  // P1.5.1: Controlled Failed Cloud-Push Retry
  // ==========================================
  it('prevents concurrent pushToCloud executions', async () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockFetch.mockClear();

    let resolveFirstFetch: (value: any) => void;
    mockFetch.mockImplementation(() => new Promise((resolve) => {
      resolveFirstFetch = resolve;
    }));

    // First push starts
    let firstPushPromise: Promise<boolean>;
    act(() => {
      firstPushPromise = result.current.pushToCloud({ ...initialData, updatedAt: 2000 });
    });

    // Second push attempted while first is in-flight
    let secondPushResult: boolean | undefined;
    await act(async () => {
      secondPushResult = await result.current.pushToCloud({ ...initialData, updatedAt: 3000 });
    });

    expect(secondPushResult).toBe(false);
    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    await act(async () => {
      resolveFirstFetch!({
        ok: true,
        json: async () => ({ success: true, accepted: true, revision: 1 })
      });
      await firstPushPromise!;
    });
  });

  it('schedules retry with exponential backoff on network failure and succeeds', async () => {
    vi.useFakeTimers();

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    // Initial mount flush
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    mockFetch.mockClear();

    // Now set failure for the push
    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        throw new TypeError('Failed to fetch');
      }
      return { ok: true, json: async () => ({}) };
    });

    // Trigger commitDataChange (marks dirty and starts push)
    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 55555
      }));
      await Promise.resolve();
    });

    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Prepare next fetch to succeed
    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, accepted: true, revision: 1 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Advance before the 2-second retry boundary (1500ms): no retry yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Advance past the 2-second retry boundary (+500ms -> 2000ms): exactly one retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);

    // Controlled observation window (+1000ms): no extra PUT after successful retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);
  });

  it('schedules retry on HTTP 5xx server error', async () => {
    vi.useFakeTimers();

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    mockFetch.mockClear();

    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        return {
          ok: false,
          status: 502,
          json: async () => ({ error: 'Bad Gateway' })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 77777
      }));
      await Promise.resolve();
    });

    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Mock next attempt to succeed
    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, accepted: true, revision: 1 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Advance before the 2-second retry boundary (1500ms): no retry yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Advance past the 2-second retry boundary (+500ms -> 2000ms): exactly one retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);

    // Controlled observation window (+1000ms): no extra PUT after successful retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);
  });

  it('respects maximum retry limit of 3', async () => {
    vi.useFakeTimers();

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    mockFetch.mockClear();

    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        throw new TypeError('Failed to fetch');
      }
      return { ok: true, json: async () => ({}) };
    });

    // Initial push (fails)
    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 11111
      }));
      await Promise.resolve();
    });
    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Retry 1 after 2s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);

    // Retry 2 after 4s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(3);

    // Retry 3 after 8s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(4);

    // Beyond retry 3: no more retries
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(4);
  });

  it("pauses requests after a 401 and sends the latest pending edit with its original base revision after reconnect", async () => {
    const initial = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    localStorage.setItem("ft_sync_base_revision_user_123", "10");
    const { result } = renderHook(() => useCloudSync(initial, vi.fn(), vi.fn()));
    const rejected = localStorage.getItem("ft_google_token")!;
    await act(async () => {});
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await act(async () => result.current.commitDataChange(prev => ({ ...prev, targetFund: 88888 })));
    expect(result.current.syncNeedsSignIn).toBe(true);
    await act(async () => {
      result.current.commitDataChange(prev => ({ ...prev, targetFund: 99999 }));
      await result.current.pullLatestData();
      setLocalPasscode(rejected);
    });
    const pendingKey = Object.keys(store).find(key => key.startsWith("ft_sync_pending_writer:user_123:"))!;
    expect(JSON.parse(store[pendingKey])).toMatchObject({ baseRevision: 10, snapshot: { targetFund: 99999 } });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const binding = "a".repeat(32);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, accepted: true, revision: 11 }) });
    await act(async () => {
      localStorage.setItem("ft_app_session", JSON.stringify({ profile: { sub: "user_123" }, binding }));
      localStorage.removeItem("ft_google_token");
      notifyAuthTokenChanged();
    });

    expect(result.current.syncNeedsSignIn).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const request = mockFetch.mock.calls[1][1];
    expect(request.headers["X-Finance-Session"]).toBe(binding);
    expect(request.headers.Authorization).toBeUndefined();
    expect(JSON.parse(request.body)).toMatchObject({ baseRevision: 10, data: { targetFund: 99999 } });
    expect(store[pendingKey]).toBeUndefined();
  });

  it('does not schedule retry on 409', async () => {
    vi.useFakeTimers();

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    mockFetch.mockClear();

    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'Conflict' })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 44444
      }));
      await Promise.resolve();
    });

    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Advance timers: should not retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
  });

  it('cancels pending retry when a new explicit mutation occurs', async () => {
    vi.useFakeTimers();

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    mockFetch.mockClear();

    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        throw new TypeError('Network Error');
      }
      return { ok: true, json: async () => ({}) };
    });

    // First mutation (fails and schedules retry for 2s)
    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 12121
      }));
      await Promise.resolve();
    });
    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Advance 1s (halfway to retry 1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    // Mock next attempt to succeed
    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, accepted: true, revision: 1 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // New explicit mutation occurs
    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 34343
      }));
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);

    // Advance beyond the original 2s mark: no duplicate retry should trigger
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
    });
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);
  });

  it('retries dirty data when returning online', async () => {
    let currentData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };
    const mockSetGlobalData = vi.fn((update) => {
      currentData = typeof update === 'function' ? update(currentData) : update;
    });
    const mockShowToast = vi.fn();

    // Simulate offline
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const { result } = renderHook(() =>
      useCloudSync(currentData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    mockFetch.mockClear();

    // Mutate while offline (marks dirty, push returns false without fetch)
    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 98765
      }));
    });

    const initialPutCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(initialPutCalls).toHaveLength(0);

    // Bring online
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, accepted: true, revision: 1 })
    });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1]?.body as string);
    expect(body.data.targetFund).toBe(98765);
  });

  it('schedules retry for newer mutation when in-flight push completes', async () => {
    vi.useFakeTimers();

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    mockFetch.mockClear();

    // 1. Starts push A and keeps its fetch promise pending.
    let resolvePushA: (value: any) => void;
    mockFetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePushA = resolve;
    }));

    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 10000
      }));
      await Promise.resolve();
    });

    let putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    expect(JSON.parse(putCalls[0][1]?.body as string).data.targetFund).toBe(10000);

    // Advance time while push A is in flight so mutation B has a newer updatedAt
    await vi.advanceTimersByTimeAsync(100);

    // 2. Performs mutation B while A is still in flight.
    // 3. Confirms B's immediate push attempt is blocked.
    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 20000
      }));
      await Promise.resolve();
    });

    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // Prepare next fetch response for push B
    mockFetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, accepted: true, revision: 2 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // 4. Resolves push A successfully.
    await act(async () => {
      resolvePushA!({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 1 })
      });
      await Promise.resolve();
    });

    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    // 5. Advances the retry timer as necessary.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
    });

    // 6. Verifies a second PUT occurs.
    putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(2);

    // 7. Verifies that second PUT contains B's latest data.
    const bodyB = JSON.parse(putCalls[1][1]?.body as string);
    expect(bodyB.data.targetFund).toBe(20000);
  });


  describe("OCC & Conflict Resolution (P1.5.2)", () => {
    let globalData: any;
    let setGlobalData: any;
    let showToast: any;

    beforeEach(() => {
      globalData = { updatedAt: 1000, targetFund: 10000, wallets: {}, library: { bills: [], receivables: [], shoots: [] }, logs: {}, settings: {} };
      setGlobalData = vi.fn((action: any) => {
        if (typeof action === 'function') globalData = action(globalData);
        else globalData = action;
      });
      showToast = vi.fn();
      localStorage.clear();
      vi.useFakeTimers();

      // We must explicitly control the initial fetch that useCloudSync performs on mount!
      // Provide a default successful pull mock for the mount with newer timestamp than initial local state.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ record: { ...globalData, updatedAt: 1050 }, revision: 10 })
      });

      // Provide a mock for token
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig");
    });

    afterEach(() => {
      vi.useRealTimers();
      mockFetch.mockClear();
    });

    it("6. REQUIRED CORE TEST SCENARIO - Keep Local with post-conflict edit", async () => {
      // 1. Mount the hook. It will pull revision 10.
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
         await vi.advanceTimersByTimeAsync(1);
      });

      // Clear mocks after mount pull
      mockFetch.mockClear();

      // 2. Conflict occurs because cloud is revision 15
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
           success: false,
           error: "conflict",
           revision: 15,
           data: { ...globalData, updatedAt: 2000, targetFund: 15000 }
        })
      });

      // User makes an edit (triggering the 409)
      await act(async () => {
        result.current.commitDataChange({ ...globalData, targetFund: 11000 });
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);

      mockFetch.mockClear();

      // User makes another local financial edit BEFORE resolving!
      await act(async () => {
        result.current.commitDataChange({ ...globalData, targetFund: 12500 });
        await vi.advanceTimersByTimeAsync(1);
      });

      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.conflictState?.cloudRevision).toBe(15);

      // 3. User selects Keep Local, Replacement push succeeds with rev 16
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 16 })
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      // Check that the payload contains CURRENT local snapshot (targetFund 12500) and baseRevision 15
      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === 'PUT');
      expect(putCalls.length).toBe(1);
      const body = JSON.parse(putCalls[0][1].body);

      expect(body.baseRevision).toBe(15);
      expect(body.data.targetFund).toBe(12500);

      // The replacement write was accepted at revision 16; persisted base revision must be 16.
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("16");
    });

    it("handles second 409 during Keep Local by refreshing conflict at new revision", async () => {
      // 1. Conflict exists at cloud revision 15 with consistent localSnapshot (targetFund: 11000)
      const localData = { ...globalData, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: localData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      // Verify that conflict state hydrated on mount and local snapshot is consistent
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(result.current.conflictState?.localSnapshot.targetFund).toBe(11000);

      // Verify no initial fetch occurred because an active conflict blocks pullLatestData
      expect(mockFetch).not.toHaveBeenCalled();

      // Explicitly reset mock implementations after mount to purge any unconsumed queued responses
      mockFetch.mockReset();

      // 4 & 5. Queue exactly one HTTP 409 response for the replacement PUT
      const newerCloudSnapshot = { ...globalData, updatedAt: 3000, targetFund: 18000 };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: "conflict",
          revision: 16,
          data: newerCloudSnapshot,
        }),
      });

      // 2 & 3. User chooses Keep Local
      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      // Assert that exactly one PUT was made during resolution with baseRevision: 15
      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls.length).toBe(1);
      const putBody = JSON.parse(putCalls[0][1]?.body as string);
      expect(putBody.baseRevision).toBe(15);
      expect(putBody.data.targetFund).toBe(11000);

      // Verify that mockFetch was called exactly once and consumed the queued 409 response
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Expected safe behavior:
      // - The refreshed conflict at revision 16 remains visible and persisted
      // - Original baseRevision provenance (10) is preserved
      // - Local financial data (targetFund: 11000) is preserved in memory and in localStorage
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.baseRevision).toBe(10);
      expect(result.current.conflictState?.cloudRevision).toBe(16);
      expect(result.current.conflictState?.cloudSnapshot.targetFund).toBe(18000);
      expect(result.current.conflictState?.localSnapshot.targetFund).toBe(11000);

      const storedConflictStr = localStorage.getItem("ft_sync_conflict_user_123");
      expect(storedConflictStr).toBeTruthy();
      const storedConflict = JSON.parse(storedConflictStr!);
      expect(storedConflict.baseRevision).toBe(10);
      expect(storedConflict.cloudRevision).toBe(16);
      expect(storedConflict.cloudSnapshot.targetFund).toBe(18000);
      expect(storedConflict.localSnapshot.targetFund).toBe(11000);

      // Subsequent Keep Local attempt must compare-and-swap against the refreshed cloudRevision (16)
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 17 }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      const secondAttemptPutCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(secondAttemptPutCalls).toHaveLength(1);
      const secondAttemptBody = JSON.parse(secondAttemptPutCalls[0][1]?.body as string);
      expect(secondAttemptBody.baseRevision).toBe(16);
      expect(secondAttemptBody.data.targetFund).toBe(11000);
      expect(result.current.conflictState).toBeNull();
    });

    it.each([
      [409, { error: "conflict", empty: true, data: null, revision: 0 }, "Cloud snapshot is missing"],
      [503, { error: "REVISION_EXHAUSTED", revision: Number.MAX_SAFE_INTEGER }, "Cloud revision limit reached"],
    ] as const)("preserves local edits and skips automatic backoff after sync status %s", async (status, body, message) => {
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({ ok: false, status, json: async () => body });

      await act(async () => {
        result.current.commitDataChange((prev) => ({ ...prev, targetFund: 42000 }));
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(result.current.debugLog).toContain(message);
      expect(result.current.conflictState).toBeNull();
      expect(globalData.targetFund).toBe(42000);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("preserves existing conflict and local snapshot when Keep Local receives malformed 409", async () => {
      const localData = { ...globalData, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: localData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      showToast.mockClear();
      setGlobalData.mockClear();

      // Server returns 409 with structurally invalid data and invalid revision
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: "conflict",
          revision: -1,
          data: { corrupted: true },
        }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      // Active conflict must not be cleared or overwritten by malformed data
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.baseRevision).toBe(10);
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(result.current.conflictState?.cloudSnapshot.targetFund).toBe(15000);
      expect(result.current.conflictState?.localSnapshot.targetFund).toBe(11000);

      // Malformed remote data is not applied to local state
      expect(setGlobalData).not.toHaveBeenCalled();

      // Persisted conflict remains intact and no resolved conflict record is written
      const storedConflict = JSON.parse(localStorage.getItem("ft_sync_conflict_user_123")!);
      expect(storedConflict.cloudRevision).toBe(15);
      expect(storedConflict.cloudSnapshot.targetFund).toBe(15000);
      expect(localStorage.getItem("ft_sync_last_resolved_conflict_user_123")).toBeNull();

      // Operation is not reported as success
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Could not refresh cloud conflict data. Conflict remains active."
      );

      // No background retry is scheduled
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.resolve();
      });
      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
    });

    it("does not schedule background retry or claim success when Keep Local fails with 5xx or network error", async () => {
      const localData = { ...globalData, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: localData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      showToast.mockClear();

      // 1. 5xx server failure during Keep Local
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: "Service Unavailable" }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(result.current.conflictState?.localSnapshot.targetFund).toBe(11000);
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Could not confirm cloud save. Conflict remains active — please try again."
      );

      // Advance timers past backoff window: no background retry PUT may occur
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.resolve();
      });
      let putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);

      // 2. Network error during Keep Local
      mockFetch.mockReset();
      showToast.mockClear();
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(result.current.conflictState?.localSnapshot.targetFund).toBe(11000);
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Could not confirm cloud save. Conflict remains active — please try again."
      );

      // Advance timers past backoff window: no background retry PUT may occur
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.resolve();
      });
      putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
    });

    it("does not claim 'Saved & synced to cloud' when forceManualSync receives 409", async () => {
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      showToast.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: "conflict",
          revision: 15,
          data: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        }),
      });

      await act(async () => {
        await result.current.forceManualSync();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(showToast).not.toHaveBeenCalledWith("☁️ Saved & synced to cloud");
      expect(showToast).toHaveBeenCalledWith("❌ Cloud save failed - saved locally");
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
    });

    it("requires explicit accepted===true and valid non-negative integer revision on HTTP 200 push responses", async () => {
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      const malformed200Payloads = [
        {}, // missing accepted marker and revision
        { success: true, revision: 11 }, // missing accepted===true
        { success: false, accepted: true, revision: 11 }, // contradictory success===false
        { accepted: true, revision: 11 }, // missing success===true
        { success: true, accepted: true }, // missing revision
        { success: true, accepted: true, revision: -1 }, // negative revision
        { success: true, accepted: true, revision: 11.5 }, // fractional revision
        { success: true, accepted: true, revision: "11" }, // string revision
      ];

      for (const badPayload of malformed200Payloads) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => badPayload,
        });

        let acceptedResult: boolean | undefined;
        await act(async () => {
          acceptedResult = await result.current.pushToCloud({ ...globalData, updatedAt: 2000, targetFund: 11000 });
          await vi.advanceTimersByTimeAsync(1);
        });

        expect(acceptedResult).toBe(false);
        expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      }

      // Valid explicit accepted response matching api/sync.ts contract succeeds
      const updatedSnapshot = { ...globalData, updatedAt: 2000, targetFund: 11000 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: updatedSnapshot,
          revision: 11,
        }),
      });

      let validResult: boolean | undefined;
      await act(async () => {
        validResult = await result.current.pushToCloud(updatedSnapshot);
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(validResult).toBe(true);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("11");
    });

    it("preserves conflict and does not claim success when Keep Local receives an ambiguous/malformed HTTP 200 response", async () => {
      const localData = { ...globalData, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: localData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      showToast.mockClear();

      // 1. HTTP 200 missing accepted marker
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.baseRevision).toBe(10);
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(localStorage.getItem("ft_sync_last_resolved_conflict_user_123")).toBeNull();
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Could not confirm cloud save. Conflict remains active — please try again."
      );

      // 2. HTTP 200 with accepted: true but invalid revision
      showToast.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: "invalid" }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.baseRevision).toBe(10);
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Could not confirm cloud save. Conflict remains active — please try again."
      );
    });

    it("does not show success toast when forceManualSync receives an ambiguous/malformed HTTP 200 response", async () => {
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      showToast.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true }), // missing revision
      });

      await act(async () => {
        await result.current.forceManualSync();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(showToast).not.toHaveBeenCalledWith("☁️ Saved & synced to cloud");
      expect(showToast).toHaveBeenCalledWith("❌ Cloud save failed - saved locally");
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("binds request identity to the captured token and prevents a stale in-flight response from writing into a switched account", async () => {
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      // Prepare deferred PUT response for Account A (user_123)
      let resolvePutA: ((res: any) => void) | undefined;
      mockFetch.mockImplementationOnce((_url: string, options: any) => {
        if (options?.method === "PUT") {
          return new Promise((resolve) => {
            resolvePutA = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ record: globalData, revision: 2 }),
        });
      });

      // Start push under Account A (user_123)
      let pushPromiseA: Promise<boolean> | undefined;
      act(() => {
        pushPromiseA = result.current.pushToCloud({ ...globalData, updatedAt: 2500, targetFund: 19000 });
      });

      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0][1]?.headers?.Authorization).toContain("header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig");

      // Switch active token/account to Account B (user_456) while Account A's PUT is still in flight
      const conflictB = {
        baseRevision: 2,
        localSnapshot: { ...globalData, updatedAt: 3000, targetFund: 22000 },
        cloudSnapshot: { ...globalData, updatedAt: 3500, targetFund: 25000 },
        cloudRevision: 22,
        detectedAt: 200000,
      };
      localStorage.setItem("ft_sync_base_revision_user_456", "2");
      localStorage.setItem("ft_sync_conflict_user_456", JSON.stringify(conflictB));
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig");

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_google_token",
            newValue: "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig",
          })
        );
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState?.cloudRevision).toBe(22);

      // Now resolve Account A's stale PUT with a 409 conflict payload (or accepted revision)
      let pushOutcomeA: boolean | undefined;
      await act(async () => {
        resolvePutA!({
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            error: "conflict",
            revision: 99,
            data: { ...globalData, updatedAt: 9000, targetFund: 99000 },
          }),
        });
        pushOutcomeA = await pushPromiseA!;
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(pushOutcomeA).toBe(false);
      // Account B's conflict state and storage keys must remain untouched
      expect(result.current.conflictState?.cloudRevision).toBe(22);
      expect(result.current.conflictState?.cloudSnapshot.targetFund).toBe(25000);
      expect(JSON.parse(localStorage.getItem("ft_sync_conflict_user_456")!).cloudRevision).toBe(22);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("2");
      // Account A's storage was not mutated after the switch either
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");

      // Also verify that if ft_google_token changes immediately after the single token capture read,
      // requestSub remains bound to the captured token (user_456) and does not write into user_789
      let tokenReadCount = 0;
      const originalGetItem = mockStorage.getItem.getMockImplementation()!;
      mockStorage.getItem.mockImplementation((key: string) => {
        const val = originalGetItem(key);
        if (key === "ft_google_token") {
          tokenReadCount += 1;
          if (tokenReadCount === 1) {
            store["ft_google_token"] = "header.eyJzdWIiOiJ1c2VyXzc4OSJ9.sig";
          }
        }
        return val;
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: globalData,
          revision: 77,
        }),
      });

      let raceOutcome: boolean | undefined;
      await act(async () => {
        raceOutcome = await result.current.pushToCloud({ ...globalData, updatedAt: 4000, targetFund: 30000 });
        await vi.advanceTimersByTimeAsync(1);
      });

      mockStorage.getItem.mockImplementation(originalGetItem);

      expect(raceOutcome).toBe(false);
      expect(localStorage.getItem("ft_sync_base_revision_user_789")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("2");
    });

    it("7. MULTI-ACCOUNT TEST - Sync metadata is scoped by Google sub", async () => {
      // Setup Account A (user_123)
      const conflictA = {
        baseRevision: 10,
        localSnapshot: globalData,
        cloudSnapshot: { ...globalData, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: Date.now()
      };
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflictA));

      // Switch to Account B (user_456)
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig");

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ record: globalData, revision: 2 })
      });

      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
         await vi.advanceTimersByTimeAsync(1);
      });

      // Account B must NOT inherit A's conflict or base revision!
      expect(result.current.conflictState).toBeNull();

      // Switch back to Account A
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig");

      // Must trigger storage event to re-hydrate, or we remount hook
      const { result: resultA } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
         await vi.advanceTimersByTimeAsync(1);
      });

      expect(resultA.current.conflictState).toBeTruthy();
      expect(resultA.current.conflictState?.cloudRevision).toBe(15);
    });

    it("8. CONFLICT HYDRATION TESTS - Malformed / invalid structure ignored", async () => {
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig");
      // 1. Valid conflict
      const validConflict = {
        baseRevision: 10,
        localSnapshot: globalData,
        cloudSnapshot: globalData,
        cloudRevision: 15,
        detectedAt: Date.now()
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(validConflict));

      const { result: r1 } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      expect(r1.current.conflictState).toBeTruthy();

      // 2. Malformed JSON
      localStorage.setItem("ft_sync_conflict_user_123", "{ bad_json");
      const { result: r2 } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      expect(r2.current.conflictState).toBeNull();

      // 3. Structurally invalid localSnapshot
      const invalidLocal = { ...validConflict, localSnapshot: { missingWalletsAndLibrary: true } };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(invalidLocal));
      const { result: r3 } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      expect(r3.current.conflictState).toBeNull();

      // 4. Invalid revision
      const invalidRevision = { ...validConflict, cloudRevision: "not_a_number" };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(invalidRevision));
      const { result: r4 } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      expect(r4.current.conflictState).toBeNull();
    });

    it("3. DO NOT AUTOMATICALLY CLEAR/LOSE CONFLICT STATE ON FAILED RESOLUTION", async () => {
      mockFetch.mockReset();
      const conflict = {
        baseRevision: 10,
        localSnapshot: globalData,
        cloudSnapshot: { ...globalData, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: Date.now()
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflict));

      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      // Make the push fail!
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({})
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      // Conflict state MUST NOT be cleared
      expect(result.current.conflictState).toBeTruthy();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeTruthy();
    });

    it("posts exactly one CONFLICT_RESOLVED broadcast when resolving with 'cloud'", async () => {
      mockFetch.mockReset();
      const cloudSnapshot = { ...globalData, updatedAt: 2000, targetFund: 15000 };
      const conflict = {
        baseRevision: 10,
        localSnapshot: globalData,
        cloudSnapshot,
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockBroadcastPostMessage.mockClear();

      await act(async () => {
        await result.current.resolveConflict("cloud");
        await vi.advanceTimersByTimeAsync(1);
      });

      const resolvedBroadcasts = mockBroadcastPostMessage.mock.calls.filter(
        (call: any) => call[0]?.type === "CONFLICT_RESOLVED"
      );
      expect(resolvedBroadcasts).toHaveLength(1);
      expect(resolvedBroadcasts[0][0]).toEqual({
        type: "CONFLICT_RESOLVED",
        payload: {
          sub: "user_123",
          resolution: "cloud",
          winningSnapshot: cloudSnapshot,
          winningRevision: 15,
        },
      });

      expect(setGlobalData).toHaveBeenCalledWith(cloudSnapshot);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("15");
      expect(localStorage.getItem("ft_sync_last_resolved_conflict_user_123")).toBeTruthy();
      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();
    });

    it("preserves in-flight local mutation made during Keep Local and schedules follow-up push against accepted revision", async () => {
      // 1. Hydrate an active conflict at cloudRevision 15
      const submittedSnapshot = { ...globalData, updatedAt: 1500, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: submittedSnapshot,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(submittedSnapshot, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      // 2. Start resolveConflict("local") and hold the first PUT response pending
      let resolveFirstPut: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce((_url: string, options: any) => {
        if (options?.method === "PUT") {
          return new Promise((resolve) => {
            resolveFirstPut = resolve;
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      let resolutionPromise: Promise<void> | undefined;
      act(() => {
        resolutionPromise = result.current.resolveConflict("local");
      });

      // 3. Assert the first PUT body contains the snapshot captured at request start and uses baseRevision 15
      let putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
      const firstPutBody = JSON.parse(putCalls[0][1]?.body as string);
      expect(firstPutBody.baseRevision).toBe(15);
      expect(firstPutBody.data.targetFund).toBe(11000);
      expect(firstPutBody.data.updatedAt).toBe(1500);

      // 4. Advance time and make a new local financial edit through commitDataChange while first PUT is in flight
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        result.current.commitDataChange((prev) => ({
          ...prev,
          targetFund: 13500,
        }));
        await Promise.resolve();
      });

      // Confirm no concurrent second PUT was sent against stale revision 15
      putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
      expect(globalData.targetFund).toBe(13500);
      expect(globalData.updatedAt).toBeGreaterThan(1500);

      // Prepare deferred second PUT response to inspect follow-up request deterministically
      let resolveSecondPut: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce((_url: string, options: any) => {
        if (options?.method === "PUT") {
          return new Promise((resolve) => {
            resolveSecondPut = resolve;
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      // 5. Resolve the first PUT with the real accepted API response shape at revision 16
      await act(async () => {
        resolveFirstPut!({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            accepted: true,
            data: submittedSnapshot,
            revision: 16,
          }),
        });
        await resolutionPromise!;
        await Promise.resolve();
      });

      // 6. Newer local value remains in memory and is not overwritten by submittedSnapshot
      expect(globalData.targetFund).toBe(13500);
      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();

      // 7. Accepted base revision remains 16
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("16");

      // 8. Before the 2000ms retry boundary (at 1500ms), no follow-up PUT has fired yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
        await Promise.resolve();
      });
      putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);

      // 9. Advance past the 2000ms retry boundary (+500ms): exactly one follow-up PUT fires with newer local value and baseRevision: 16
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
        await Promise.resolve();
      });
      putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(2);
      const secondPutBody = JSON.parse(putCalls[1][1]?.body as string);
      expect(secondPutBody.baseRevision).toBe(16);
      expect(secondPutBody.data.targetFund).toBe(13500);

      // 10. Resolve the subsequent push with accepted revision 17 and verify no duplicate retry or stale revision write occurs
      await act(async () => {
        resolveSecondPut!({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            accepted: true,
            data: secondPutBody.data,
            revision: 17,
          }),
        });
        await Promise.resolve();
      });

      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("17");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.resolve();
      });
      putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(2);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("17");
    });

    it("preserves accepted revision and schedules no follow-up PUT when no mutation occurs during Keep Local", async () => {
      const submittedSnapshot = { ...globalData, updatedAt: 1500, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: submittedSnapshot,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(submittedSnapshot, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: submittedSnapshot,
          revision: 16,
        }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("16");

      // Advance fake timers past backoff windows: no unnecessary second PUT is scheduled
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.resolve();
      });

      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("16");
    });

    it.each(["local", "cloud"] as const)("blocks Keep %s when backup storage fails", async (resolution) => {
      const conflict = {
        baseRevision: 10, cloudRevision: 15, detectedAt: 1000,
        localSnapshot: globalData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflict));
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      mockFetch.mockClear();
      setGlobalData.mockClear();
      mockStorage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });

      await act(async () => { await result.current.resolveConflict(resolution); });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(showToast).toHaveBeenCalledWith("⚠️ Could not back up local changes. Conflict remains active.");
    });

    it("retains the five most recent account-scoped recovery snapshots", async () => {
      const sub = "user_123";
      const conflict = {
        baseRevision: 10, cloudRevision: 15, detectedAt: 1000,
        localSnapshot: globalData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
      };
      const prior = Array.from({ length: 5 }, (_, index) => ({
        ...conflict, cloudRevision: 14 - index, resolution: "cloud", resolvedAt: 1500 - index,
      }));
      localStorage.setItem("ft_sync_conflict_backups_user_123", JSON.stringify(prior));
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflict));
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => { await result.current.resolveConflict("cloud"); });

      expect(loadScopedConflictBackups(sub).map(entry => entry.cloudRevision)).toEqual([15, 14, 13, 12, 11]);
      expect(loadScopedConflictBackups("user_456")).toEqual([]);
      expect(result.current.conflictState).toBeNull();
    });

    it("F-01: explicit Keep Cloud adopts cloud snapshot even when cloud updatedAt is older than local updatedAt", async () => {
      const newerLocalData = { ...globalData, updatedAt: 3000, targetFund: 11000 };
      const olderCloudSnapshot = { ...globalData, updatedAt: 1500, targetFund: 15000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: newerLocalData,
        cloudSnapshot: olderCloudSnapshot,
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_master_data_v1_user_123", JSON.stringify(newerLocalData));
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(newerLocalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      setGlobalData.mockClear();
      mockBroadcastPostMessage.mockClear();

      await act(async () => {
        await result.current.resolveConflict("cloud");
        await vi.advanceTimersByTimeAsync(1);
      });

      // Cloud snapshot is adopted in React state and localStorage despite older updatedAt (1500 < 3000)
      expect(setGlobalData).toHaveBeenCalledWith(olderCloudSnapshot);
      expect(globalData.targetFund).toBe(15000);
      expect(globalData.updatedAt).toBe(1500);
      const persistedMaster = JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!);
      expect(persistedMaster.targetFund).toBe(15000);
      expect(persistedMaster.updatedAt).toBe(1500);

      // Conflict clears and cloudRevision (15) is adopted as base revision
      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("15");

      // Observable hook state (latestDataRef and baseRevisionRef) reflects the adopted cloud snapshot and revision 15
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: olderCloudSnapshot,
          revision: 16,
        }),
      });

      await act(async () => {
        await result.current.forceManualSync();
        await vi.advanceTimersByTimeAsync(1);
      });

      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
      const putBody = JSON.parse(putCalls[0][1]?.body as string);
      expect(putBody.baseRevision).toBe(15);
      expect(putBody.data.targetFund).toBe(15000);
      expect(putBody.data.updatedAt).toBe(1500);
    });

    it("F-01: retains conflict, local data, and base revision when Keep Cloud snapshot fails validation", async () => {
      const localData = { ...globalData, updatedAt: 3000, targetFund: 11000 };
      // Structurally valid finance object so conflict hydrates, but invalid updatedAt (-1) rejected by applyRemoteData
      const invalidCloudSnapshot = { ...globalData, updatedAt: -1, targetFund: 15000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: localData,
        cloudSnapshot: invalidCloudSnapshot,
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_master_data_v1_user_123", JSON.stringify(localData));
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      setGlobalData.mockClear();
      showToast.mockClear();
      mockBroadcastPostMessage.mockClear();

      await act(async () => {
        await result.current.resolveConflict("cloud");
        await vi.advanceTimersByTimeAsync(1);
      });

      // Local data, base revision, and conflict state must remain untouched
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(11000);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeTruthy();
      expect(localStorage.getItem("ft_sync_last_resolved_conflict_user_123")).toBeNull();
      expect(mockBroadcastPostMessage).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Could not apply cloud data: snapshot is invalid. Conflict remains active."
      );
    });

    it("pulls a higher server revision even when its timestamp is older", async () => {
      const localData = { ...globalData, updatedAt: 3000, targetFund: 11000 };
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      renderHook(() => useCloudSync(localData, setGlobalData, showToast));
      await act(() => vi.advanceTimersByTimeAsync(1));
      mockFetch.mockReset();
      setGlobalData.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ updatedAt: 2000, revision: 11 }),
      }).mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          record: { ...globalData, updatedAt: 2000, targetFund: 99000 },
          revision: 11,
        }),
      });

      await act(() => vi.advanceTimersByTimeAsync(3000));
      expect(mockFetch.mock.calls.map(([url]) => url.split("&")[0])).toEqual([
        "/api/sync?version_only=true", expect.stringContaining("/api/sync?t="),
      ]);
      expect(setGlobalData).toHaveBeenLastCalledWith(
        expect.objectContaining({ targetFund: 99000, updatedAt: 2000 }),
      );
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("11");
    });

    it.each([
      [9, 4000], [10, 4000], [undefined, 2000], [undefined, 3000],
    ])("ignores an out-of-order pull with revision %s and timestamp %s", async (revision, updatedAt) => {
      const localData = { ...globalData, updatedAt: 3000, targetFund: 11000 };
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));
      await act(() => vi.advanceTimersByTimeAsync(1));
      mockFetch.mockReset();
      setGlobalData.mockClear();

      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          record: { ...globalData, updatedAt, targetFund: 99000 },
          ...(revision === undefined ? {} : { revision }),
        }),
      });

      await act(() => result.current.pullLatestData(true));
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("recovers a missing local snapshot even if its matching revision remains", async () => {
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          record: { ...globalData, updatedAt: 2000, targetFund: 99000 },
          revision: 10,
        }),
      });
      renderHook(() => useCloudSync(INITIAL_UNIFIED_DATA, setGlobalData, showToast));

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(setGlobalData).toHaveBeenLastCalledWith(expect.objectContaining({ targetFund: 99000 }));
    });

    it("leaves another tab's pending edit intact when a GET returns a higher revision", async () => {
      const localData = { ...globalData, updatedAt: 3000, targetFund: 11000 };
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));
      await act(() => vi.advanceTimersByTimeAsync(1));
      mockFetch.mockReset();
      setGlobalData.mockClear();

      const key = "ft_sync_pending_writer:user_123:other-tab";
      const pending = JSON.stringify({
        version: 1, sub: "user_123", baseRevision: 10,
        snapshot: { ...localData, updatedAt: 4000, targetFund: 12000 },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => {
          localStorage.setItem(key, pending);
          return {
            record: { ...globalData, updatedAt: 2000, targetFund: 99000 },
            revision: 11,
          };
        },
      });

      await act(() => result.current.pullLatestData());
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBe(pending);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("ignores a pull started before a local edit even after that edit finishes uploading", async () => {
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));
      await act(() => vi.advanceTimersByTimeAsync(1));
      mockFetch.mockReset();

      let finishPull!: (value: unknown) => void;
      mockFetch.mockImplementationOnce(() => new Promise(resolve => { finishPull = resolve; }));
      const pull = result.current.pullLatestData(true);

      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ success: true, accepted: true, revision: 11 }),
      });
      await act(async () => {
        result.current.commitDataChange({ ...globalData, targetFund: 12000 });
      });
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("11");

      await act(async () => {
        finishPull({
          ok: true, status: 200,
          json: async () => ({
            record: { ...globalData, updatedAt: 2000, targetFund: 99000 },
            revision: 12,
          }),
        });
        await pull;
      });
      expect(setGlobalData).toHaveBeenLastCalledWith(expect.objectContaining({ targetFund: 12000 }));
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("11");
    });

    it("F-03: deferred Account A GET response is ignored after switching to Account B", async () => {
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      setGlobalData.mockClear();

      // Start a deferred GET under Account A (user_123)
      let resolveGetA: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveGetA = resolve;
        });
      });

      let pullPromiseA: Promise<void> | undefined;
      act(() => {
        pullPromiseA = result.current.pullLatestData();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1]?.headers?.Authorization).toBe(
        "Bearer header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig"
      );

      // Switch stored token to Account B (user_456) before Account A's GET resolves
      localStorage.setItem("ft_sync_base_revision_user_456", "2");
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig");

      // Resolve Account A's deferred GET with a newer snapshot and revision 55
      await act(async () => {
        resolveGetA!({
          ok: true,
          status: 200,
          json: async () => ({
            record: { ...globalData, updatedAt: 9000, targetFund: 77000 },
            revision: 55,
          }),
        });
        await pullPromiseA!;
        await vi.advanceTimersByTimeAsync(1);
      });

      // Account B's finance state and revision must be completely untouched
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(globalData.targetFund).toBe(10000);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("2");
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("F-03: deferred GET response is ignored if a conflict becomes active before the GET resolves", async () => {
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      setGlobalData.mockClear();

      // 1. Start a deferred GET
      let resolvePendingGet: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolvePendingGet = resolve;
        });
      });

      let pullPromise: Promise<void> | undefined;
      act(() => {
        pullPromise = result.current.pullLatestData();
      });

      // 2. Hydrate an active conflict while GET is in flight
      const activeConflict = {
        baseRevision: 10,
        localSnapshot: { ...globalData, updatedAt: 2000, targetFund: 11000 },
        cloudSnapshot: { ...globalData, updatedAt: 2500, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      const conflictJson = JSON.stringify(activeConflict);
      localStorage.setItem("ft_sync_conflict_user_123", conflictJson);

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_sync_conflict_user_123",
            newValue: conflictJson,
          })
        );
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState?.cloudRevision).toBe(15);

      // 3. Resolve the pending GET with a newer snapshot and revision 88
      await act(async () => {
        resolvePendingGet!({
          ok: true,
          status: 200,
          json: async () => ({
            record: { ...globalData, updatedAt: 9000, targetFund: 88000 },
            revision: 88,
          }),
        });
        await pullPromise!;
        await vi.advanceTimersByTimeAsync(1);
      });

      // Conflict, local data, and base revision remain unchanged
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("F-03: stale 401 from Account A GET does not pause sync after Account B becomes active", async () => {
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      let resolveGetA: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveGetA = resolve;
        });
      });

      let pullPromiseA: Promise<void> | undefined;
      act(() => {
        pullPromiseA = result.current.pullLatestData();
      });

      // Switch active account to Account B (user_456)
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig");

      // Account A's GET resolves with 401
      await act(async () => {
        resolveGetA!({
          ok: false,
          status: 401,
          json: async () => ({ error: "Unauthorized" }),
        });
        await pullPromiseA!;
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.syncNeedsSignIn).toBe(false);
    });

    it("F-03: stale Account A version-poll response does not trigger a GET using Account B's token", async () => {
      renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      let resolvePollA: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce((url: string) => {
        expect(url).toContain("version_only=true");
        return new Promise((resolve) => {
          resolvePollA = resolve;
        });
      });

      // Advance 3000ms to fire the 3-second version poll under Account A (user_123)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1]?.headers?.Authorization).toBe(
        "Bearer header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig"
      );

      // Switch stored token to Account B (user_456) before Account A's poll resolves
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig");

      // Resolve Account A's version poll with a newer timestamp
      await act(async () => {
        resolvePollA!({
          ok: true,
          status: 200,
          json: async () => ({ updatedAt: 99999 }),
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      // No follow-up GET may be triggered using Account B's token
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("F-03: rejects malformed supplied GET revisions without applying snapshot or persisting revision, while preserving legacy omitted-revision GET", async () => {
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      setGlobalData.mockClear();

      const malformedRevisions = [
        "12",
        -1,
        1.5,
        null,
        Number.MAX_SAFE_INTEGER + 1,
      ];

      for (const badRevision of malformedRevisions) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            record: { ...globalData, updatedAt: 9000, targetFund: 66000 },
            revision: badRevision,
          }),
        });

        await act(async () => {
          await result.current.pullLatestData();
          await vi.advanceTimersByTimeAsync(1);
        });

        expect(setGlobalData).not.toHaveBeenCalled();
        expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      }

      // Legacy GET response omitting `revision` applies newer snapshot without inventing/overwriting baseRevision
      const legacyNewerSnapshot = { ...globalData, updatedAt: 9500, targetFund: 44000 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          record: legacyNewerSnapshot,
        }),
      });

      await act(async () => {
        await result.current.pullLatestData();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(setGlobalData).toHaveBeenCalledWith(legacyNewerSnapshot);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("ignores Keep Cloud while a Keep Local PUT is in flight and preserves in-flight-edit resolution semantics", async () => {
      const submittedSnapshot = { ...globalData, updatedAt: 1500, targetFund: 11000 };
      const cloudSnapshot = { ...globalData, updatedAt: 2000, targetFund: 15000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: submittedSnapshot,
        cloudSnapshot,
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(submittedSnapshot, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      setGlobalData.mockClear();
      mockBroadcastPostMessage.mockClear();

      // 1. Start Keep Local with a deferred PUT
      let resolveFirstPut: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce((_url: string, options: any) => {
        if (options?.method === "PUT") {
          return new Promise((resolve) => {
            resolveFirstPut = resolve;
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      let keepLocalPromise: Promise<void> | undefined;
      act(() => {
        keepLocalPromise = result.current.resolveConflict("local");
      });

      let putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);

      // 2. Make an in-flight local edit while Keep Local PUT is pending
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
        result.current.commitDataChange((prev) => ({
          ...prev,
          targetFund: 13500,
        }));
        await Promise.resolve();
      });

      setGlobalData.mockClear();
      mockBroadcastPostMessage.mockClear();

      // 3. Call Keep Cloud while the Keep Local PUT is still pending
      await act(async () => {
        await result.current.resolveConflict("cloud");
      });

      // Keep Cloud must perform no snapshot adoption, no base revision update, no conflict removal, and no broadcast
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(globalData.targetFund).toBe(13500);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeTruthy();
      expect(mockBroadcastPostMessage).not.toHaveBeenCalled();

      // 4. Resolve the original Keep Local PUT and verify in-flight-edit behavior still passes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: { ...globalData, targetFund: 13500 },
          revision: 17,
        }),
      });

      await act(async () => {
        resolveFirstPut!({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            accepted: true,
            data: submittedSnapshot,
            revision: 16,
          }),
        });
        await keepLocalPromise!;
        await Promise.resolve();
      });

      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("16");
      expect(globalData.targetFund).toBe(13500);

      expect(mockBroadcastPostMessage).toHaveBeenCalledExactlyOnceWith({
        type: "CONFLICT_RESOLVED",
        payload: {
          sub: "user_123",
          resolution: "local",
          winningSnapshot: submittedSnapshot,
          winningRevision: 16,
        },
      });

      // Advance 2000ms for the scheduled follow-up PUT of the in-flight edit
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        await Promise.resolve();
      });

      putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(2);
      const secondPutBody = JSON.parse(putCalls[1][1]?.body as string);
      expect(secondPutBody.baseRevision).toBe(16);
      expect(secondPutBody.data.targetFund).toBe(13500);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("17");
    });

    it("Finding A (newer peer edit): receiving CONFLICT_RESOLVED with older snapshot preserves newer local data, the pending edit, base revision, and conflict state", async () => {
      const existingConflict = {
        baseRevision: 10,
        localSnapshot: { ...globalData, updatedAt: 2000, targetFund: 11000 },
        cloudSnapshot: { ...globalData, updatedAt: 2200, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(existingConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      // Commit a newer edit locally while the conflict is active.

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        result.current.commitDataChange((prev) => ({
          ...prev,
          targetFund: 42000,
        }));
        await Promise.resolve();
      });

      const newerLocalTimestamp = globalData.updatedAt;
      expect(newerLocalTimestamp).toBeGreaterThan(2500);
      expect(globalData.targetFund).toBe(42000);

      setGlobalData.mockClear();
      showToast.mockClear();

      await act(async () => {
        window.dispatchEvent(new StorageEvent("storage", {
          key: "ft_sync_conflict_user_123", newValue: null,
        }));
        deliverBroadcastMessage({
          type: "CONFLICT_RESOLVED",
          payload: {
            sub: "user_123",
            winningSnapshot: { ...globalData, updatedAt: newerLocalTimestamp! + 1000, targetFund: 9000 },
            winningRevision: 14,
          },
        });
      });
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");

      // Deliver a same-account CONFLICT_RESOLVED broadcast carrying an older winning snapshot (updatedAt: 2500 < newerLocalTimestamp)
      const olderWinningSnapshot = { ...globalData, updatedAt: 2500, targetFund: 15000 };
      await act(async () => {
        deliverBroadcastMessage({
          type: "CONFLICT_RESOLVED",
          payload: {
            sub: "user_123",
            resolution: "cloud",
            winningSnapshot: olderWinningSnapshot,
            winningRevision: 15,
          },
        });
      });

      // Local snapshot, base revision (10), and active conflict are preserved
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(globalData.targetFund).toBe(42000);
      expect(globalData.updatedAt).toBe(newerLocalTimestamp);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(result.current.conflictState).toBeTruthy();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeTruthy();
      expect(showToast).toHaveBeenCalledWith(
        "⚠️ Another tab resolved a sync conflict, but this tab has newer local changes."
      );

      const acceptedSnapshot = { ...olderWinningSnapshot, targetFund: 31000 };
      localStorage.removeItem("ft_sync_conflict_user_123");
      await act(async () => {
        deliverBroadcastMessage({
          type: "CONFLICT_RESOLVED",
          payload: {
            sub: "user_123",
            resolution: "local",
            winningSnapshot: acceptedSnapshot,
            winningRevision: 16,
          },
        });
      });
      expect(result.current.conflictState).toMatchObject({
        baseRevision: 10,
        cloudRevision: 16,
        cloudSnapshot: acceptedSnapshot,
        localSnapshot: globalData,
      });
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();

      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(8000);
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(globalData.targetFund).toBe(42000);
      expect(result.current.conflictState?.cloudRevision).toBe(16);
    });

    it("Finding A (clean peer adoption): adopts a higher resolved revision even if the winning snapshot timestamp is older", async () => {
      const olderLocalData = { ...globalData, updatedAt: 1200, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: olderLocalData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(olderLocalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState).toBeTruthy();
      mockFetch.mockReset();
      setGlobalData.mockClear();

      const peerDraft = { ...globalData, updatedAt: 4500, targetFund: 42000 };
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { sub: "user_123", data: peerDraft },
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      const winningSnapshot = { ...globalData, updatedAt: 1000, targetFund: 28000 };
      const resolution = {
        type: "CONFLICT_RESOLVED",
        payload: {
          sub: "user_123",
          resolution: "local",
          winningSnapshot,
          winningRevision: 18,
        },
      };
      await act(async () => {
        deliverBroadcastMessage(resolution);
        deliverBroadcastMessage(resolution);
      });

      // Snapshot is adopted in state and localStorage
      expect(setGlobalData).toHaveBeenCalledExactlyOnceWith(winningSnapshot);
      expect(globalData.targetFund).toBe(28000);
      expect(globalData.updatedAt).toBe(1000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(28000);

      // Base revision is updated in scoped localStorage and conflict state clears
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("18");
      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();

      // In-memory baseRevisionRef is also updated to 18 (verified via subsequent manual sync PUT)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: winningSnapshot,
          revision: 19,
        }),
      });

      await act(async () => {
        await result.current.forceManualSync();
        await vi.advanceTimersByTimeAsync(1);
      });

      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(1);
      const putBody = JSON.parse(putCalls[0][1]?.body as string);
      expect(putBody.baseRevision).toBe(18);
      expect(putBody.data.targetFund).toBe(28000);
    });

    it("Finding A (wrong-account message): ignores CONFLICT_RESOLVED broadcast with a different or missing sub", async () => {
      const localData = { ...globalData, updatedAt: 1200, targetFund: 11000 };
      const initialConflict = {
        baseRevision: 10,
        localSnapshot: localData,
        cloudSnapshot: { ...globalData, updatedAt: 2000, targetFund: 15000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      localStorage.setItem("ft_master_data_v1_user_123", JSON.stringify(localData));
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(initialConflict));
      localStorage.setItem("ft_sync_base_revision_user_123", "10");

      const { result } = renderHook(() => useCloudSync(localData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      setGlobalData.mockClear();
      showToast.mockClear();

      const foreignWinningSnapshot = { ...globalData, updatedAt: 9000, targetFund: 99000 };

      // 1. Different Google subject (user_999 !== user_123)
      await act(async () => {
        deliverBroadcastMessage({
          type: "CONFLICT_RESOLVED",
          payload: {
            sub: "user_999",
            resolution: "cloud",
            winningSnapshot: foreignWinningSnapshot,
            winningRevision: 77,
          },
        });
      });

      // 2. Unscoped message (missing sub)
      await act(async () => {
        deliverBroadcastMessage({
          type: "CONFLICT_RESOLVED",
          payload: {
            resolution: "cloud",
            winningSnapshot: foreignWinningSnapshot,
            winningRevision: 77,
          },
        });
      });

      expect(setGlobalData).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(11000);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(localStorage.getItem("ft_sync_base_revision_user_999")).toBeNull();
      expect(result.current.conflictState?.cloudRevision).toBe(15);
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeTruthy();
      expect(showToast).not.toHaveBeenCalled();
    });

    it("Finding B (two overlapping pulls, same account): superseded GET A is ignored after newer GET B starts and resolves", async () => {
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      const { result } = renderHook(() => useCloudSync(globalData, setGlobalData, showToast));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      setGlobalData.mockClear();
      showToast.mockClear();

      let resolveGetA: ((value: any) => void) | undefined;
      let resolveGetB: ((value: any) => void) | undefined;

      mockFetch
        .mockImplementationOnce(() => {
          return new Promise((resolve) => {
            resolveGetA = resolve;
          });
        })
        .mockImplementationOnce(() => {
          return new Promise((resolve) => {
            resolveGetB = resolve;
          });
        });

      // 1. Start GET A (deferred)
      let pullPromiseA: Promise<void> | undefined;
      act(() => {
        pullPromiseA = result.current.pullLatestData();
      });

      // 2. Start GET B for the same account while GET A is still in flight
      let pullPromiseB: Promise<void> | undefined;
      act(() => {
        pullPromiseB = result.current.pullLatestData();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.isSyncing).toBe(true);

      // 3. Resolve GET B first with snapshot B (updatedAt: 4000, targetFund: 31000, revision: 21)
      const snapshotB = { ...globalData, updatedAt: 4000, targetFund: 31000 };
      await act(async () => {
        resolveGetB!({
          ok: true,
          status: 200,
          json: async () => ({
            record: snapshotB,
            revision: 21,
          }),
        });
        await pullPromiseB!;
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(setGlobalData).toHaveBeenCalledWith(snapshotB);
      expect(globalData.targetFund).toBe(31000);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("21");
      expect(result.current.isSyncing).toBe(false);

      setGlobalData.mockClear();
      showToast.mockClear();

      // 4. Now resolve superseded GET A with a different snapshot/revision A (even with a newer updatedAt: 6000)
      const snapshotA = { ...globalData, updatedAt: 6000, targetFund: 99000 };
      await act(async () => {
        resolveGetA!({
          ok: true,
          status: 200,
          json: async () => ({
            record: snapshotA,
            revision: 99,
          }),
        });
        await pullPromiseA!;
        await vi.advanceTimersByTimeAsync(1);
      });

      // Superseded GET A is completely ignored: B's data and base revision remain unchanged, no stale toast/auth event
      expect(setGlobalData).not.toHaveBeenCalled();
      expect(globalData.targetFund).toBe(31000);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("21");
      expect(showToast).not.toHaveBeenCalled();
      expect(result.current.syncNeedsSignIn).toBe(false);

      // 5. Verify a superseded request finishing BEFORE the newer request does not clear isSyncing or pause sync
      let resolveGetC: ((value: any) => void) | undefined;
      let resolveGetD: ((value: any) => void) | undefined;
      mockFetch
        .mockImplementationOnce(() => new Promise((r) => { resolveGetC = r; }))
        .mockImplementationOnce(() => new Promise((r) => { resolveGetD = r; }));

      let pullPromiseC: Promise<void> | undefined;
      let pullPromiseD: Promise<void> | undefined;
      act(() => {
        pullPromiseC = result.current.pullLatestData();
        pullPromiseD = result.current.pullLatestData();
      });

      expect(result.current.isSyncing).toBe(true);

      // Superseded GET C resolves with 401 while GET D is still pending
      await act(async () => {
        resolveGetC!({
          ok: false,
          status: 401,
          json: async () => ({ error: "Unauthorized" }),
        });
        await pullPromiseC!;
      });

      expect(result.current.syncNeedsSignIn).toBe(false);
      // GET D is still active so loading indicator remains true
      expect(result.current.isSyncing).toBe(true);

      // Now resolve GET D normally
      const snapshotD = { ...globalData, updatedAt: 5000, targetFund: 45000 };
      await act(async () => {
        resolveGetD!({
          ok: true,
          status: 200,
          json: async () => ({
            record: snapshotD,
            revision: 22,
          }),
        });
        await pullPromiseD!;
      });

      expect(result.current.isSyncing).toBe(false);
      expect(globalData.targetFund).toBe(45000);
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("22");
    });

    // ==========================================
    // P0-B2 Gate 1: Scoped Persistence & Legacy Preservation
    // ==========================================
    it("B2-Test 2 (Scoped persistence): Account A writes only ft_master_data_v1_user_123, Account B writes only ft_master_data_v1_user_456, switching back restores A, and null/invalid sub writes no keys", async () => {
      const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      // 1. Account A commits a change -> persisted to ft_master_data_v1_user_123
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 11 }),
      });

      await act(async () => {
        result.current.commitDataChange((prev: any) => ({
          ...prev,
          targetFund: 41000,
        }));
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(41000);
      expect(localStorage.getItem("ft_master_data_v1_user_456")).toBeNull();
      expect(localStorage.getItem("ft_master_data_v1")).toBeNull();

      // 2. Switch to Account B -> B has empty cloud initially, then commits targetFund: 82000
      localStorage.setItem("ft_google_token", tokenB);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_google_token",
            newValue: tokenB,
          })
        );
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      // Account A's data must not be written under Account B's key on switch
      expect(localStorage.getItem("ft_master_data_v1_user_456")).toBeNull();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 3 }),
      });

      await act(async () => {
        result.current.commitDataChange((prev: any) => ({
          ...prev,
          targetFund: 82000,
        }));
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_456")!).targetFund).toBe(82000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(41000);
      expect(localStorage.getItem("ft_master_data_v1")).toBeNull();

      // 3. Switch back to Account A -> restores A's local snapshot (41000) immediately
      localStorage.setItem("ft_google_token", tokenA);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_google_token",
            newValue: tokenA,
          })
        );
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(globalData.targetFund).toBe(41000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(41000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_456")!).targetFund).toBe(82000);

      // 4. Switch to invalid/signed-out token -> writes no unscoped or account finance keys
      localStorage.setItem("ft_google_token", "invalid-non-jwt-token");
      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_google_token",
            newValue: "invalid-non-jwt-token",
          })
        );
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      await act(async () => {
        result.current.commitDataChange((prev: any) => ({
          ...prev,
          targetFund: 99999,
        }));
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(localStorage.getItem("ft_master_data_v1")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision")).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict")).toBeNull();
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(41000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_456")!).targetFund).toBe(82000);
    });

    it("B2-Test 7 (Storage-event isolation): ignores unscoped legacy key and other accounts' keys, accepting only active-sub key after rechecking current token", async () => {
      const { rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      setGlobalData.mockClear();

      const foreignSnapshot = { ...globalData, updatedAt: 9000, targetFund: 77000 };

      // 1. Unscoped legacy key storage event -> ignored
      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_master_data_v1",
            newValue: JSON.stringify(foreignSnapshot),
          })
        );
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 2. Another account's scoped key storage event -> ignored
      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_master_data_v1_user_456",
            newValue: JSON.stringify(foreignSnapshot),
          })
        );
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 3. Active account's scoped key storage event, but current token changed to user_456 before handler checks -> ignored
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig");
      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_master_data_v1_user_123",
            newValue: JSON.stringify(foreignSnapshot),
          })
        );
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // Restore token to user_123 and verify matching active-sub storage event is accepted
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig");
      const validSameAccountSnapshot = { ...globalData, updatedAt: 9500, targetFund: 64000 };
      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_master_data_v1_user_123",
            newValue: JSON.stringify(validSameAccountSnapshot),
          })
        );
        rerender();
      });
      expect(setGlobalData).toHaveBeenCalledWith(validSameAccountSnapshot);
      expect(globalData.targetFund).toBe(64000);
    });

    it("B2-Test 8 (Legacy preservation): preserves unscoped ft_master_data_v1 byte-for-byte across initialization and account switches without loading or uploading it", async () => {
      const legacyRawJson = JSON.stringify({
        ...INITIAL_UNIFIED_DATA,
        updatedAt: 999999,
        targetFund: 123456,
        wallets: { main: 54321, savings: 0, cash: 0 },
      });
      localStorage.setItem("ft_master_data_v1", legacyRawJson);

      const initialClean = { ...INITIAL_UNIFIED_DATA };
      let currentState = initialClean;
      const trackSetState = vi.fn((next: any) => {
        currentState = typeof next === "function" ? next(currentState) : next;
      });

      mockFetch.mockReset();
      // Mount under user_123 with empty cloud response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const { result, rerender } = renderHook(() =>
        useCloudSync(currentState, trackSetState, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      // Legacy key is untouched and never hydrated into user_123
      expect(localStorage.getItem("ft_master_data_v1")).toBe(legacyRawJson);
      expect(currentState.targetFund).toBe(INITIAL_UNIFIED_DATA.targetFund);
      expect(localStorage.getItem("ft_master_data_v1_user_123")).toBeNull();

      // Switch to user_456 with empty cloud response
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      localStorage.setItem("ft_google_token", tokenB);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ft_google_token",
            newValue: tokenB,
          })
        );
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      // Legacy key remains byte-for-byte identical and never enters user_456 state, scoped storage, or cloud PUTs
      expect(localStorage.getItem("ft_master_data_v1")).toBe(legacyRawJson);
      expect(currentState.targetFund).toBe(INITIAL_UNIFIED_DATA.targetFund);
      expect(localStorage.getItem("ft_master_data_v1_user_456")).toBeNull();
      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(0);
      expect(result.current.hasInitialSyncCompleted).toBe(true);
    });

    // ==========================================
    // P0-B2 Gate 2: Account Transition, Hydration, Empty Cloud & Retry Isolation
    // ==========================================
    it("B2-Test 1 (Same-tab A logout -> B login): clears A data immediately, gates hydration until B GET completes, and uses B scoped or initial data", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      // Account A commits data (targetFund: 55000)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 11 }),
      });

      await act(async () => {
        result.current.commitDataChange((prev: any) => ({
          ...prev,
          targetFund: 55000,
        }));
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(globalData.targetFund).toBe(55000);
      mockFetch.mockReset();

      // 1. Same-tab logout from Account A (token removed + notifyAuthTokenChanged)
      await act(async () => {
        localStorage.removeItem("ft_google_token");
        notifyAuthTokenChanged();
        rerender();
      });

      expect(result.current.activeSub).toBeNull();
      expect(globalData).toEqual(INITIAL_UNIFIED_DATA);
      expect(result.current.hasInitialSyncCompleted).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();

      // 2. Same-tab login to Account B while B's initial GET is held pending
      let resolveGetB: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveGetB = resolve;
        });
      });

      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
      });

      // Immediately after B login (before GET resolves): A's data is absent, hydration gate is closed
      expect(result.current.activeSub).toBe("user_456");
      expect(globalData.targetFund).toBe(INITIAL_UNIFIED_DATA.targetFund);
      expect(result.current.hasInitialSyncCompleted).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1]?.headers?.Authorization).toBe(
        `Bearer ${tokenB}`
      );

      // 3. Resolve B's initial GET -> hydration completes and B's data is applied
      const cloudDataB = { ...INITIAL_UNIFIED_DATA, updatedAt: 2000, targetFund: 32000 };
      await act(async () => {
        resolveGetB!({
          ok: true,
          status: 200,
          json: async () => ({ record: cloudDataB, revision: 4 }),
        });
        await vi.advanceTimersByTimeAsync(1);
        rerender();
      });

      expect(result.current.hasInitialSyncCompleted).toBe(true);
      expect(globalData.targetFund).toBe(32000);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("4");
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_456")!).targetFund).toBe(32000);
    });

    it("B2-Test 5 (Retry/reconnect isolation): A's scheduled retry and dirty state are cancelled on switch; firing timers and online event cannot send A payload with B token or block B's initial GET", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      // 1. Account A commits a mutation that fails with 502, leaving isDirtyRef = true and arming a 2s retry timer
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "Bad Gateway" }),
      });

      await act(async () => {
        result.current.commitDataChange((prev: any) => ({
          ...prev,
          targetFund: 66000,
        }));
        rerender();
        await Promise.resolve();
      });

      expect(globalData.targetFund).toBe(66000);
      expect(mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT")).toHaveLength(1);
      mockFetch.mockReset();

      // 2. Before the 2s retry fires, switch to Account B (user_456)
      const cloudDataB = { ...INITIAL_UNIFIED_DATA, updatedAt: 1800, targetFund: 21000 };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ record: cloudDataB, revision: 3 }),
      });

      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      // B's initial silent GET was NOT blocked by A's prior dirty state!
      const getCallsForB = mockFetch.mock.calls.filter(
        (c: any) => (!c[1]?.method || c[1]?.method === "GET") && !String(c[0]).includes("version_only=true")
      );
      expect(getCallsForB).toHaveLength(1);
      expect(getCallsForB[0][1]?.headers?.Authorization).toBe(`Bearer ${tokenB}`);
      expect(globalData.targetFund).toBe(21000);

      mockFetch.mockClear();

      // 3. Advance past Account A's 2s/4s/8s retry windows and fire "online" reconnect event
      await act(async () => {
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(15000);
      });

      // Zero PUT requests may be sent for A's dirty data or using B's token
      const putCallsAfterSwitch = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCallsAfterSwitch).toHaveLength(0);
      expect(globalData.targetFund).toBe(21000);
    });

    it("B2-Test 9 (Empty remote response): when B GET returns {}, B gets only B scoped local data or INITIAL_UNIFIED_DATA, never A data, and initial hydration completes", async () => {
      const tokenA = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      const tokenC = "header.eyJzdWIiOiJ1c2VyXzc4OSJ9.sig";

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      // Account A has local data (targetFund: 88000, updatedAt: 5000)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 11 }),
      });

      await act(async () => {
        result.current.commitDataChange((prev: any) => ({
          ...prev,
          targetFund: 88000,
        }));
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(globalData.targetFund).toBe(88000);

      // Case 1: Switch to Account B (no scoped local data, cloud GET returns {})
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.activeSub).toBe("user_456");
      expect(result.current.hasInitialSyncCompleted).toBe(true);
      expect(globalData).toEqual(INITIAL_UNIFIED_DATA);
      expect(globalData.targetFund).not.toBe(88000);
      expect(localStorage.getItem("ft_master_data_v1_user_456")).toBeNull();

      // Case 2: Switch to Account C (has scoped local data in ft_master_data_v1_user_789, cloud GET returns {})
      const scopedLocalC = { ...INITIAL_UNIFIED_DATA, updatedAt: 1200, targetFund: 37000 };
      localStorage.setItem("ft_master_data_v1_user_789", JSON.stringify(scopedLocalC));
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await act(async () => {
        setLocalPasscode(tokenC);
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.activeSub).toBe("user_789");
      expect(result.current.hasInitialSyncCompleted).toBe(true);
      expect(globalData.targetFund).toBe(37000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_789")!).targetFund).toBe(37000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_123")!).targetFund).toBe(88000);
      // Restore tokenA for cleanup consistency
      localStorage.setItem("ft_google_token", tokenA);
    });

    // ==========================================
    // P0-B2 Gate 3: Async Request & Cross-Tab Isolation
    // ==========================================
    it("B2-Test 3 (Late GET after A -> B): late A success and late A 401 cannot affect B data, revision, loading, initial-sync state, active subject, or sync pause state", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      localStorage.setItem("ft_sync_base_revision_user_456", "3");

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();

      // 1. Start two manual GETs under Account A (one will resolve 200, one will resolve 401 after switch to B)
      let resolveGetA200: ((value: any) => void) | undefined;
      let resolveGetA401: ((value: any) => void) | undefined;
      let resolveGetB: ((value: any) => void) | undefined;

      mockFetch
        .mockImplementationOnce(() => new Promise((r) => { resolveGetA200 = r; }))
        .mockImplementationOnce(() => new Promise((r) => { resolveGetA401 = r; }))
        .mockImplementationOnce(() => new Promise((r) => { resolveGetB = r; }));

      let pullPromiseA1: Promise<void> | undefined;
      let pullPromiseA2: Promise<void> | undefined;
      act(() => {
        pullPromiseA1 = result.current.pullLatestData(false);
        pullPromiseA2 = result.current.pullLatestData(false);
      });

      expect(result.current.isSyncing).toBe(true);

      // 2. Switch to Account B while A's GETs are still pending
      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
      });

      // Transition immediately resets isSyncing and sets hasInitialSyncCompleted = false while B's initial GET is pending
      expect(result.current.activeSub).toBe("user_456");
      expect(result.current.isSyncing).toBe(false);
      expect(result.current.hasInitialSyncCompleted).toBe(false);

      // 3. Settle both of A's late GETs (200 with newer data and 401) BEFORE B's GET resolves
      await act(async () => {
        resolveGetA200!({
          ok: true,
          status: 200,
          json: async () => ({
            record: { ...globalData, updatedAt: 99000, targetFund: 91000 },
            revision: 77,
          }),
        });
        resolveGetA401!({
          ok: false,
          status: 401,
          json: async () => ({ error: "Unauthorized" }),
        });
        await pullPromiseA1!;
        await pullPromiseA2!;
      });

      // B's state, revision, initial-sync gate, activeSub, and sync pause state remain completely unaffected
      expect(result.current.activeSub).toBe("user_456");
      expect(result.current.hasInitialSyncCompleted).toBe(false);
      expect(globalData.targetFund).toBe(INITIAL_UNIFIED_DATA.targetFund);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("3");
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
      expect(result.current.syncNeedsSignIn).toBe(false);

      // 4. Now resolve B's initial GET -> B hydrates cleanly
      const cloudDataB = { ...INITIAL_UNIFIED_DATA, updatedAt: 2500, targetFund: 29000 };
      await act(async () => {
        resolveGetB!({
          ok: true,
          status: 200,
          json: async () => ({ record: cloudDataB, revision: 4 }),
        });
        await vi.advanceTimersByTimeAsync(1);
        rerender();
      });

      expect(result.current.hasInitialSyncCompleted).toBe(true);
      expect(globalData.targetFund).toBe(29000);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("4");
    });

    it("B2-Test 4 (Late PUT/finally after A -> B): B can start a push while A remains pending, and settling A cannot release B's lock or alter B's isSyncing, dirty/retry state, or toasts", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      localStorage.setItem("ft_sync_base_revision_user_456", "3");

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      mockFetch.mockReset();
      showToast.mockClear();

      // 1. Account A starts a manual sync PUT that stays pending
      let resolvePutA: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolvePutA = resolve;
        });
      });

      let manualSyncPromiseA: Promise<void> | undefined;
      act(() => {
        manualSyncPromiseA = result.current.forceManualSync();
      });

      expect(result.current.isSyncing).toBe(true);

      // 2. Switch to Account B while A's PUT is still in flight
      mockFetch.mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      }));

      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.activeSub).toBe("user_456");
      expect(result.current.isSyncing).toBe(false);

      // 3. Account B starts its own PUT while Account A's PUT is STILL unresolved
      let resolvePutB: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolvePutB = resolve;
        });
      });

      let pushPromiseB: Promise<boolean> | undefined;
      act(() => {
        pushPromiseB = result.current.pushToCloud({
          ...INITIAL_UNIFIED_DATA,
          updatedAt: 3000,
          targetFund: 48000,
        });
      });

      // B was NOT blocked by A's prior push lock, and B's isSyncing is now true
      const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === "PUT");
      expect(putCalls).toHaveLength(2);
      expect(putCalls[1][1]?.headers?.Authorization).toBe(`Bearer ${tokenB}`);
      expect(result.current.isSyncing).toBe(true);

      // Verify a concurrent second push by B IS blocked while B's first push is still active
      let concurrentPushB: boolean | undefined;
      await act(async () => {
        concurrentPushB = await result.current.pushToCloud({
          ...INITIAL_UNIFIED_DATA,
          updatedAt: 3100,
          targetFund: 49000,
        });
      });
      expect(concurrentPushB).toBe(false);

      // 4. Now settle A's stale PUT with a 500 error while B's PUT is STILL in flight!
      await act(async () => {
        resolvePutA!({
          ok: false,
          status: 500,
          json: async () => ({ error: "Server Error" }),
        });
        await manualSyncPromiseA!;
      });

      // A's finally block must NOT clear B's isSyncing or B's push lock, nor show A's failure toast!
      expect(result.current.isSyncing).toBe(true);
      expect(showToast).not.toHaveBeenCalled();

      let concurrentPushBAfterASettled: boolean | undefined;
      await act(async () => {
        concurrentPushBAfterASettled = await result.current.pushToCloud({
          ...INITIAL_UNIFIED_DATA,
          updatedAt: 3200,
          targetFund: 50000,
        });
      });
      expect(concurrentPushBAfterASettled).toBe(false);

      // 5. Now settle B's PUT -> B's lock and isSyncing release and B's revision updates
      let outcomeB: boolean | undefined;
      await act(async () => {
        resolvePutB!({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            accepted: true,
            data: { ...INITIAL_UNIFIED_DATA, updatedAt: 3000, targetFund: 48000 },
            revision: 4,
          }),
        });
        outcomeB = await pushPromiseB!;
      });

      expect(outcomeB).toBe(true);
      expect(result.current.isSyncing).toBe(false);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("4");
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    it("B2-Test 6 (Broadcast isolation): SYNC_DATA from A is ignored by B, matching-sub is accepted, and missing/empty/non-string/legacy no-sub messages are rejected", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      localStorage.setItem("ft_google_token", tokenB);

      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const { rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      setGlobalData.mockClear();
      mockBroadcastPostMessage.mockClear();

      const incomingSnapshot = { ...globalData, updatedAt: 8000, targetFund: 73000 };

      // 1. Message from Account A (user_123 !== user_456) -> rejected
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { sub: "user_123", data: incomingSnapshot },
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 2. Missing sub -> rejected
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { data: incomingSnapshot },
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 3. Empty string sub -> rejected
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { sub: "   ", data: incomingSnapshot },
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 4. Non-string sub -> rejected
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { sub: 456, data: incomingSnapshot },
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 5. Legacy unscoped payload shape (payload is finance data directly without sub) -> rejected
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: incomingSnapshot,
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 6. Matching sub ("user_456"), but token in localStorage was changed to user_123 before receive check -> rejected
      localStorage.setItem("ft_google_token", "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig");
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { sub: "user_456", data: incomingSnapshot },
        });
      });
      expect(setGlobalData).not.toHaveBeenCalled();

      // 7. Restore token to user_456 -> matching sub ("user_456") is accepted and persisted to ft_master_data_v1_user_456
      localStorage.setItem("ft_google_token", tokenB);
      await act(async () => {
        deliverBroadcastMessage({
          type: "SYNC_DATA",
          payload: { sub: "user_456", data: incomingSnapshot },
        });
        rerender();
      });
      expect(setGlobalData).toHaveBeenCalledWith(incomingSnapshot);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_456")!).targetFund).toBe(73000);

      // 8. Verify outgoing SYNC_DATA broadcast carries { sub: "user_456", data }
      mockBroadcastPostMessage.mockClear();
      globalData = { ...incomingSnapshot, updatedAt: 9000, targetFund: 74000 };
      await act(async () => {
        rerender();
      });
      expect(mockBroadcastPostMessage).toHaveBeenCalledWith({
        type: "SYNC_DATA",
        payload: {
          sub: "user_456",
          data: globalData,
        },
      });
    });

    it("B2-Test 10 (Keep Local account switch): starting A conflict resolution and switching to B before it settles leaves B's revision/conflict/dirty/lock/toasts untouched", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      const conflictA = {
        baseRevision: 10,
        localSnapshot: { ...globalData, updatedAt: 2000, targetFund: 14000 },
        cloudSnapshot: { ...globalData, updatedAt: 2500, targetFund: 18000 },
        cloudRevision: 15,
        detectedAt: 100000,
      };
      const conflictB = {
        baseRevision: 3,
        localSnapshot: { ...globalData, updatedAt: 3000, targetFund: 24000 },
        cloudSnapshot: { ...globalData, updatedAt: 3500, targetFund: 28000 },
        cloudRevision: 7,
        detectedAt: 200000,
      };

      localStorage.setItem("ft_sync_base_revision_user_123", "10");
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflictA));
      localStorage.setItem("ft_sync_base_revision_user_456", "3");
      localStorage.setItem("ft_sync_conflict_user_456", JSON.stringify(conflictB));

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.conflictState?.cloudRevision).toBe(15);
      mockFetch.mockReset();
      showToast.mockClear();

      // 1. Start resolveConflict("local") under Account A and hold its PUT in flight
      let resolvePutA: ((value: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolvePutA = resolve;
        });
      });

      let resolvePromiseA: Promise<void> | undefined;
      act(() => {
        resolvePromiseA = result.current.resolveConflict("local");
      });

      // 2. Switch to Account B before A's Keep Local PUT settles
      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
        await vi.advanceTimersByTimeAsync(1);
      });

      // Account B's conflict (cloudRevision: 7) is loaded and active
      expect(result.current.activeSub).toBe("user_456");
      expect(result.current.conflictState?.cloudRevision).toBe(7);

      // 3. Resolve A's pending PUT (even with 500 or 200 accepted)
      await act(async () => {
        resolvePutA!({
          ok: false,
          status: 500,
          json: async () => ({ error: "Server Error" }),
        });
        await resolvePromiseA!;
      });

      // B's conflict, revision, and toasts must remain completely untouched
      expect(result.current.conflictState?.cloudRevision).toBe(7);
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("3");
      expect(JSON.parse(localStorage.getItem("ft_sync_conflict_user_456")!).cloudRevision).toBe(7);
      expect(localStorage.getItem("ft_sync_last_resolved_conflict_user_456")).toBeNull();
      expect(showToast).not.toHaveBeenCalled();

      // 4. Verify Account B's conflict resolution lock is NOT stuck and B can resolve its own conflict
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          accepted: true,
          data: globalData,
          revision: 8,
        }),
      });

      await act(async () => {
        await result.current.resolveConflict("local");
        rerender();
      });

      expect(result.current.conflictState).toBeNull();
      expect(localStorage.getItem("ft_sync_conflict_user_456")).toBeNull();
      expect(localStorage.getItem("ft_sync_base_revision_user_456")).toBe("8");
      expect(localStorage.getItem("ft_sync_last_resolved_conflict_user_456")).toBeTruthy();
      // Account A's conflict in localStorage remains untouched from before the switch
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeTruthy();
      expect(localStorage.getItem("ft_sync_base_revision_user_123")).toBe("10");
    });

    // ==========================================
    // P0-B2 Follow-up: Persisted Conflict Hydration & Recovery Readiness
    // ==========================================
    it("Case A (Valid persisted conflict, scoped local snapshot absent/invalid): preserves conflict, exposes active-account conflict readiness without GET/persistence/broadcast, and never imports unscoped or foreign data", async () => {
      const conflictLocalSnapshot = {
        ...INITIAL_UNIFIED_DATA,
        targetFund: 33000,
        updatedAt: 2100,
      };
      const conflictCloudSnapshot = {
        ...INITIAL_UNIFIED_DATA,
        targetFund: 44000,
        updatedAt: 2600,
      };
      const persistedConflictA = {
        baseRevision: 4,
        localSnapshot: conflictLocalSnapshot,
        cloudSnapshot: conflictCloudSnapshot,
        cloudRevision: 9,
        detectedAt: 150000,
      };
      const foreignLegacyData = {
        ...INITIAL_UNIFIED_DATA,
        targetFund: 99000,
        updatedAt: 9900,
      };
      const foreignUserBData = {
        ...INITIAL_UNIFIED_DATA,
        targetFund: 88000,
        updatedAt: 8800,
      };

      // Seed valid JWT for user_123, valid conflict for user_123, invalid JSON for ft_master_data_v1_user_123,
      // and unrelated data in unscoped ft_master_data_v1 and ft_master_data_v1_user_456
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(persistedConflictA));
      localStorage.setItem("ft_master_data_v1_user_123", "{ invalid_json");
      localStorage.setItem("ft_master_data_v1", JSON.stringify(foreignLegacyData));
      localStorage.setItem("ft_master_data_v1_user_456", JSON.stringify(foreignUserBData));

      globalData = INITIAL_UNIFIED_DATA;
      mockFetch.mockClear();
      mockBroadcastPostMessage.mockClear();

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        rerender();
        await vi.advanceTimersByTimeAsync(50);
      });

      // 1. Conflict remains present, intact, and associated with user_123
      expect(result.current.activeSub).toBe("user_123");
      expect(result.current.hasActiveConflict).toBe(true);
      expect(result.current.conflictState).toEqual(persistedConflictA);
      expect(JSON.parse(localStorage.getItem("ft_sync_conflict_user_123")!)).toEqual(
        persistedConflictA
      );

      // 2. Local state recovered from validated conflict's localSnapshot (33000), not foreign or unscoped data
      expect(globalData.targetFund).toBe(33000);
      expect(globalData.updatedAt).toBe(2100);

      // 3. No ordinary cloud GET or PUT was issued, no broadcast sent, and legacy/foreign keys untouched
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockBroadcastPostMessage).not.toHaveBeenCalled();
      expect(localStorage.getItem("ft_master_data_v1_user_123")).toBe("{ invalid_json");
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1")!).targetFund).toBe(99000);
      expect(JSON.parse(localStorage.getItem("ft_master_data_v1_user_456")!).targetFund).toBe(88000);
    });

    it("Case B (Valid persisted conflict, scoped local snapshot present): preserves scoped local snapshot as displayed state while keeping conflict active and unresolved", async () => {
      const scopedMasterSnapshot = {
        ...INITIAL_UNIFIED_DATA,
        targetFund: 37500,
        updatedAt: 2400,
      };
      const persistedConflictA = {
        baseRevision: 4,
        localSnapshot: { ...INITIAL_UNIFIED_DATA, targetFund: 33000, updatedAt: 2100 },
        cloudSnapshot: { ...INITIAL_UNIFIED_DATA, targetFund: 44000, updatedAt: 2600 },
        cloudRevision: 9,
        detectedAt: 150000,
      };

      localStorage.setItem("ft_master_data_v1_user_123", JSON.stringify(scopedMasterSnapshot));
      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(persistedConflictA));

      globalData = loadScopedFinanceData("user_123");
      mockFetch.mockClear();

      const { result } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Scoped snapshot remains the displayed local state (37500)
      expect(globalData.targetFund).toBe(37500);
      expect(result.current.hasActiveConflict).toBe(true);
      expect(result.current.conflictState).toEqual(persistedConflictA);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem("ft_sync_conflict_user_123")!)).toEqual(
        persistedConflictA
      );
    });

    it("Case C (Account transition with persisted conflict): switching from user_123 to user_456 exposes only user_456's conflict and scoped state", async () => {
      const tokenB = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      const conflictA = {
        baseRevision: 2,
        localSnapshot: { ...INITIAL_UNIFIED_DATA, targetFund: 12000, updatedAt: 1200 },
        cloudSnapshot: { ...INITIAL_UNIFIED_DATA, targetFund: 19000, updatedAt: 1900 },
        cloudRevision: 6,
        detectedAt: 100000,
      };
      const conflictB = {
        baseRevision: 8,
        localSnapshot: { ...INITIAL_UNIFIED_DATA, targetFund: 61000, updatedAt: 6100 },
        cloudSnapshot: { ...INITIAL_UNIFIED_DATA, targetFund: 68000, updatedAt: 6800 },
        cloudRevision: 14,
        detectedAt: 200000,
      };

      localStorage.setItem("ft_sync_conflict_user_123", JSON.stringify(conflictA));
      localStorage.setItem("ft_sync_conflict_user_456", JSON.stringify(conflictB));
      // Intentionally omit ft_master_data_v1_user_456 to verify B recovers from B's own validated conflict

      globalData = loadScopedFinanceData("user_123");

      const { result, rerender } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      expect(result.current.activeSub).toBe("user_123");
      expect(result.current.hasActiveConflict).toBe(true);
      expect(result.current.conflictState?.cloudRevision).toBe(6);
      expect(globalData.targetFund).toBe(12000);

      mockFetch.mockClear();

      await act(async () => {
        setLocalPasscode(tokenB);
        rerender();
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(result.current.activeSub).toBe("user_456");
      expect(result.current.hasActiveConflict).toBe(true);
      expect(result.current.conflictState).toEqual(conflictB);
      expect(result.current.conflictState?.cloudRevision).toBe(14);
      expect(globalData.targetFund).toBe(61000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("Case D (Invalid persisted conflict): cleans up malformed conflict record, does not mark conflict active or bypass initial cloud hydration", async () => {
      localStorage.setItem("ft_sync_conflict_user_123", "{ malformed_conflict_json");
      mockFetch.mockReset();

      let resolveInitialGet: ((res: any) => void) | undefined;
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveInitialGet = resolve;
        });
      });

      globalData = loadScopedFinanceData("user_123");

      const { result } = renderHook(() =>
        useCloudSync(globalData, setGlobalData, showToast)
      );

      // Invalid conflict is cleaned up and never treated as an active conflict or completed sync
      expect(localStorage.getItem("ft_sync_conflict_user_123")).toBeNull();
      expect(result.current.conflictState).toBeNull();
      expect(result.current.hasActiveConflict).toBe(false);
      expect(result.current.hasInitialSyncCompleted).toBe(false);

      // Normal cloud GET was issued because invalid conflict did not block hydration
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveInitialGet!({
          ok: true,
          status: 200,
          json: async () => ({
            record: { ...INITIAL_UNIFIED_DATA, targetFund: 52000, updatedAt: 5200 },
            revision: 4,
          }),
        });
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(result.current.hasInitialSyncCompleted).toBe(true);
      expect(globalData.targetFund).toBe(52000);
    });
  });
});
