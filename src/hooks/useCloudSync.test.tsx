import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloudSync } from './useCloudSync';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

class MockBroadcastChannel {
  postMessage = vi.fn();
  close = vi.fn();
}
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

// Bulletproof Dictionary Store
let store: Record<string, string> = {};
const mockStorage = {
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

    // DIRECTLY seed the data dictionary instead of calling window.localStorage.setItem()
    store = {
      'ft_google_token': 'eyJhbGci.test.token'
    };

    mockStorage.getItem.mockImplementation((key: string) => store[key] || null);
    mockStorage.setItem.mockImplementation((key: string, value: string) => { store[key] = value?.toString() || ''; });
    mockStorage.removeItem.mockImplementation((key: string) => { delete store[key]; });
    mockStorage.clear.mockImplementation(() => { store = {}; });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, accepted: true })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    const putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);

    await act(async () => {
      resolveFirstFetch!({
        ok: true,
        json: async () => ({ success: true, accepted: true })
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
          json: async () => ({ success: true, accepted: true })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Advance 2 seconds (retry 1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
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
          json: async () => ({ success: true, accepted: true })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // Advance 2s (retry 1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
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

  it('does not schedule retry on 401', async () => {
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
          status: 401,
          json: async () => ({ error: 'Unauthorized' })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      result.current.commitDataChange((prev) => ({
        ...prev,
        targetFund: 88888
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
          json: async () => ({ success: true, accepted: true })
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
      json: async () => ({ success: true, accepted: true })
    });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    const putCalls = mockFetch.mock.calls.filter(c => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(1);
    const body = JSON.parse(putCalls[0][1]?.body as string);
    expect(body.targetFund).toBe(98765);
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
    expect(JSON.parse(putCalls[0][1]?.body as string).targetFund).toBe(10000);

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
          json: async () => ({ success: true, accepted: true })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    // 4. Resolves push A successfully.
    await act(async () => {
      resolvePushA!({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true })
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
    expect(bodyB.targetFund).toBe(20000);
  });
});
