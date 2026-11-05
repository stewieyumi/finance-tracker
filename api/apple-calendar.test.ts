import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";
import handler from "./apple-calendar";
import { calendarUserKey, readAppleConnection, saveAppleConnection } from "../server/appleCalendarConnection";

const mock = vi.hoisted(() => ({
  session: vi.fn(), verify: vi.fn(), connect: vi.fn(), calendars: vi.fn(), read: vi.fn(), push: vi.fn(), setup: vi.fn(),
  set: vi.fn(), get: vi.fn(), del: vi.fn(), release: vi.fn(), incr: vi.fn(), expire: vi.fn(), records: new Map<string, any>(),
}));
vi.mock("../server/financeSession", () => ({
  usesFinanceSession: (req: any) => req.headers["x-finance-session"] !== undefined,
  readFinanceSession: mock.session,
}));
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = mock.verify; } }));
vi.mock("@upstash/redis", () => ({ Redis: class {
  set = mock.set; get = mock.get; del = mock.del; eval = mock.release; incr = mock.incr; expire = mock.expire;
} }));
vi.mock("../server/appleCalendar", () => ({
  AppleCalendarError: class extends Error { constructor(message: string, public status = 502) { super(message); } },
  connectAppleCalendar: mock.connect, getAppleCalendars: mock.calendars, readAppleEvents: mock.read,
  pushAppleEvent: mock.push, setupAppleCalendars: mock.setup,
}));
const credentials = { username: "calendar@example.test", password: "abcd-efgh-ijkl-mnop" };
const gig = { id: "sample", title: "Sample", date: "2026-11-05", status: "Pencil", completed: false };
const event = { gig, uid: "sample", etag: '"v1"', group: "pending" };
let connectionId: string;
async function call(body: any = { action: "preview", connectionId }, headers: any = { "x-finance-session": "sample" }) {
  const req: any = { method: "POST", headers, body };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  await handler(req, res);
  return res;
}
function json(res: any) { return res.json.mock.calls[0][0]; }
beforeEach(async () => {
  vi.resetAllMocks(); mock.records.clear();
  vi.stubEnv("CALENDAR_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "fixture-audience");
  vi.stubEnv("KV_REST_API_URL", "https://fixture.example.test");
  vi.stubEnv("KV_REST_API_TOKEN", "fixture");
  // The old global connection must never be used, including for the former owner.
  vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "old-owner@example.test");
  vi.stubEnv("ICLOUD_APPLE_ID", "legacy@example.test");
  vi.stubEnv("ICLOUD_APP_PASSWORD", "legacy-secret");
  mock.get.mockImplementation(async key => mock.records.get(key) ?? null);
  mock.set.mockImplementation(async (key, value, options) => {
    if (options?.nx && mock.records.has(key)) return null;
    mock.records.set(key, value); return "OK";
  });
  mock.del.mockImplementation(async key => Number(mock.records.delete(key)));
  mock.release.mockImplementation(async (_script, [key], [token]) => mock.records.get(key) === token ? Number(mock.records.delete(key)) : 0);
  mock.incr.mockResolvedValue(1); mock.expire.mockResolvedValue(1);
  mock.session.mockResolvedValue({ sub: "user-a", email: "user-a@example.test" });
  mock.calendars.mockResolvedValue({ pending: {}, done: {}, moved: {}, cancelled: {} });
  mock.read.mockResolvedValue({ events: [{ ...event, object: { data: "PRIVATE ICS CONTENT" } }], skipped: 0 });
  connectionId = (await saveAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-a", credentials)).id;
  mock.set.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("per-user Apple Calendar API", () => {
  it("authenticates before accessing any connection", async () => {
    mock.session.mockResolvedValue(null);
    expect((await call()).status).toHaveBeenCalledWith(401);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("verifies the Google audience and email for legacy sessions", async () => {
    mock.verify.mockResolvedValue({ getPayload: () => ({ sub: "user-a", email_verified: true }) });
    expect((await call(undefined, { authorization: "Bearer fixture" })).status).toHaveBeenCalledWith(200);
    expect(mock.verify).toHaveBeenCalledWith({ idToken: "fixture", audience: "fixture-audience" });
    mock.verify.mockResolvedValue({ getPayload: () => ({ sub: "user-a", email_verified: false }) });
    expect((await call(undefined, { authorization: "Bearer fixture" })).status).toHaveBeenCalledWith(401);
  });
  it("shows only the authenticated user's connection and ignores requested user IDs", async () => {
    expect(json(await call({ action: "status", sub: "other" }))).toEqual({ connection: { id: connectionId, email: credentials.username } });
    mock.session.mockResolvedValue({ sub: "user-b", email: "user-a@example.test" });
    expect(json(await call({ action: "status", sub: "user-a" }))).toEqual({ connection: null });
    expect((await call()).status).toHaveBeenCalledWith(409);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("returns a sanitized review using only that user's decrypted credentials", async () => {
    const result = await call();
    expect(result.status).toHaveBeenCalledWith(200);
    expect(result.json).toHaveBeenCalledWith({ connectionId, events: [event], skipped: 0, missingCalendars: [] });
    expect(mock.connect).toHaveBeenCalledWith(expect.any(AbortSignal), credentials);
    expect(mock.push).not.toHaveBeenCalled();
  });
  it("validates new credentials before saving them without writing any calendar events", async () => {
    mock.session.mockResolvedValue({ sub: "user-b" });
    const result = await call({ action: "connect", connectionId: null, ...credentials, sub: "user-a" });
    expect(result.status).toHaveBeenCalledWith(200);
    expect(json(result).connection).toEqual({ email: credentials.username, id: expect.any(String) });
    expect(await readAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-b")).toMatchObject(credentials);
    expect((await readAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-a"))!.id).toBe(connectionId);
    expect(mock.push).not.toHaveBeenCalled(); expect(mock.setup).not.toHaveBeenCalled();
    expect(JSON.stringify([...mock.records.values()])).not.toContain(credentials.password);
    expect(JSON.stringify(result.json.mock.calls)).not.toContain(credentials.password);
  });
  it("keeps the existing connection when Apple rejects replacement credentials and masks provider errors", async () => {
    mock.connect.mockRejectedValueOnce(new Error("Authorization: Basic secret-provider-details"));
    const result = await call({ action: "connect", connectionId, ...credentials });
    expect(result.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(json(result))).not.toContain("secret-provider-details");
    expect((await readAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-a"))!.id).toBe(connectionId);
  });
  it("disconnects only that user's saved credentials and never deletes events", async () => {
    const other = await saveAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-b", credentials);
    expect((await call({ action: "disconnect", connectionId, sub: "user-b" })).status).toHaveBeenCalledWith(200);
    expect(await readAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-a")).toBeNull();
    expect((await readAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-b"))!.id).toBe(other.id);
    expect(mock.connect).not.toHaveBeenCalled(); expect(mock.push).not.toHaveBeenCalled();
  });
  it("rejects reviews from a previous connection even when event IDs and ETags match", async () => {
    const replaced = await call({ action: "connect", connectionId, ...credentials });
    expect(json(replaced).connection.id).not.toBe(connectionId);
    mock.connect.mockClear();
    expect((await call({ action: "push", connectionId, gig, expected: event })).status).toHaveBeenCalledWith(409);
    expect(mock.connect).not.toHaveBeenCalled(); expect(mock.push).not.toHaveBeenCalled();
  });
  it("blocks sync and disconnect while another action holds the user's lock", async () => {
    mock.records.set(`ft_apple_calendar_lock:${calendarUserKey("user-a")}`, "another-action");
    expect((await call({ action: "disconnect", connectionId })).status).toHaveBeenCalledWith(409);
    expect((await call()).status).toHaveBeenCalledWith(409);
    expect(mock.del).not.toHaveBeenCalled(); expect(mock.connect).not.toHaveBeenCalled();
  });
  it("releases the lock after a failed write", async () => {
    mock.push.mockRejectedValueOnce(new Error("failure"));
    expect((await call({ action: "push", connectionId, gig, expected: event })).status).toHaveBeenCalledWith(503);
    expect(mock.release).toHaveBeenCalledWith(expect.stringContaining("ARGV[1]"), [`ft_apple_calendar_lock:${calendarUserKey("user-a")}`], [expect.any(String)]);
  });
  it("rejects stale calendar imports and returns only authoritative fields", async () => {
    expect((await call({ action: "pull", connectionId, expected: { ...event, etag: '"older"' } })).status).toHaveBeenCalledWith(409);
    expect(json(await call({ action: "pull", connectionId, expected: { ...event, gig: { ...gig, title: "Forged" } } }))).toEqual({ gig });
  });
  it("limits connection attempts before sending another password to Apple", async () => {
    mock.incr.mockResolvedValueOnce(11);
    expect((await call({ action: "connect", connectionId, ...credentials })).status).toHaveBeenCalledWith(429);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("rejects malformed inputs and cross-site calls without connecting", async () => {
    expect((await call({ action: "push", connectionId, gig: { ...gig, date: "2026-02-30" }, expected: null })).status).toHaveBeenCalledWith(400);
    expect((await call({ action: "connect", connectionId, ...credentials, password: "my-regular-password" })).status).toHaveBeenCalledWith(400);
    expect((await call({ action: "disconnect" })).status).toHaveBeenCalledWith(400);
    expect((await call(undefined, { "sec-fetch-site": "cross-site" })).status).toHaveBeenCalledWith(403);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("fails closed when server encryption is not configured, without falling back to owner credentials", async () => {
    vi.stubEnv("CALENDAR_ENCRYPTION_KEY", "");
    expect((await call({ action: "status" })).status).toHaveBeenCalledWith(503);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("lets a user recover an unreadable encrypted connection through guided reconnect", async () => {
    vi.stubEnv("CALENDAR_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(json(await call({ action: "status" }))).toEqual({ connection: null, reconnectRequired: true });
    expect((await call({ action: "connect", connectionId: null, ...credentials })).status).toHaveBeenCalledWith(200);
    expect(await readAppleConnection(new Redis({ url: "https://fixture.example.test", token: "fixture" }), "user-a")).toMatchObject(credentials);
  });
});
