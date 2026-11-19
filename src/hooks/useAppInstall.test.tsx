import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { INSTALL_DISMISS_KEY, useAppInstall } from "./useAppInstall";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function offer(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn().mockResolvedValue({ outcome });
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => { window.dispatchEvent(event); });
  return { event, prompt };
}
it("waits for a user action and consumes the native event only once", async () => {
  const { result } = renderHook(useAppInstall);
  const { event, prompt } = offer();
  expect(event.defaultPrevented).toBe(true);
  expect(result.current.canPrompt).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  await act(async () => { await Promise.all([result.current.install(), result.current.install()]); });
  expect(prompt).toHaveBeenCalledOnce();
  expect(result.current.canPrompt).toBe(false);
});
it("does not claim installation complete until appinstalled is observed", async () => {
  const { result } = renderHook(useAppInstall);
  offer();
  await act(async () => { await result.current.install(); });
  expect(result.current.added).toBe(false);
  expect(result.current.status).toContain("Finish adding");
  act(() => { window.dispatchEvent(new Event("appinstalled")); });
  expect(result.current.added).toBe(true);
  expect(result.current.status).toContain("App added");
  expect(result.current.dismissed).toBe(true);
});
it("respects a declined browser prompt and remembers the invitation dismissal", async () => {
  const view = renderHook(useAppInstall);
  offer("dismissed");
  await act(async () => { await view.result.current.install(); });
  expect(view.result.current.added).toBe(false);
  expect(view.result.current.dismissed).toBe(true);
  expect(Number(localStorage.getItem(INSTALL_DISMISS_KEY))).toBeGreaterThan(Date.now());
  view.unmount();
  expect(renderHook(useAppInstall).result.current.dismissed).toBe(true);
});
it("leaves manual guidance available when the browser prompt fails", async () => {
  const { result } = renderHook(useAppInstall);
  const { prompt } = offer();
  prompt.mockRejectedValueOnce(new Error("not allowed"));
  await act(async () => { await result.current.install(); });
  expect(result.current.busy).toBe(false);
  expect(result.current.added).toBe(false);
  expect(result.current.status).toContain("Use the steps below");
});
it("does not invite a standalone app to install again", () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  const { result } = renderHook(useAppInstall);
  const { event, prompt } = offer();
  expect(result.current.added).toBe(true);
  expect(result.current.canPrompt).toBe(false);
  expect(event.defaultPrevented).toBe(false);
  expect(prompt).not.toHaveBeenCalled();
});
it("tolerates device preference storage being unavailable", () => {
  vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error("denied"); });
  vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("denied"); });
  const { result } = renderHook(useAppInstall);
  expect(result.current.dismissed).toBe(false);
  act(() => result.current.dismissOffer());
  expect(result.current.dismissed).toBe(true);
});
it("allows a new invitation after the stored snooze expires", () => {
  localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() - 1000));
  expect(renderHook(useAppInstall).result.current.dismissed).toBe(false);
});
it("removes event listeners on unmount", () => {
  const view = renderHook(useAppInstall);
  view.unmount();
  const { event } = offer();
  expect(event.defaultPrevented).toBe(false);
});
