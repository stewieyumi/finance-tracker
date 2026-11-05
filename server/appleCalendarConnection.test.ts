import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import { deleteAppleConnection, parseAppleCredentials, readAppleConnection, saveAppleConnection } from "./appleCalendarConnection";
const records = new Map<string, any>();
const store = {
  set: vi.fn(async (key: string, value: unknown) => { records.set(key, value); }),
  get: vi.fn(async (key: string) => records.get(key) ?? null),
  del: vi.fn(async (key: string) => records.delete(key)),
} as unknown as Redis;
const credentials = { username: "person@example.test", password: "abcd-efgh-ijkl-mnop" };
beforeEach(() => { records.clear(); vi.stubEnv("CALENDAR_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")); });
afterEach(() => vi.unstubAllEnvs());
describe("encrypted per-user iCloud connections", () => {
  it("roundtrips credentials without storing plaintext and uses a fresh nonce and ID each time", async () => {
    const first = await saveAppleConnection(store, "user-a", credentials);
    const encodedFirst = JSON.stringify([...records.values()]);
    expect(encodedFirst).not.toContain(credentials.username); expect(encodedFirst).not.toContain(credentials.password);
    expect(await readAppleConnection(store, "user-a")).toEqual(first);
    const second = await saveAppleConnection(store, "user-a", credentials);
    expect(second.id).not.toBe(first.id); expect(JSON.stringify([...records.values()])).not.toBe(encodedFirst);
    expect(await readAppleConnection(store, "user-b")).toBeNull();
  });
  it("rejects ciphertext copied to another user and detects tampering", async () => {
    await saveAppleConnection(store, "user-a", credentials);
    const [key, encrypted] = [...records.entries()][0];
    await saveAppleConnection(store, "user-b", credentials);
    const otherKey = [...records.keys()].find(value => value !== key)!;
    records.set(otherKey, encrypted);
    await expect(readAppleConnection(store, "user-b")).rejects.toMatchObject({ status: 409 });
    records.set(key, { ...encrypted, ciphertext: "AAAA" + encrypted.ciphertext });
    await expect(readAppleConnection(store, "user-a")).rejects.toMatchObject({ status: 409 });
  });
  it("deletes just the selected user's record", async () => {
    await saveAppleConnection(store, "user-a", credentials); await saveAppleConnection(store, "user-b", credentials);
    await deleteAppleConnection(store, "user-a");
    expect(await readAppleConnection(store, "user-a")).toBeNull();
    expect(await readAppleConnection(store, "user-b")).toMatchObject(credentials);
  });
  it("requires a valid dedicated encryption key", async () => {
    for (const value of ["", "not-a-key", Buffer.alloc(16).toString("base64")]) {
      vi.stubEnv("CALENDAR_ENCRYPTION_KEY", value);
      await expect(saveAppleConnection(store, "user-a", credentials)).rejects.toMatchObject({ status: 503 });
    }
  });
  it("normalizes pasted credentials and rejects ordinary malformed input", () => {
    expect(parseAppleCredentials({ username: " Person@Example.Test ", password: " abcdefghijklmnop " })).toEqual(credentials);
    for (const value of [null, {}, { ...credentials, username: "no-email" }, { ...credentials, password: "regular-password" }]) {
      expect(parseAppleCredentials(value)).toBeNull();
    }
  });
});
