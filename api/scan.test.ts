import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./scan";
import type { VercelApiRequest, VercelApiResponse } from "./notion";

const session = vi.hoisted(() => vi.fn());
vi.mock("../server/financeSession", () => ({
  usesFinanceSession: (req: VercelApiRequest) => req.headers["x-finance-session"] !== undefined,
  readFinanceSession: session,
}));
const image = "data:image/jpeg;base64," + Buffer.from("fixture-image").toString("base64");
const receipt = { merchant: "Sample Cafe", amount: 150.25, category: "Food & Dining", date: "2026-11-06" };
const providerResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const candidate = (value: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
async function call(body: unknown = { image }, headers: VercelApiRequest["headers"] = { "x-finance-session": "fixture" }, method = "POST") {
  let status = 0;
  let result: any;
  const res: VercelApiResponse = {
    status: value => { status = value; return res; }, json: value => { result = value; }, setHeader: vi.fn(), end: vi.fn(),
  };
  await handler({ method, headers, body }, res);
  return { status, body: result, headers: res.setHeader };
}
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ sub: "fixture-user" });
  vi.stubEnv("GEMINI_API_KEY", "private-fixture-key");
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "fixture-audience");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse(candidate(receipt))));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("receipt scanner API", () => {
  it("rejects methods and unauthenticated uploads without calling the provider", async () => {
    expect((await call(undefined, {}, "GET")).status).toBe(405);
    expect(await call(undefined, {})).toMatchObject({ status: 401, body: { code: "AUTH_REQUIRED" } });
    session.mockResolvedValue(null);
    expect(await call()).toMatchObject({ status: 401, body: { code: "AUTH_EXPIRED" } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps session-store outages separate from an expired login", async () => {
    session.mockRejectedValue(new Error("private store details"));
    const response = await call();
    expect(response).toMatchObject({ status: 503, body: { code: "AUTH_UNAVAILABLE" } });
    expect(JSON.stringify(response.body)).not.toContain("private store details");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("checks the legacy Google audience before sending a receipt", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse({ sub: "fixture-user", aud: "wrong-audience" }));
    expect(await call(undefined, { authorization: "Bearer eyJ.fixture.signature" })).toMatchObject({ status: 401, body: { code: "AUTH_EXPIRED" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse({ sub: "fixture-user", aud: "fixture-audience" }));
    expect((await call(undefined, { authorization: "Bearer eyJ.fixture.signature" })).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([429, 500, 503])("does not expire app sign-in when Google verification is unavailable (%s)", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse({ error: "private verification error" }, status));
    expect(await call(undefined, { authorization: "Bearer eyJ.fixture.signature" })).toMatchObject({ status: 503, body: { code: "AUTH_UNAVAILABLE" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("handles a verification network failure without logging the token or treating it as expired", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private-token-in-request-url"));
    const response = await call(undefined, { authorization: "Bearer eyJ.fixture.signature" });
    expect(response).toMatchObject({ status: 503, body: { code: "AUTH_UNAVAILABLE" } });
    expect(JSON.stringify(response.body)).not.toContain("private-token");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [null, 400], ["{invalid", 400], [{ image: "not-an-image" }, 400],
    [{ image: "data:image/jpeg;base64,%%%%" }, 400],
    [{ image: "data:image/jpeg;base64,a" }, 400],
    [{ image: "data:image/svg+xml;base64,YQ==" }, 415],
  ])("rejects malformed uploads before calling the provider", async (body, status) => {
    expect((await call(body)).status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects an oversized upload", async () => {
    const large = "data:image/jpeg;base64," + Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64");
    expect((await call({ image: large })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports an unconfigured scanner without exposing server configuration", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await call();
    expect(result).toMatchObject({ status: 503, body: { code: "SCANNER_UNAVAILABLE" } });
    expect(JSON.stringify(result.body)).not.toContain("GEMINI_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])("does not send a provider %s as an app-login failure", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse({ error: { message: "private provider authorization details" } }, status));
    const result = await call();
    expect(result).toMatchObject({ status: 502, body: { code: "SCANNER_UNAVAILABLE" } });
    expect(JSON.stringify(result.body)).not.toContain("private provider");
  });
  it.each([429, 503])("preserves a retryable capacity response (%s) without raw provider details", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse({ error: { message: "private quota details" } }, status));
    expect(await call()).toMatchObject({ status, body: { code: "AI_CAPACITY" } });
  });
  it("bounds the provider request and returns a retryable timeout", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("private request details", "TimeoutError"));
    expect(await call()).toMatchObject({ status: 504, body: { code: "AI_TIMEOUT" } });
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([200, 500])("handles non-JSON provider responses safely (%s)", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private provider page", { status }));
    const result = await call();
    expect(result).toMatchObject({ status: 502, body: { code: "AI_ERROR" } });
    expect(JSON.stringify(result.body)).not.toContain("private provider");
  });
  it.each([null, [], {}, { ...receipt, amount: "150.25" }, { ...receipt, amount: -1 }, { ...receipt, amount: 0.001 }, { ...receipt, amount: 10000001 }])(
    "rejects untrustworthy scan results before filling an expense draft", async parsed => {
      vi.mocked(fetch).mockResolvedValueOnce(providerResponse(candidate(parsed)));
      expect(await call()).toMatchObject({ status: 502, body: { code: "INVALID_SCAN" } });
    },
  );
  it("returns only normalized draft fields and prompts for transaction amounts rather than balances", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse(candidate({ ...receipt, merchant: " Sample Cafe ", privateField: "do-not-return" })));
    const result = await call();
    expect(result).toMatchObject({ status: 200, body: { success: true, parsed: receipt } });
    expect(Object.keys(result.body)).toEqual(["success", "parsed"]);
    expect(result.headers).toHaveBeenCalledWith("Cache-Control", "no-store");
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(init.headers).toMatchObject({ "x-goog-api-key": "private-fixture-key" });
    const sent = JSON.parse(String(init.body));
    expect(sent.contents[0].parts[0].text).toContain("rather than a wallet balance");
    expect(sent.contents[0].parts[1].inlineData.data).toBe(image.split(",")[1]);
  });
  it("drops invalid dates and unknown categories without silently rolling dates forward", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(providerResponse(candidate({ ...receipt, date: "2026-02-30", category: "Unknown" })));
    expect(await call()).toMatchObject({ status: 200, body: { parsed: { date: "", category: "Other" } } });
  });
});
