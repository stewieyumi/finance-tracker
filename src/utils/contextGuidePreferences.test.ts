import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { guidePreferenceKey, readGuidePreferences, saveGuidePreferences } from "./contextGuidePreferences";
describe("context guide preferences", () => {
  let values: Map<string, string>;
  beforeEach(() => { values = new Map(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }); });
  afterEach(() => vi.unstubAllGlobals());
  it("defaults to automatic guides and isolates progress by account", () => {
    expect(readGuidePreferences("a")).toEqual({ automatic: true, completed: [] });
    saveGuidePreferences("a", { automatic: false, completed: ["wallets"] });
    expect(readGuidePreferences("a")).toEqual({ automatic: false, completed: ["wallets"] });
    expect(readGuidePreferences("b")).toEqual({ automatic: true, completed: [] });
    expect([...values.keys()]).toEqual([guidePreferenceKey("a")]);
  });
  it("ignores malformed or non-string guide IDs", () => {
    values.set(guidePreferenceKey("a"), "bad JSON");
    expect(readGuidePreferences("a").automatic).toBe(true);
    values.set(guidePreferenceKey("a"), JSON.stringify({ automatic: false, completed: ["wallets", 4, null] }));
    expect(readGuidePreferences("a")).toEqual({ automatic: false, completed: ["wallets"] });
  });
  it("keeps optional guide storage failures from blocking the app", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } });
    expect(() => saveGuidePreferences("a", { automatic: false, completed: [] })).not.toThrow();
    expect(readGuidePreferences("a").completed).toEqual([]);
  });
});
