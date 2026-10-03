import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { applyTheme, useTheme } from "./useTheme";

describe("useTheme & applyTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("light", "dark");
  });

  it("applyTheme('dark') adds dark class and removes light", () => {
    document.documentElement.classList.add("light");
    const cleanup = applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    cleanup();
  });

  it("applyTheme('light') adds light class and removes dark", () => {
    document.documentElement.classList.add("dark");
    const cleanup = applyTheme("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    cleanup();
  });

  it("applyTheme('system') respects matchMedia and removes listener on cleanup", () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
    const addListenerMock = vi.fn().mockImplementation((event, handler) => {
      if (event === "change") changeHandler = handler;
    });
    const removeListenerMock = vi.fn().mockImplementation((event, handler) => {
      if (event === "change" && changeHandler === handler) changeHandler = null;
    });

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, // dark
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addListenerMock,
      removeEventListener: removeListenerMock,
      dispatchEvent: vi.fn(),
    }));

    try {
      const cleanup = applyTheme("system");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(addListenerMock).toHaveBeenCalledWith("change", expect.any(Function));

      // Simulate media change to light
      if (changeHandler) {
        (changeHandler as (e: Partial<MediaQueryListEvent>) => void)({ matches: false });
        expect(document.documentElement.classList.contains("light")).toBe(true);
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      }

      cleanup();
      expect(removeListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("useTheme hook applies theme on render and updates on settings change", () => {
    const { rerender, unmount } = renderHook(
      ({ theme }: { theme: "dark" | "light" | "system" }) => useTheme({ theme }),
      { initialProps: { theme: "dark" as "dark" | "light" | "system" } }
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    rerender({ theme: "light" });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    unmount();
  });
});
