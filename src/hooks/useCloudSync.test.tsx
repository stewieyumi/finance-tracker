import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloudSync } from './useCloudSync';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';

const mockFetch = vi.fn();

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();

class MockBroadcastChannel {
  postMessage = vi.fn();
  close = vi.fn();
}

describe('useCloudSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    localStorageMock.clear();
    localStorageMock.setItem('ft_sync_passcode', 'eyJhbGci.test.token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('commitDataChange instantly updates local state and pushes a new snapshot to the cloud', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, accepted: true })
    });

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => {
      result.current.commitDataChange((prev: any) => ({
        ...prev,
        targetFund: 99999
      }));
    });

    expect(mockSetGlobalData).toHaveBeenCalled();
    const newData = mockSetGlobalData.mock.calls[0][0];
    expect(newData.targetFund).toBe(99999);
    expect(newData.updatedAt).toBeGreaterThan(1000);

    expect(mockFetch).toHaveBeenCalledWith('/api/sync', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'x-sync-passcode': 'eyJhbGci.test.token'
      })
    }));
  });

  it('pullLatestData fetches from the cloud and overwrites state if cloud is newer', async () => {
    const newerCloudData = { ...INITIAL_UNIFIED_DATA, updatedAt: 5000, targetFund: 12345 };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => newerCloudData
    });

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = { ...INITIAL_UNIFIED_DATA, updatedAt: 1000 };

    const { result } = renderHook(() =>
      useCloudSync(initialData, mockSetGlobalData, mockShowToast)
    );

    await act(async () => {
      await result.current.pullLatestData();
    });

    expect(mockSetGlobalData).toHaveBeenCalledWith(newerCloudData);
  });

  it('silently ignores pullLatestData if unauthenticated', async () => {
    localStorageMock.removeItem('ft_sync_passcode');

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const { result } = renderHook(() =>
      useCloudSync(INITIAL_UNIFIED_DATA, mockSetGlobalData, mockShowToast)
    );

    await act(async () => {
      await result.current.pullLatestData();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
