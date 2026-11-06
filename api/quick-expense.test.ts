import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import syncHandler from "./sync";
import handler, { CONNECTION_TTL } from "./quick-expense";
import type { VercelApiRequest, VercelApiResponse } from "./notion";

const { records, get, evalMock, readSession } = vi.hoisted(() => {
  const records = new Map<string, string>();
  return { records, get: vi.fn(async (key: string) => records.get(key) ?? null), evalMock: vi.fn(), readSession: vi.fn() };
});
vi.mock("@upstash/redis", () => ({ Redis: class { get = get; eval = evalMock; } }));
vi.mock("../server/financeSession.js", () => ({ readFinanceSession: readSession, usesFinanceSession: (req: VercelApiRequest) => req.headers["x-finance-session"] !== undefined }));
const headers = { "x-finance-shortcut": "1", "x-finance-session": "binding", "sec-fetch-site": "same-origin", cookie: "account-a" };
const base = () => ({ wallets: { maya: 1000, cash: 500 }, library: { bills: [], receivables: [], shoots: [], expenses: [] }, logs: {}, settings: { customWallets: [{ id: "maya", label: "Maya" }], defaultWallet: "maya" }, updatedAt: 100 });
const payload = { action: "expense", requestId: "11111111-1111-4111-8111-111111111111", merchant: "Sample cafe", amount: "100.25", category: "Food & Dining", date: "2026-11-06" };
async function call(req: VercelApiRequest, target = handler) {
  let status = 0; let body: any; const responseHeaders: Record<string, string> = {};
  const res: VercelApiResponse = { status: n => { status = n; return res; }, json: b => { body = b; }, setHeader: (k, v) => { responseHeaders[k] = v; }, end: () => {} };
  await target(req, res); return { status, body, headers: responseHeaders };
}
const manage = (action?: string, other = {}, customHeaders = headers) => call({ method: action ? "POST" : "GET", headers: customHeaders, body: action ? { action, ...other } : undefined });
async function connect() { const r = await manage("connect", { walletId: "maya" }); expect(r.status).toBe(200); return r.body.token as string; }
const save = (token: string, body: object = payload) => call({ method: "POST", headers: { authorization: `Bearer ${token}` }, body });
const cloud = () => JSON.parse(records.get("finance_data_g_account-a")!);

beforeEach(() => {
  vi.clearAllMocks(); records.clear();
  vi.stubEnv("KV_REST_API_URL", "https://fixture.invalid"); vi.stubEnv("KV_REST_API_TOKEN", "fixture-only");
  records.set("finance_data_g_account-a", JSON.stringify({ data: base(), revision: 4 }));
  readSession.mockImplementation(async (req: VercelApiRequest) => req.headers.cookie === "account-a" ? { sub: "account-a" } : req.headers.cookie === "account-b" ? { sub: "account-b" } : null);
  // Redis double implements string CAS and TTL arguments; financial mutation runs only in the real handler.
  evalMock.mockImplementation(async (_script: string, keys: string[], args: (string | number)[]) => {
    if (keys.length === 2) {
      const previous = records.get(keys[0]); if (previous) records.delete(String(args[0]) + previous);
      records.set(keys[0], String(args[1])); records.set(keys[1], String(args[2])); return 1;
    }
    if (keys.length === 1) {
      const previous = records.get(keys[0]); if (previous) records.delete(String(args[0]) + previous); records.delete(keys[0]); return 1;
    }
    if (records.get(keys[1]) !== args[0] || records.get(keys[2]) !== args[1]) return "revoked";
    if (records.has(keys[3])) return records.get(keys[3]);
    if (records.get(keys[0]) !== args[2]) return "conflict";
    records.set(keys[0], String(args[3])); records.set(keys[3], String(args[4])); return args[4];
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("expense-only Apple Shortcut connection", () => {
  it("requires a same-origin bound browser session to connect, read status, or disconnect", async () => {
    expect((await manage("connect", { walletId: "maya" }, { ...headers, "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await manage(undefined, {}, { ...headers, cookie: "" })).status).toBe(401);
    expect((await manage("disconnect", {}, { ...headers, "x-finance-shortcut": "" })).status).toBe(403);
    expect(evalMock).not.toHaveBeenCalled();
  });
  it("returns a key once, stores only its hash, reports no key in status, and rejects bearer admin access", async () => {
    const token = await connect();
    expect(token).toMatch(/^ftqe_[a-f0-9]{64}$/);
    expect([...records.values()].join("")).not.toContain(token);
    const status = await manage(); expect(status.body).toMatchObject({ connected: true, walletLabel: "Maya" });
    expect(JSON.stringify(status.body)).not.toContain(token);
    expect((await call({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: { action: "connect", walletId: "cash" } })).status).toBe(403);
    expect(evalMock.mock.calls[0][2][3]).toBe(CONNECTION_TTL);
  });
  it("cannot connect to another user's wallet or return another user's connection", async () => {
    const token = await connect();
    expect((await manage(undefined, {}, { ...headers, cookie: "account-b" })).body).toEqual({ connected: false });
    expect((await manage("connect", { walletId: "maya" }, { ...headers, cookie: "account-b" })).status).toBe(409);
    const r = await save(token, { ...payload, sub: "account-b", walletId: "cash" }); expect(r.status).toBe(400);
    expect(cloud().data.wallets.maya).toBe(1000);
  });
  it("replacing/disconnecting immediately revokes old keys and expired keys cannot save", async () => {
    const first = await connect(); const second = await connect();
    expect((await save(first)).status).toBe(401);
    await manage("disconnect"); expect((await save(second)).status).toBe(401);
    const third = await connect(); vi.spyOn(Date, "now").mockReturnValue(Date.now() + CONNECTION_TTL * 1000 + 1);
    expect((await save(third)).status).toBe(401);
  });
  it("saves through the real money path, preserves unrelated data, advances revision, and stores real logging time", async () => {
    const token = await connect(); const before = cloud();
    const r = await save(token); expect(r.status).toBe(200); expect(r.body.success).toBe(true);
    const after = cloud(); expect(after.revision).toBe(5); expect(after.data.wallets).toEqual({ maya: 899.75, cash: 500 });
    expect(after.data.logs).toEqual(before.data.logs); expect(after.data.settings).toEqual(before.data.settings);
    expect(after.data.library.expenses[0]).toMatchObject({ merchant: "Sample cafe", amount: 100.25, deductedAmount: 100.25, wallet: "maya", date: "2026-11-06" });
    expect(after.data.library.expenses[0].loggedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(r.body)).not.toContain("data"); expect(JSON.stringify(r.body)).not.toContain('"cash"');
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("deducts once for repeated/concurrent requests, and rejects reuse with different contents", async () => {
    const token = await connect(); const replies = await Promise.all([save(token), save(token), save(token)]);
    expect(replies.every(r => r.status === 200)).toBe(true);
    expect(cloud().data.wallets.maya).toBe(899.75); expect(cloud().data.library.expenses).toHaveLength(1); expect(cloud().revision).toBe(5);
    expect((await save(token, { ...payload, amount: "200" })).status).toBe(409);
    const saved = cloud(); saved.data.library.expenses = []; saved.data.wallets.maya = 1000; records.set("finance_data_g_account-a", JSON.stringify(saved));
    expect((await save(token)).body.success).toBe(true); expect(cloud().data.wallets.maya).toBe(1000); // retry does not undo an owner reversal
  });
  it("accepts a native SHA256 request ID and deduplicates the same save", async () => {
    const token = await connect();
    const native = { ...payload, requestId: "abcdef0123456789".repeat(4) };
    const first = await save(token, native);
    const retry = await save(token, { ...native, requestId: native.requestId.toUpperCase() });
    expect(first.status).toBe(200); expect(retry.body).toEqual(first.body);
    expect(cloud().data.wallets.maya).toBe(899.75);
    expect(cloud().data.library.expenses).toHaveLength(1);
    expect((await save(token, { ...native, merchant: "Different purchase" })).status).toBe(409);
  });
  it("reports an unknown outcome after a lost acknowledgement and safely resolves a retry", async () => {
    const token = await connect(); const normal = evalMock.getMockImplementation()!;
    evalMock.mockImplementationOnce(async (script, keys, args) => { await normal(script, keys, args); throw new Error("connection lost after write"); });
    const first = await save(token); expect(first.status).toBe(503); expect(first.body.message).toContain("Save status unknown");
    expect(cloud().data.wallets.maya).toBe(899.75);
    expect((await save(token)).body.success).toBe(true); expect(cloud().data.wallets.maya).toBe(899.75);
    for (const key of records.keys()) if (key.startsWith("ft_shortcut_receipt_v1:")) records.delete(key);
    expect((await save(token)).status).toBe(409); expect(cloud().data.library.expenses).toHaveLength(1);
  });

  it("retries a CAS conflict against the latest cloud state without dropping another writer's changes", async () => {
    const token = await connect(); const normal = evalMock.getMockImplementation()!; let raced = false;
    evalMock.mockImplementation(async (script, keys, args) => {
      if (keys.length === 4 && !raced) { raced = true; const data = base(); data.wallets.cash = 900; records.set(keys[0], JSON.stringify({ data, revision: 5 })); }
      return normal(script, keys, args);
    });
    expect((await save(token)).status).toBe(200); expect(cloud().revision).toBe(6); expect(cloud().data.wallets).toEqual({ maya: 899.75, cash: 900 });
  });
  it("appears in the existing sync read contract and prevents a stale browser snapshot from overwriting it", async () => {
    const token = await connect(); const stale = base();
    await save(token);
    const read = await call({ method: "GET", headers }, syncHandler);
    expect(read.status).toBe(200); expect(read.body.revision).toBe(5);
    expect(read.body.record.library.expenses).toHaveLength(1);
    const normal = evalMock.getMockImplementation()!;
    evalMock.mockImplementation(async (script, keys, args) => {
      if (keys.length === 1 && script.includes("maxRevision")) {
        const current = cloud();
        if (args[0] !== current.revision) return JSON.stringify({ ok: false, conflict: true, raw: records.get(keys[0]), revision: current.revision });
        throw new Error("A stale browser write should never be accepted");
      }
      return normal(script, keys, args);
    });
    const write = await call({ method: "PUT", headers, body: { baseRevision: 4, data: { ...stale, updatedAt: Date.now() + 1 } } }, syncHandler);
    expect(write.status).toBe(409); expect(write.body.data.library.expenses).toHaveLength(1);
    expect(cloud().data.wallets.maya).toBe(899.75);
  });

  it("checks revocation atomically at the moment of the wallet update", async () => {
    const token = await connect(); const normal = evalMock.getMockImplementation()!;
    evalMock.mockImplementation(async (script, keys, args) => { if (keys.length === 4) records.delete(keys[2]); return normal(script, keys, args); });
    expect((await save(token)).status).toBe(401); expect(cloud().data.wallets.maya).toBe(1000);
  });
  it("rejects insufficient, deleted, or archived wallets without changing cloud data", async () => {
    const token = await connect();
    expect((await save(token, { ...payload, amount: "1001" })).status).toBe(409);
    const current = cloud(); current.data.settings.archivedWallets = [{ id: "maya" }]; records.set("finance_data_g_account-a", JSON.stringify(current));
    expect((await save(token)).status).toBe(409); expect(cloud().data.wallets.maya).toBe(1000);
    delete current.data.wallets.maya; records.set("finance_data_g_account-a", JSON.stringify(current)); expect((await save(token)).status).toBe(409);
  });
  it.each([{ amount: -1 }, { amount: 0 }, { amount: "1.001" }, { amount: "Infinity" }, { amount: "1e3" }, { amount: "10000001" }, { merchant: " " }, { merchant: "x".repeat(121) }, { date: "2026-02-30" }, { date: "not-a-date" }, { category: "Unknown" }, { requestId: "" }, { walletId: "other-account" }])("rejects invalid receipt fields %j", async patch => {
    const token = await connect(); const r = await save(token, { ...payload, ...patch }); expect(r.status).toBe(400); expect(cloud().revision).toBe(4);
  });
  it("does not silently round a legacy wallet's fractional-cent balance during a shortcut save", async () => {
    const token = await connect(); const current = cloud(); current.data.wallets.maya = 2.675;
    records.set("finance_data_g_account-a", JSON.stringify(current));
    expect((await save(token, { ...payload, amount: "1" })).status).toBe(409);
    expect(cloud().data.wallets.maya).toBe(2.675);
  });

  it("supports a legacy stored snapshot without migrating or losing existing expenses", async () => {
    const data = base(); records.set("finance_data_g_account-a", JSON.stringify(data));
    const token = await connect(); expect((await save(token)).status).toBe(200); expect(cloud().revision).toBe(1);
  });
  it("fails closed for corrupt storage, unsafe revisions, and transient store failures", async () => {
    const token = await connect(); records.set("finance_data_g_account-a", '{"data":{},"revision":4}'); expect((await save(token)).status).toBe(409);
    records.set("finance_data_g_account-a", JSON.stringify({ data: base(), revision: Number.MAX_SAFE_INTEGER })); expect((await save(token)).status).toBe(503);
    get.mockRejectedValueOnce(new Error("private database credential")); const r = await save(token); expect(r.status).toBe(503); expect(JSON.stringify(r.body)).not.toContain("credential");
  });
});
