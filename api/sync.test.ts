import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "./sync";

const { mockGet, mockSet, mockEval } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockEval: vi.fn(),
}));

vi.mock("@upstash/redis", () => {
  return {
    Redis: class {
      eval = mockEval;
      get = mockGet;
      set = mockSet;
    },
  };
});

describe("api/sync.ts", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockEval.mockReset();
    vi.clearAllMocks();

    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test_google_client_id");
    vi.stubEnv("KV_REST_API_URL", "https://test-upstash.local");
    vi.stubEnv("KV_REST_API_TOKEN", "test_redis_token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        throw new Error("Unexpected outbound fetch call");
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    vi.unstubAllEnvs();

    mockGet.mockReset();
    mockSet.mockReset();
    mockEval.mockReset();
  });

  const createMockReqRes = (
    method: string,
    headers: Record<string, string>,
    body?: any,
    url = "/api/sync"
  ) => {
    const req: any = { method, headers, body, url };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };
    return { req, res };
  };

  const snapshot = {
    updatedAt: 2000,
    wallets: {},
    library: { bills: [], receivables: [], shoots: [] },
    logs: {},
    settings: {},
  };

  async function authenticatedRequest(method: string, body?: unknown) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: "user_123", aud: "test_google_client_id" }),
    } as Response);
    const { req, res } = createMockReqRes(method, {
      authorization: "Bearer eyJhbGci.valid.user_123",
    }, body);
    await handler(req, res);
    return res;
  }

  it("rejects requests with missing tokens", async () => {
    const { req, res } = createMockReqRes("GET", {});
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized: Missing token." });
    expect(fetch).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockEval).not.toHaveBeenCalled();
  });

  it("rejects invalid Google JWTs", async () => {
    const { req, res } = createMockReqRes("GET", {
      authorization: "Bearer eyJhbGci.invalid.payload",
    });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as any);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockEval).not.toHaveBeenCalled();
  });

  it("rejects valid Google JWTs intended for a different app (Audience Check)", async () => {
    const { req, res } = createMockReqRes("GET", {
      authorization: "Bearer eyJhbGci.valid.payload",
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: "user_123", aud: "malicious_client_id" }),
    } as any);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unauthorized: Invalid token audience (cross-app replay risk).",
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockEval).not.toHaveBeenCalled();
  });

  it.each(["user_123", "user_456"])(
    "accepts valid Google JWTs and routes GET to isolated storage for %s",
    async (sub) => {
      const { req, res } = createMockReqRes("GET", {
        authorization: `Bearer eyJhbGci.valid.${sub}`,
      });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub, aud: "test_google_client_id" }),
      } as any);
      const data = { ...snapshot, updatedAt: 1000 };
      mockGet.mockResolvedValueOnce(data);

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockGet).toHaveBeenCalledWith(`finance_data_g_${sub}`);
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockEval).not.toHaveBeenCalled();
    }
  );

  it("Legacy raw UnifiedFinanceData remains readable (GET)", async () => {
    const { req, res } = createMockReqRes("GET", {
      authorization: "Bearer eyJhbGci.valid.user_123",
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: "user_123", aud: "test_google_client_id" }),
    } as any);

    const legacyData = { ...snapshot, updatedAt: 1000, wallets: [] };
    mockGet.mockResolvedValueOnce(JSON.stringify(legacyData));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGet).toHaveBeenCalledWith("finance_data_g_user_123");
    // Backward compatibility: Should spread legacyData properties at the root
    expect(res.json).toHaveBeenCalledWith(
      { ...legacyData, record: legacyData, revision: 0 }
    );
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockEval).not.toHaveBeenCalled();
  });

  it("Maps a mocked first-write result to revision 1", async () => {
    const data = snapshot;
    const { req, res } = createMockReqRes(
      "PUT",
      { authorization: "Bearer eyJhbGci.valid.user_123" },
      { data, baseRevision: 0 }
    );
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: "user_123", aud: "test_google_client_id" }),
    } as any);

    mockEval.mockResolvedValueOnce(JSON.stringify({ ok: true, revision: 1 }));

    await handler(req, res);

    expect(mockEval).toHaveBeenCalled();
    const evalArgs = mockEval.mock.calls[0];
    // Exact Redis key argument passed to the Lua invocation
    expect(evalArgs[1][0]).toBe("finance_data_g_user_123");
    // Check that we correctly pass the baseRevision to the Lua script
    expect(evalArgs[2][0]).toBe(0);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        revision: 1,
      })
    );
  });

  it("Stale baseRevision returns 409 with current cloud data + revision", async () => {
    const data = snapshot;
    const { req, res } = createMockReqRes(
      "PUT",
      { authorization: "Bearer eyJhbGci.valid.user_123" },
      { data, baseRevision: 5 }
    );
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sub: "user_123", aud: "test_google_client_id" }),
    } as any);

    const conflictResult = {
      ok: false,
      conflict: true,
      raw: JSON.stringify({ data: { ...snapshot, updatedAt: 3000 }, revision: 10 }),
      revision: 10,
    };
    mockEval.mockResolvedValueOnce(JSON.stringify(conflictResult));

    await handler(req, res);

    expect(mockEval).toHaveBeenCalled();
    const evalArgs = mockEval.mock.calls[0];
    // Exact Redis key argument passed to the Lua invocation
    expect(evalArgs[1][0]).toBe("finance_data_g_user_123");
    // Check that we correctly pass the baseRevision to the Lua script
    expect(evalArgs[2][0]).toBe(5);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "conflict",
        revision: 10,
        data: { ...snapshot, updatedAt: 3000 },
      })
    );
  });

  it.each([-1, 1.5, "0", "5", NaN, true, {}, [], undefined, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid included revision %j before eval",
    async (baseRevision) => {
      const res = await authenticatedRequest("PUT", { data: snapshot, baseRevision });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockEval).not.toHaveBeenCalled();
    }
  );

  it.each(["{", "null", null, [], true, 5, { baseRevision: 0 }])(
    "rejects malformed body %j before eval",
    async (body) => {
      const res = await authenticatedRequest("PUT", body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockEval).not.toHaveBeenCalled();
    }
  );

  it.each(["wallets", "library", "logs", "settings"])(
    "rejects missing, null and array %s on both write paths",
    async (key) => {
      for (const value of [undefined, null, []]) {
        const data = { ...snapshot, [key]: value };
        for (const body of [data, { data, baseRevision: 0 }]) {
          const res = await authenticatedRequest("PUT", body);
          expect(res.status).toHaveBeenCalledWith(400);
        }
      }
      expect(mockEval).not.toHaveBeenCalled();
    }
  );

  it.each(["bills", "receivables", "shoots"])("requires the library %s array", async (key) => {
    const data = { ...snapshot, library: { ...snapshot.library, [key]: undefined } };
    const res = await authenticatedRequest("POST", { data, baseRevision: 0 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockEval).not.toHaveBeenCalled();
  });

  it.each([null, 0])("passes modern first-write revision %j as zero", async (baseRevision) => {
    mockEval.mockResolvedValueOnce('{"ok":true,"revision":1}');
    const res = await authenticatedRequest("PUT", JSON.stringify({ data: snapshot, baseRevision }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockEval.mock.calls[0][2]).toEqual([0, JSON.stringify(snapshot), 2000, 0]);
  });

  it("maps the mocked missing-key conflict and ties the contract to the Lua guard", async () => {
    mockEval.mockResolvedValueOnce('{"ok":false,"conflict":true,"revision":0,"raw":null}');
    const res = await authenticatedRequest("PUT", { data: snapshot, baseRevision: 7 });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false, accepted: false, error: "conflict", revision: 0, data: null, empty: true,
    });
    const [script, , args] = mockEval.mock.calls[0];
    expect(args).toEqual([7, JSON.stringify(snapshot), 2000, 0]);
    expect(script).toContain("local currentRevision = 0");
    expect(script).toContain("not isLegacyWrite and currentRevision ~= tonumber(ARGV[1])");
    expect(script.indexOf("currentRevision ~= tonumber(ARGV[1])")).toBeLessThan(script.indexOf("redis.call('SET'"));
  });

  it("preserves the legacy timestamp conflict wire response", async () => {
    mockEval.mockResolvedValueOnce(JSON.stringify({
      ok: false, conflict: true, revision: 0, raw: JSON.stringify(snapshot),
    }));
    const res = await authenticatedRequest("PUT", snapshot);
    expect(mockEval.mock.calls[0][2]).toEqual([0, JSON.stringify(snapshot), 2000, 1]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true, accepted: false, cloudUpdatedAt: 2000, data: snapshot, revision: 0,
    });
  });

  it("returns exactly an empty object for missing GET", async () => {
    mockGet.mockResolvedValueOnce(null);
    const res = await authenticatedRequest("GET");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it.each([
    "{", "null", { data: snapshot }, { revision: 0 }, { data: {}, revision: 0 },
    ...[null, "0", -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map(revision => ({
      data: snapshot, revision,
    })),
  ])("fails closed on malformed GET state %j", async (stored) => {
    mockGet.mockResolvedValueOnce(stored);
    const res = await authenticatedRequest("GET");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_STORED_ENVELOPE" });
    expect(mockEval).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_STORED_ENVELOPE", 500],
    ["REVISION_EXHAUSTED", 503],
  ])("maps mocked Lua error %s", async (error, status) => {
    mockEval.mockResolvedValueOnce(JSON.stringify({ ok: false, error, revision: Number.MAX_SAFE_INTEGER }));
    const res = await authenticatedRequest("PUT", { data: snapshot, baseRevision: Number.MAX_SAFE_INTEGER });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(status === 503
      ? { error, revision: Number.MAX_SAFE_INTEGER }
      : { error });
  });

  it("models sequential OCC and the terminal revision, with structural Lua assertions", async () => {
    // This models revision transitions in TypeScript. It does not execute Lua.
    function model(current: number, base: number) {
      if (current === Number.MAX_SAFE_INTEGER) return { revision: current, writes: 0 };
      if (current !== base) return { revision: current, writes: 0 };
      return { revision: current + 1, writes: 1 };
    }

    const first = model(0, 0);
    expect(first).toEqual({ revision: 1, writes: 1 });
    const second = model(first.revision, 1);
    expect(second).toEqual({ revision: 2, writes: 1 });
    expect(model(second.revision, 1)).toEqual({ revision: 2, writes: 0 });
    expect(model(0, 7)).toEqual({ revision: 0, writes: 0 });
    const terminal = model(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1);
    expect(terminal).toEqual({ revision: Number.MAX_SAFE_INTEGER, writes: 1 });
    expect(model(terminal.revision, terminal.revision)).toEqual({
      revision: Number.MAX_SAFE_INTEGER, writes: 0,
    });

    mockEval.mockResolvedValueOnce(JSON.stringify({ ok: true, revision: terminal.revision }));
    const res = await authenticatedRequest("PUT", {
      data: snapshot, baseRevision: Number.MAX_SAFE_INTEGER - 1,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true, accepted: true, data: snapshot, revision: Number.MAX_SAFE_INTEGER,
    });
    const [script, , args] = mockEval.mock.calls[0];
    expect(args).toEqual([Number.MAX_SAFE_INTEGER - 1, JSON.stringify(snapshot), 2000, 0]);
    expect(script).toContain("local maxRevision = 9007199254740991");
    expect(script).toContain("current.revision ~= nil or current.data ~= nil");
    expect(script).toContain("if not isCompatible(data) then return invalid end");
    expect(script).toContain("local nextRevision = string.format('%.0f', currentRevision + 1)");
    expect(script).toContain("redis.call('SET', KEYS[1],");
    expect(script.indexOf("if currentRevision == maxRevision")).toBeLessThan(
      script.indexOf("local nextRevision"),
    );
  });
});
