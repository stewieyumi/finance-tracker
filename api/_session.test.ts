import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sessionHandler from "./session";
import syncHandler from "./sync";
import type { VercelApiRequest, VercelApiResponse } from "./notion";

const { records, get, set, del, verify } = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  return {
    records,
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown, _options: unknown) => records.set(key, value)),
    del: vi.fn(async (key: string) => records.delete(key)),
    verify: vi.fn(),
  };
});

vi.mock("@upstash/redis", () => ({ Redis: class { get = get; set = set; del = del; } }));
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = verify; } }));

const authHeaders = { "x-finance-auth": "1", "sec-fetch-site": "same-origin" };

async function call(handler: typeof sessionHandler, req: VercelApiRequest) {
  const headers: Record<string, string> = {};
  let status = 0;
  let body: any;
  const res: VercelApiResponse = {
    setHeader: (name, value) => { headers[name] = value; },
    status: value => { status = value; return res; },
    json: value => { body = value; },
    end: () => {},
  };
  await handler(req, res);
  return { status, headers, body };
}

async function login(sub: string) {
  verify.mockResolvedValueOnce({ getPayload: () => ({ sub, email: `${sub}@example.test`, email_verified: true }) });
  const response = await call(sessionHandler, { method: "POST", headers: authHeaders, body: { credential: "fixture" } });
  expect(response.status).toBe(200);
  return { ...response, cookie: response.headers["Set-Cookie"].split(";")[0] };
}

describe("persistent Finance Tracker sessions", () => {
  beforeEach(() => {
    records.clear();
    vi.clearAllMocks();
    vi.stubEnv("KV_REST_API_URL", "https://fixture.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "fixture");
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-fixture");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("sets a host-only HttpOnly cookie and lets sync read the same account without a Google credential", async () => {
    const session = await login("account-a");
    expect(verify).toHaveBeenCalledWith({ idToken: "fixture", audience: "google-client-fixture" });
    expect(session.headers["Set-Cookie"]).toMatch(/^__Host-ft_session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800$/);
    expect(set).toHaveBeenCalledWith(expect.stringMatching(/^finance_session_v1:[a-f0-9]{64}$/), expect.any(Object), { ex: 604800 });
    expect(JSON.stringify(session.body)).not.toContain(session.cookie.split("=")[1]);
    const result = await call(syncHandler, {
      method: "GET", headers: { cookie: session.cookie, "x-finance-session": session.body.binding },
    });
    expect(result.status).toBe(200);
    expect(get).toHaveBeenCalledWith("finance_data_g_account-a");
  });

  it("rejects a mismatched tab or a cookie-only request before accessing financial data", async () => {
    const a = await login("account-a");
    const b = await login("account-b");
    get.mockClear();
    const mismatched = await call(syncHandler, {
      method: "GET", headers: { cookie: b.cookie, "x-finance-session": a.body.binding },
    });
    const cookieOnly = await call(syncHandler, { method: "GET", headers: { cookie: b.cookie } });
    expect(mismatched.status).toBe(401);
    expect(cookieOnly.status).toBe(401);
    expect(get.mock.calls.flat().some(key => key.startsWith("finance_data_g_"))).toBe(false);
  });

  it("rejects cross-site exchanges and keeps the current session when reconnect uses a different Google account", async () => {
    const crossSite = await call(sessionHandler, {
      method: "POST", headers: { ...authHeaders, "sec-fetch-site": "cross-site" }, body: { credential: "fixture" },
    });
    expect(crossSite.status).toBe(403);
    expect(verify).not.toHaveBeenCalled();
    verify.mockResolvedValueOnce({ getPayload: () => ({ sub: "account-b" }) });
    const wrongAccount = await call(sessionHandler, {
      method: "POST", headers: authHeaders, body: { credential: "fixture", expectedSub: "account-a" },
    });
    expect(wrongAccount.status).toBe(409);
    expect(wrongAccount.headers["Set-Cookie"]).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  });

  it("revokes the server session on logout and rejects replay of the old cookie", async () => {
    const session = await login("account-a");
    const headers = { ...authHeaders, cookie: session.cookie, "x-finance-session": session.body.binding };
    const logout = await call(sessionHandler, { method: "POST", headers, body: { action: "logout" } });
    expect(logout.status).toBe(204);
    expect(logout.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(del).toHaveBeenCalledTimes(1);
    expect((await call(syncHandler, { method: "GET", headers })).status).toBe(401);
  });
});
