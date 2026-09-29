import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpenseScanner } from "./useExpenseScanner";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import * as useCloudSync from "./useCloudSync";

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

  it("shows auth toast and does not proceed when no passcode exists", () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue(null as unknown as string);

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    const { result } = renderHook(() =>
      useExpenseScanner({ showToast, globalData: baseGlobalData, onScanStart, onScanComplete })
    );

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const event = {
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleCapture(event);
    });

    expect(showToast).toHaveBeenCalledWith("⚠️ Sign-in required: Please sign in with Google to use the AI Scanner.");
    expect(onScanStart).not.toHaveBeenCalled();
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(result.current.isScanning).toBe(false);
  });

  it("calls onScanStart and onScanComplete with parsed fields on a successful scan", async () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

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
      target: { files: [file] },
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
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

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
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanStart).toHaveBeenCalledTimes(1);
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Unable to read scanner response. Please enter details manually.");
    expect(result.current.isScanning).toBe(false);
  });

  it("handles missing Gemini API key on the server (500)", async () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

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
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanComplete).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "⚠️ AI Scanner is not configured on the server (missing Gemini API key). Please enter details manually."
    );
    expect(result.current.isScanning).toBe(false);
  });

  it("rejects invalid or non-positive amount and does not call onScanComplete", async () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

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
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanComplete).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "⚠️ Could not detect a valid expense amount. Please enter details manually."
    );
    expect(result.current.isScanning).toBe(false);
  });

  it("rejects completely incomplete scan results", async () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

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
      target: { files: [file] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      result.current.handleCapture(event);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(onScanComplete).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "⚠️ Could not detect receipt details. Please enter details manually."
    );
    expect(result.current.isScanning).toBe(false);
  });

  it("prevents duplicate concurrent scans when isScanning is already active", async () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

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
      target: { files: [file] },
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
});
