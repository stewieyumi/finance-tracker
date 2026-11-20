import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { clearAccountLocalData, localAccountEpochKey, prepareAccountEpoch } from "./accountData";
import { deleteAppAccount, getFinanceAuth, readAppSession } from "./financeAuth";
let values: Map<string, string>;
beforeEach(() => { values = new Map(); vi.stubGlobal("localStorage", {
  get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
}); });
afterEach(() => vi.unstubAllGlobals());
describe("deleted-account local isolation", () => {
  it("clears only the deleted owner's records, pending writers, backups, and matching profile metadata", () => {
    for (const key of ["ft_master_data_v1_a", "ft_sync_pending_writer:a:writer", "ft_import_preimage_a", "ft_sync_conflict_backups_a", "ft_context_guides_v1_a", "ft_master_data_v1_b", "ft_sync_pending_writer:b:writer", "unrelated"]) values.set(key, "saved");
    values.set("ft_last_profile", JSON.stringify({ sub: "b" }));
    clearAccountLocalData("a");
    expect([...values.keys()].sort()).toEqual(["ft_last_profile", "ft_master_data_v1_b", "ft_sync_pending_writer:b:writer", "unrelated"]);
  });
  it("clears stale records once per server deletion epoch while preserving new records on subsequent sign-in", () => {
    values.set("ft_master_data_v1_a", "stale");
    const epoch = "v1_" + "a".repeat(32); prepareAccountEpoch("a", epoch);
    expect(values.get("ft_master_data_v1_a")).toBeUndefined();
    expect(values.get(localAccountEpochKey("a"))).toBe(epoch);
    values.set("ft_master_data_v1_a", "new profile"); prepareAccountEpoch("a", epoch);
    expect(values.get("ft_master_data_v1_a")).toBe("new profile");
  });
  it("does not send a deletion for a changed account and validates the acknowledged owner", async () => {
    const a = { profile: { sub: "a" }, binding: "a".repeat(32) };
    values.set("ft_app_session", JSON.stringify({ profile: { sub: "b" }, binding: "b".repeat(32) }));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(deleteAppAccount(a)).rejects.toThrow(/account changed/i); expect(fetch).not.toHaveBeenCalled();
    values.set("ft_app_session", JSON.stringify(a));
    fetch.mockResolvedValue({ ok: true, json: async () => ({ deleted: true, sub: "b" }) });
    await expect(deleteAppAccount(a)).rejects.toThrow(/could not be confirmed/i);
    expect(values.has("ft_app_session")).toBe(true);
  });
  it("clears legacy cached data on boot before an epoch-aware session can authenticate", () => {
    const epoch = "v1_" + "b".repeat(32);
    values.set("ft_master_data_v1_a", "old cached finances");
    values.set("ft_app_session", JSON.stringify({ profile: { sub: "a" }, binding: "a".repeat(32), accountEpoch: epoch }));
    expect(readAppSession()?.accountEpoch).toBe(epoch);
    expect(values.get("ft_master_data_v1_a")).toBeUndefined();
    expect(getFinanceAuth().headers["X-Finance-Account"]).toBe(epoch);
  });

});
