import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  syncShootsToNotion,
  isNotionSyncing,
  _resetSyncLockForTests,
} from "./notionSync";
import { Shoot } from "../types/finance";

describe("notionSync utility (src/utils/notionSync.ts)", () => {
  let storageMap: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => storageMap[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storageMap[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storageMap[key];
    }),
    clear: vi.fn(() => {
      storageMap = {};
    }),
  };

  const createMockShoots = (count: number): Shoot[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `shoot-${i + 1}`,
      title: `Shoot Title ${i + 1}`,
      date: "2026-10-15",
      category: "Solo Shoot",
      status: "Confirmed",
      completed: i % 2 === 0,
    }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    storageMap = { ft_google_token: "mock-google-id-token" };
    vi.stubGlobal("localStorage", mockLocalStorage);
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", {
        value: mockLocalStorage,
        writable: true,
      });
    }
    _resetSyncLockForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    _resetSyncLockForTests();
  });

  // 1. Empty shoots -> no request
  it("does not make an API request when shoots array is empty", async () => {
    const result = await syncShootsToNotion([]);

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      error: "No gigs to sync.",
    });
  });

  // Missing token
  it("returns authentication error and makes no request when token is missing", async () => {
    delete storageMap["ft_google_token"];
    const shoots = createMockShoots(3);

    const result = await syncShootsToNotion(shoots);

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      total: 3,
      processed: 0,
      created: 0,
      updated: 0,
      error: "Authentication required. Please sign in with Google.",
    });
  });

  // 2. One batch <= 10
  it("syncs a single batch with <= 10 shoots in one request", async () => {
    const shoots = createMockShoots(5);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, created: 3, updated: 2 }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/notion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-google-id-token",
      },
      body: expect.any(String),
    });

    const parsedBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as any).body
    );
    expect(parsedBody.shoots).toHaveLength(5);
    expect(result).toEqual({
      success: true,
      total: 5,
      processed: 5,
      created: 3,
      updated: 2,
    });
  });

  // 3. Exactly 10
  it("syncs exactly 10 shoots in a single request", async () => {
    const shoots = createMockShoots(10);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, created: 10, updated: 0 }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      total: 10,
      processed: 10,
      created: 10,
      updated: 0,
    });
  });

  // 4 & 5. More than 10 -> chunked and executed sequentially
  it("chunks more than 10 shoots into batches of 10 and executes sequentially", async () => {
    const shoots = createMockShoots(23);
    const callBatches: number[] = [];

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      callBatches.push(body.shoots.length);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          created: body.shoots.length,
          updated: 0,
        }),
      } as any;
    });

    const result = await syncShootsToNotion(shoots);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(callBatches).toEqual([10, 10, 3]);
    expect(result).toEqual({
      success: true,
      total: 23,
      processed: 23,
      created: 23,
      updated: 0,
    });
  });

  // 6. Aggregate created/updated counts across multiple chunks
  it("correctly aggregates created and updated counts across chunks", async () => {
    const shoots = createMockShoots(25);

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, created: 7, updated: 3 }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, created: 5, updated: 5 }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, created: 2, updated: 3 }),
      } as any);

    const result = await syncShootsToNotion(shoots);

    expect(result).toEqual({
      success: true,
      total: 25,
      processed: 25,
      created: 14,
      updated: 11,
    });
  });

  // 7 & 8. Stops after a failed batch and reports partial progress
  it("stops immediately after a failed batch and reports partial progress without rollback", async () => {
    const shoots = createMockShoots(25);

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, created: 8, updated: 2 }),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "NOTION_REQUEST_FAILED" }),
      } as any);

    const result = await syncShootsToNotion(shoots);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: false,
      total: 25,
      processed: 10,
      created: 8,
      updated: 2,
      failedBatch: 2,
      error: "Notion sync failed.",
    });
  });

  // 9. Handles 401 and dispatches auth-expired event
  it("handles 401 response and dispatches auth-expired window event", async () => {
    const shoots = createMockShoots(5);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "AUTH_REQUIRED" }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    expect(dispatchSpy.mock.calls[0][0].type).toBe("auth-expired");
    expect(result).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      failedBatch: 1,
      error: "Authentication expired. Please sign in again.",
    });
  });

  // 10. Handles 403
  it("handles 403 access denied response", async () => {
    const shoots = createMockShoots(5);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "AUTH_FORBIDDEN" }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(result).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      failedBatch: 1,
      error: "Access denied. Your Google account is not authorized for Notion sync.",
    });
  });

  // 11. Handles 400 schema mismatch
  it("handles 400 schema mismatch response", async () => {
    const shoots = createMockShoots(5);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: "SCHEMA_MISMATCH",
        message: "Notion database schema does not match required properties.",
      }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(result).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      failedBatch: 1,
      error: "Notion database schema mismatch.",
    });
  });

  // 12. Handles 429/529 rate-limited / overloaded
  it("handles 429 rate limit error", async () => {
    const shoots = createMockShoots(5);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "NOTION_RATE_LIMITED" }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(result).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      failedBatch: 1,
      error: "Notion is temporarily rate-limited. Try again later.",
    });
  });

  it("handles 529 service overload error", async () => {
    const shoots = createMockShoots(5);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 529,
      json: async () => ({ error: "NOTION_RATE_LIMITED" }),
    } as any);

    const result = await syncShootsToNotion(shoots);

    expect(result).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      failedBatch: 1,
      error: "Notion is temporarily rate-limited. Try again later.",
    });
  });

  // 13. Handles network failure
  it("handles network fetch rejection cleanly", async () => {
    const shoots = createMockShoots(5);

    vi.mocked(fetch).mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await syncShootsToNotion(shoots);

    expect(result).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      failedBatch: 1,
      error: "Connection failed. Please check your network and try again.",
    });
  });

  // 14. Sends only allowed shoot fields
  it("only sends allowed shoot fields and strips arbitrary properties", async () => {
    const dirtyShoots: any[] = [
      {
        id: "shoot-1",
        title: "Clean Title",
        date: "2026-10-15",
        category: "Commercial",
        status: "Confirmed",
        completed: false,
        extraMaliciousField: "ATTACK",
        internalAppCalculation: 9999,
        nestedObject: { secret: true },
      },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, created: 1, updated: 0 }),
    } as any);

    await syncShootsToNotion(dirtyShoots);

    const parsedBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as any).body
    );
    expect(parsedBody.shoots[0]).toEqual({
      id: "shoot-1",
      title: "Clean Title",
      date: "2026-10-15",
      category: "Commercial",
      status: "Confirmed",
      completed: false,
    });
    expect(parsedBody.shoots[0].extraMaliciousField).toBeUndefined();
    expect(parsedBody.shoots[0].internalAppCalculation).toBeUndefined();
    expect(parsedBody.shoots[0].nestedObject).toBeUndefined();
  });

  // 15. No concurrent requests
  it("prevents concurrent sync requests using internal lock", async () => {
    const shoots = createMockShoots(5);
    let resolveFirstFetch: any;

    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstFetch = resolve;
        })
    );

    const firstPromise = syncShootsToNotion(shoots);
    expect(isNotionSyncing()).toBe(true);

    const secondResult = await syncShootsToNotion(shoots);
    expect(secondResult).toEqual({
      success: false,
      total: 5,
      processed: 0,
      created: 0,
      updated: 0,
      error: "Sync already in progress.",
    });

    resolveFirstFetch({
      ok: true,
      status: 200,
      json: async () => ({ success: true, created: 5, updated: 0 }),
    });

    const firstResult = await firstPromise;
    expect(firstResult.success).toBe(true);
    expect(isNotionSyncing()).toBe(false);
  });
});
