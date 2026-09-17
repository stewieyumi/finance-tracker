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
    vi.clearAllMocks();
    
    // DIRECTLY seed the data dictionary instead of calling window.localStorage.setItem()
    store = {
      'ft_google_token': 'eyJhbGci.test.token'
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commitDataChange instantly updates local state and pushes a new snapshot to the cloud', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, accepted: true })
    });

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
    const mountData = { ...INITIAL_UNIFIED_DATA, updatedAt: 2000, targetFund: 22222 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mountData
    });

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
    mockFetch.mockResolvedValue({
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
});
