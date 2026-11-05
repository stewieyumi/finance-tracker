import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./apple-calendar";

const mock = vi.hoisted(() => ({
  session: vi.fn(), verify: vi.fn(), connect: vi.fn(), calendars: vi.fn(), read: vi.fn(), push: vi.fn(), setup: vi.fn(),
  set: vi.fn(), release: vi.fn(),
}));
vi.mock("../server/financeSession", () => ({
  usesFinanceSession: (req: any) => req.headers["x-finance-session"] !== undefined,
  readFinanceSession: mock.session,
}));
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = mock.verify; } }));
vi.mock("@upstash/redis", () => ({ Redis: class { set = mock.set; eval = mock.release; } }));
vi.mock("../server/appleCalendar", () => ({
  AppleCalendarError: class extends Error { constructor(message: string, public status = 502) { super(message); } },
  connectAppleCalendar: mock.connect, getAppleCalendars: mock.calendars, readAppleEvents: mock.read,
  pushAppleEvent: mock.push, setupAppleCalendars: mock.setup,
}));
const gig = { id: "sample", title: "Sample", date: "2026-11-05", status: "Pencil", completed: false };
const event = { gig, uid: "sample", etag: '"v1"', group: "pending" };
async function call(body: any = { action: "preview" }, headers: any = { "x-finance-session": "sample" }) {
  const req: any = { method: "POST", headers, body };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  await handler(req, res);
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "owner@example.test");
  vi.stubEnv("ICLOUD_APPLE_ID", "fixture");
  vi.stubEnv("ICLOUD_APP_PASSWORD", "fixture-secret");
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "fixture-audience");
  vi.stubEnv("KV_REST_API_URL", "https://fixture.example.test");
  vi.stubEnv("KV_REST_API_TOKEN", "fixture");
  mock.session.mockResolvedValue({ sub: "owner", email: "owner@example.test" });
  mock.calendars.mockResolvedValue({ pending: {}, done: {}, moved: {}, cancelled: {} });
  mock.read.mockResolvedValue({ events: [{ ...event, object: { data: "PRIVATE ICS CONTENT" } }], skipped: 0 });
  mock.set.mockResolvedValue("OK");
  mock.release.mockResolvedValue(1);
});
afterEach(() => vi.unstubAllEnvs());

describe("Apple Calendar API", () => {
  it("requires the configured owner before opening iCloud", async () => {
    mock.session.mockResolvedValue({ sub: "another", email: "another@example.test" });
    expect((await call()).status).toHaveBeenCalledWith(403);
    expect(mock.connect).not.toHaveBeenCalled();
    mock.session.mockResolvedValue(null);
    expect((await call()).status).toHaveBeenCalledWith(401);
  });
  it("verifies the Google token audience and verified email for legacy sessions", async () => {
    mock.verify.mockResolvedValue({ getPayload: () => ({ sub: "owner", email: "owner@example.test", email_verified: true }) });
    const result = await call(undefined, { authorization: "Bearer fixture" });
    expect(result.status).toHaveBeenCalledWith(200);
    expect(mock.verify).toHaveBeenCalledWith({ idToken: "fixture", audience: "fixture-audience" });
    mock.verify.mockResolvedValue({ getPayload: () => ({ sub: "owner", email: "owner@example.test", email_verified: false }) });
    expect((await call(undefined, { authorization: "Bearer fixture" })).status).toHaveBeenCalledWith(401);
  });
  it("reports missing connection setup without returning any credential", async () => {
    vi.stubEnv("ICLOUD_APP_PASSWORD", "");
    const result = await call();
    expect(result.status).toHaveBeenCalledWith(503);
    expect(result.json).toHaveBeenCalledWith(expect.objectContaining({ setupRequired: true }));
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it("returns a review without raw event content or any writes", async () => {
    const result = await call();
    expect(result.status).toHaveBeenCalledWith(200);
    expect(result.json).toHaveBeenCalledWith({ events: [event], skipped: 0, missingCalendars: [] });
    expect(mock.push).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });
  it("rejects stale calendar imports before returning a gig", async () => {
    const result = await call({ action: "pull", expected: { ...event, etag: '"older"' } });
    expect(result.status).toHaveBeenCalledWith(409);
  });
  it("returns authoritative calendar fields rather than trusting fields sent from the browser", async () => {
    const result = await call({ action: "pull", expected: { ...event, gig: { ...gig, title: "Forged" } } });
    expect(result.json).toHaveBeenCalledWith({ gig });
  });
  it("refuses concurrent writes and releases an acquired lock after a failed operation", async () => {
    mock.set.mockResolvedValueOnce(null);
    expect((await call({ action: "push", gig, expected: event })).status).toHaveBeenCalledWith(409);
    expect(mock.push).not.toHaveBeenCalled();
    mock.push.mockRejectedValueOnce(new Error("failure"));
    expect((await call({ action: "push", gig, expected: event })).status).toHaveBeenCalledWith(503);
    expect(mock.release).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("ARGV[1]"), ["ft_apple_calendar_lock:owner@example.test"], [expect.any(String)],
    );
  });
  it("rejects malformed imports and cross-site calls without connecting", async () => {
    expect((await call({ action: "push", gig: { ...gig, date: "2026-02-30" }, expected: null })).status).toHaveBeenCalledWith(400);
    expect((await call(undefined, { "sec-fetch-site": "cross-site" })).status).toHaveBeenCalledWith(403);
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
