import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpenseScanner } from "./useExpenseScanner";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import * as financeAuth from "../utils/financeAuth";

const baseGlobalData = {
  settings: INITIAL_UNIFIED_DATA.settings,
  wallets: INITIAL_UNIFIED_DATA.wallets,
};

describe("useExpenseScanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock Image so setting src synchronously fires onload
    class MockImage {
      width = 200;
      height = 100;
      onload: (() => void) | null = null;
      private _src = "";
      get src() { return this._src; }
      set src(val: string) {
        this._src = val;
        if (this.onload) this.onload();
      }
    }
    vi.stubGlobal("Image", MockImage);

    // Mock URL.createObjectURL
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    // Mock canvas
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => "data:image/jpeg;base64,fakejpegdata",
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    // Stub localStorage
    const localStorageMock = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens manual entry and does not upload without an account", () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: null, key: "", headers: {} });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleCapture(event);
    });

    expect(result.current.failure).toEqual({ message: expect.stringContaining("Sign in with Google"), canRetry: false });
    expect(onScanStart).toHaveBeenCalledOnce();
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.isScanning).toBe(false);
  });

  it("calls onScanStart and onScanComplete with parsed fields on a successful scan", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "test-token", headers: { Authorization: "Bearer test-token" } });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        parsed: {
          merchant: "Starbucks",
          amount: 150,
          category: "Food & Dining",
          date: "2026-09-22",
        },
      }),
    }));

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanStart).toHaveBeenCalledTimes(1);
    expect(onScanComplete).toHaveBeenCalledTimes(1);
    expect(onScanComplete).toHaveBeenCalledWith({
      merchant: "Starbucks",
      amount: "150",
      category: "Food & Dining",
      wallet: expect.any(String),
      date: "2026-09-22",
    });
    expect(showToast).toHaveBeenCalledWith("✨ Receipt scanned successfully! Review and tap Save & Deduct.");
    expect(result.current.isScanning).toBe(false);
  });

  it("handles malformed JSON response safely and stops scanning", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "test-token", headers: { Authorization: "Bearer test-token" } });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "Not valid json at all",
    }));

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanStart).toHaveBeenCalledTimes(1);
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.failure?.message).toContain("Unable to scan this receipt");
    expect(result.current.isScanning).toBe(false);
  });

  it("handles missing Gemini API key on the server (500)", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "test-token", headers: { Authorization: "Bearer test-token" } });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        error: "Server Error: GEMINI_API_KEY is missing.",
      }),
    }));

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.failure?.message).toContain("The scanner is unavailable");
    expect(result.current.isScanning).toBe(false);
  });

  it("rejects invalid or non-positive amount and does not call onScanComplete", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "test-token", headers: { Authorization: "Bearer test-token" } });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        parsed: {
          merchant: "Grocery",
          amount: -50,
          category: "Shopping",
        },
      }),
    }));

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.failure?.message).toContain("Could not detect a valid expense amount");
    expect(result.current.isScanning).toBe(false);
  });

  it("rejects completely incomplete scan results", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "test-token", headers: { Authorization: "Bearer test-token" } });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        parsed: {
          merchant: "",
          amount: null,
        },
      }),
    }));

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.failure?.message).toContain("Could not detect receipt details");
    expect(result.current.isScanning).toBe(false);
  });

  it("prevents duplicate concurrent scans when isScanning is already active", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "test-token", headers: { Authorization: "Bearer test-token" } });

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    let resolveFetch: (val: any) => void;
    const fetchPromise = new Promise(resolve => {
      resolveFetch = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      currentTarget: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    // First scan triggered
    act(() => {
      result.current.handleCapture(event);
    });

    expect(result.current.isScanning).toBe(true);
    expect(onScanStart).toHaveBeenCalledTimes(1);

    // Second scan attempted while first is in-flight
    act(() => {
      result.current.handleCapture(event);
    });

    // onScanStart should still be 1 (second scan was blocked)
    expect(onScanStart).toHaveBeenCalledTimes(1);

    // Finish first scan
    await act(async () => {
      resolveFetch!({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true,
          parsed: { merchant: "Cafe", amount: 100 },
        }),
      });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.isScanning).toBe(false);
  });

  it.each([
    [503, "temporarily unavailable", "The scanner is busy"],
    [401, '{"error":"Unauthorized: Missing token."}', "Reconnect your Google account"],
  ])("can retry the same photo after a %s response", async (status, response, message) => {
    const auth = vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({
      sub: "test-user", key: "old-session", headers: { "X-Finance-Session": "old" },
    });
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status, text: async () => response,
    }).mockResolvedValueOnce({
      ok: true, status: 200, text: async () => JSON.stringify({ parsed: { merchant: "Cafe", amount: 150 } }),
    });
    vi.stubGlobal("fetch", fetch);
    const onScanComplete = vi.fn();
    const onRejected = vi.fn();
    window.addEventListener("auth-expired", onRejected);
    try {
      const { result } = renderHook(() => useExpenseScanner({
        showToast: vi.fn(), globalData: baseGlobalData, onScanStart: vi.fn(), onScanComplete,
      }));
      const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
      await act(async () => {
        result.current.handleCapture({ currentTarget: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
      });
      expect(result.current.failure).toEqual({ message: expect.stringContaining(message), canRetry: true });
      expect(onRejected).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
      expect(onScanComplete).not.toHaveBeenCalled();

      auth.mockReturnValue({ sub: "test-user", key: "fresh-session", headers: { "X-Finance-Session": "fresh" } });
      await act(async () => { result.current.retryScan(); });
      expect(fetch.mock.calls[1][1].headers).toMatchObject({ "X-Finance-Session": "fresh" });
      expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
      expect(onScanComplete).toHaveBeenCalledOnce();
      expect(result.current.failure).toBeNull();
    } finally {
      window.removeEventListener("auth-expired", onRejected);
    }
  });

  it("ignores a late scanner result after switching to manual entry", async () => {
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "test-user", key: "session", headers: {} });
    let finishScan!: (response: unknown) => void;
    const fetch = vi.fn().mockReturnValue(new Promise(resolve => { finishScan = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const onScanComplete = vi.fn();
    const { result } = renderHook(() => useExpenseScanner({
      showToast: vi.fn(), globalData: baseGlobalData, onScanStart: vi.fn(), onScanComplete,
    }));
    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    await act(async () => {
      result.current.handleCapture({ currentTarget: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => result.current.stopScanning());
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      finishScan({ ok: true, status: 200, text: async () => JSON.stringify({ parsed: { merchant: "Cafe", amount: 150 } }) });
    });
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.isScanning).toBe(false);
  });
});

// These statuses belong to server/provider availability, so a valid app session must remain usable.
describe("scanner availability and draft validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "fixture-user", key: "fixture-session", headers: { "X-Finance-Session": "fixture" } });
    class ImageFixture {
      width = 200; height = 100; onload: (() => void) | null = null;
      set src(_value: string) { this.onload?.(); }
    }
    vi.stubGlobal("Image", ImageFixture);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fixture"), revokeObjectURL: vi.fn() });
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => tag === "canvas"
      ? { getContext: () => ({ drawImage: vi.fn() }), toDataURL: () => "data:image/jpeg;base64,Zml4dHVyZQ==" } as unknown as HTMLCanvasElement : create(tag));
    vi.stubGlobal("localStorage", { setItem: vi.fn(), removeItem: vi.fn(), getItem: vi.fn() });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function scan(body: unknown, status = 200) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: status < 400, status, text: async () => JSON.stringify(body) }));
    const onScanComplete = vi.fn();
    const hook = renderHook(() => useExpenseScanner({ showToast: vi.fn(), globalData: baseGlobalData, onScanStart: vi.fn(), onScanComplete }));
    await act(async () => {
      hook.result.current.handleCapture({ currentTarget: { files: [new File(["fixture"], "receipt.jpg", { type: "image/jpeg" })], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    return { ...hook, onScanComplete };
  }
  it.each([
    [502, "SCANNER_UNAVAILABLE", false, "scanner is unavailable"],
    [503, "SCANNER_UNAVAILABLE", false, "scanner is unavailable"],
    [503, "AUTH_UNAVAILABLE", true, "Unable to verify your sign-in"],
    [504, "AI_TIMEOUT", true, "Scanning took too long"],
  ])("keeps app authentication for %s %s", async (status, code, canRetry, message) => {
    const rejected = vi.fn(); window.addEventListener("auth-expired", rejected);
    try {
      const { result, onScanComplete } = await scan({ error: "Service unavailable", code }, status);
      expect(result.current.failure).toEqual({ message: expect.stringContaining(message), canRetry });
      expect(rejected).not.toHaveBeenCalled();
      expect(onScanComplete).not.toHaveBeenCalled();
      expect(result.current.isScanning).toBe(false);
    } finally { window.removeEventListener("auth-expired", rejected); }
  });
  it.each(["12.34.56", "100garbage", "1,00", true, 0.001])("rejects an ambiguous amount %s", async amount => {
    const { result, onScanComplete } = await scan({ parsed: { merchant: "Sample", amount } });
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.failure?.message).toContain("valid expense amount");
  });
  it("accepts a clearly formatted peso amount while keeping the configured wallet", async () => {
    const { onScanComplete } = await scan({ parsed: { merchant: "Sample", amount: "PHP 1,234.50", date: "2028-02-29", category: "Shopping" } });
    expect(onScanComplete).toHaveBeenCalledWith(expect.objectContaining({ amount: "1234.5", date: "2028-02-29", wallet: expect.any(String) }));
  });
  it("uses the existing today fallback for an impossible receipt date", async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { onScanComplete } = await scan({ parsed: { merchant: "Sample", amount: 100, date: "2026-02-30" } });
    expect(onScanComplete).toHaveBeenCalledWith(expect.objectContaining({ date: today }));
  });
});


describe("scanner browser deadline", () => {
  const file = new File(["synthetic receipt"], "receipt.jpg", { type: "image/jpeg" });
  const success = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ parsed: { merchant: "Sample Cafe", amount: 25.50 } }) });
  const capture = (handle: (event: React.ChangeEvent<HTMLInputElement>) => void) =>
    handle({ currentTarget: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
  let decodeImmediately: boolean;
  let completeImage: (() => void) | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    decodeImmediately = true;
    completeImage = undefined;
    vi.spyOn(financeAuth, "getFinanceAuth").mockReturnValue({ sub: "deadline-user", key: "deadline-session", headers: { "X-Finance-Session": "deadline-session" } });
    class ImageFixture {
      width = 200; height = 100; onload: (() => void) | null = null;
      set src(_value: string) {
        completeImage = () => this.onload?.();
        if (decodeImmediately) completeImage();
      }
    }
    vi.stubGlobal("Image", ImageFixture);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:deadline-fixture"), revokeObjectURL: vi.fn() });
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => tag === "canvas"
      ? { getContext: () => ({ drawImage: vi.fn() }), toDataURL: () => "data:image/jpeg;base64,Zml4dHVyZQ==" } as unknown as HTMLCanvasElement : create(tag));
    vi.stubGlobal("localStorage", { setItem: vi.fn(), removeItem: vi.fn(), getItem: vi.fn() });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const setup = () => {
    const onScanComplete = vi.fn();
    const showToast = vi.fn();
    return { ...renderHook(() => useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart: vi.fn(), onScanComplete })), onScanComplete, showToast };
  };

  it.each(["image", "request", "response body"])("recovers from a stalled %s and retries the same photo", async phase => {
    decodeImmediately = phase !== "image";
    const fetch = vi.fn().mockImplementationOnce(() => phase === "response body"
      ? Promise.resolve({ ok: true, status: 200, text: () => new Promise(() => {}) })
      : new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const { result, onScanComplete } = setup();
    await act(async () => capture(result.current.handleCapture));
    await act(async () => { await vi.advanceTimersByTimeAsync(34_999); });
    expect(result.current.isScanning).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.isScanning).toBe(false);
    expect(result.current.failure).toEqual({ message: expect.stringContaining("Scanning took too long"), canRetry: true });
    expect(onScanComplete).not.toHaveBeenCalled();
    if (phase !== "image") expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    else { expect(fetch).not.toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:deadline-fixture"); }
    decodeImmediately = true;
    fetch.mockReset().mockResolvedValue(success());
    await act(async () => result.current.retryScan());
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(file);
    expect(fetch).toHaveBeenCalledOnce();
    expect(onScanComplete).toHaveBeenCalledOnce();
    expect(result.current.failure).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one deadline across image loading and the subsequent request", async () => {
    decodeImmediately = false;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { result } = setup();
    await act(async () => capture(result.current.handleCapture));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); completeImage?.(); });
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.isScanning).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.isScanning).toBe(false);
    expect(result.current.failure?.message).toContain("Scanning took too long");
  });

  it("keeps the same account's retry after session refresh without expiring its login", async () => {
    const rejected = vi.fn();
    window.addEventListener("auth-expired", rejected);
    try {
      const fetch = vi.fn().mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(success());
      vi.stubGlobal("fetch", fetch);
      const { result, onScanComplete } = setup();
      await act(async () => capture(result.current.handleCapture));
      vi.mocked(financeAuth.getFinanceAuth).mockReturnValue({ sub: "deadline-user", key: "fresh-session", headers: { "X-Finance-Session": "fresh-session" } });
      await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
      expect(result.current.failure).toEqual({ message: expect.stringContaining("sign-in changed"), canRetry: true });
      await act(async () => result.current.retryScan());
      expect(fetch.mock.calls[1][1].headers).toMatchObject({ "X-Finance-Session": "fresh-session" });
      expect(onScanComplete).toHaveBeenCalledOnce();
      expect(rejected).not.toHaveBeenCalled();
    } finally { window.removeEventListener("auth-expired", rejected); }
  });

  it("ignores a timed-out request finishing while a fresh retry is still active", async () => {
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { finishNew = resolve; })));
    const { result, onScanComplete } = setup();
    await act(async () => capture(result.current.handleCapture));
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    await act(async () => result.current.retryScan());
    await act(async () => finishOld(success()));
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.isScanning).toBe(true);
    expect(result.current.failure).toBeNull();
    await act(async () => finishNew(success()));
    expect(onScanComplete).toHaveBeenCalledOnce();
    expect(result.current.isScanning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans the deadline on manual entry and ignores the cancelled response", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; })));
    const { result, onScanComplete } = setup();
    await act(async () => capture(result.current.handleCapture));
    act(() => result.current.stopScanning());
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); finish(success()); });
    expect(result.current.isScanning).toBe(false);
    expect(result.current.failure).toBeNull();
    expect(onScanComplete).not.toHaveBeenCalled();
    await act(async () => result.current.retryScan());
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("cleans the deadline and object URL when unmounted during image loading", async () => {
    decodeImmediately = false;
    vi.stubGlobal("fetch", vi.fn());
    const { result, unmount, onScanComplete } = setup();
    await act(async () => capture(result.current.handleCapture));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); completeImage?.(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:deadline-fixture");
    expect(onScanComplete).not.toHaveBeenCalled();
  });

  it("clears the deadline after a successful scan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(success()));
    const { result, onScanComplete, showToast } = setup();
    await act(async () => capture(result.current.handleCapture));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(result.current.failure).toBeNull();
    expect(onScanComplete).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledOnce();
  });

  it("does not retain or retry another account's photo after a stalled scan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { result, onScanComplete } = setup();
    await act(async () => capture(result.current.handleCapture));
    vi.mocked(financeAuth.getFinanceAuth).mockReturnValue({ sub: "other-user", key: "other-session", headers: {} });
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(result.current.isScanning).toBe(false);
    expect(result.current.failure?.canRetry).toBe(false);
    await act(async () => result.current.retryScan());
    expect(fetch).toHaveBeenCalledOnce();
    expect(onScanComplete).not.toHaveBeenCalled();
  });
});
