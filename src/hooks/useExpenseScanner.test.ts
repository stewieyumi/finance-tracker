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

    expect(showToast).toHaveBeenCalledWith("⚠️ Please sign in to use the AI Scanner.");
    expect(onScanStart).not.toHaveBeenCalled();
    expect(onScanComplete).not.toHaveBeenCalled();
  });

  it("calls onScanStart and onScanComplete with parsed fields on a successful scan", async () => {
    vi.spyOn(useCloudSync, "getLocalPasscode").mockReturnValue("test-token");

    const showToast = vi.fn();
    const onScanStart = vi.fn();
    const onScanComplete = vi.fn();

    // Mock Image so setting src synchronously fires onload,
    // making the async chain deterministic without relying on environment internals.
    class MockImage {
      width = 200;
      height = 100;
      onload: (() => void) | null = null;
      private _src = "";
      get src() { return this._src; }
      set src(val: string) {
        this._src = val;
        // Fire synchronously — the hook assigns onload before setting src
        if (this.onload) this.onload();
      }
    }
    vi.stubGlobal("Image", MockImage);

    // Mock URL.createObjectURL (used by the hook to create a blob URL for the image)
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
    });

    // Mock canvas so drawImage/toDataURL work without a real rendering surface
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

    // Stub localStorage — not available natively in this test environment
    const localStorageMock = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal("localStorage", localStorageMock);

    // Mock fetch to return a clean parsed receipt response
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

    // handleCapture fires onScanStart synchronously, then synchronously fires
    // img.onload (via MockImage), which kicks off the async fetch chain.
    // We await inside act to let all promises settle.
    await act(async () => {
      result.current.handleCapture(event);
      // Yield through the fetch promise chain: fetch → text() → JSON.parse → onScanComplete
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

    expect(showToast).toHaveBeenCalledWith("✨ Receipt scanned successfully!");
  });
});
