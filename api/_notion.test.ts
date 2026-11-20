import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "./notion";

describe("Notion API Proxy (api/notion.ts) - Gate 1 Data-Source Flow", () => {
  const DEFAULT_ENV = {
    NOTION_API_SECRET: "test_notion_secret_key",
    NOTION_DATABASE_ID: "test_notion_database_123",
    ALLOWED_GOOGLE_EMAIL: "owner@example.com",
    VITE_GOOGLE_CLIENT_ID: "test_google_client_id_456",
  };

  const VALID_SCHEMA = {
    FT_ID: { type: "rich_text" },
    Name: { type: "title" },
    Date: { type: "date" },
    Category: { type: "select" },
    Status: { type: "select" },
    Completed: { type: "checkbox" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    Object.assign(process.env, DEFAULT_ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NOTION_API_SECRET;
    delete process.env.NOTION_DATABASE_ID;
    delete process.env.ALLOWED_GOOGLE_EMAIL;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
  });

  const createMockReqRes = (
    method: string,
    headers: Record<string, string>,
    body?: any
  ) => {
    const req: any = { method, headers, body, url: "/api/notion" };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };
    return { req, res };
  };

  const setupDefaultMocks = (options?: {
    email?: string;
    dataSourceId?: string;
    dataSources?: Array<{ id: string; name?: string }>;
    schema?: Record<string, { type: string }>;
    existingPages?: { id: string; ftId: string }[];
  }) => {
    const userEmail = options?.email ?? "owner@example.com";
    const dataSourceId = options?.dataSourceId ?? "test_data_source_789";
    const dataSources =
      options?.dataSources ?? [{ id: dataSourceId, name: "Finance Tracker Gigs" }];
    const schema = options?.schema ?? VALID_SCHEMA;
    const existingPages = options?.existingPages ?? [];

    vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);

      if (urlStr.includes("oauth2.googleapis.com/tokeninfo")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "google_user_sub_999",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: userEmail,
          }),
        } as any;
      }

      // 1. Database metadata retrieval
      if (
        urlStr === "https://api.notion.com/v1/databases/test_notion_database_123" &&
        init?.method === "GET"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "test_notion_database_123",
            data_sources: dataSources,
          }),
        } as any;
      }

      // 2. Data source schema retrieval
      if (
        urlStr === `https://api.notion.com/v1/data_sources/${dataSourceId}` &&
        init?.method === "GET"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: dataSourceId,
            properties: schema,
          }),
        } as any;
      }

      // 3. Data source query
      if (
        urlStr === `https://api.notion.com/v1/data_sources/${dataSourceId}/query` &&
        init?.method === "POST"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: existingPages.map((p) => ({
              id: p.id,
              properties: {
                FT_ID: {
                  type: "rich_text",
                  rich_text: [{ plain_text: p.ftId }],
                },
              },
            })),
          }),
        } as any;
      }

      // 4. Page updates & creations
      if (urlStr.includes("api.notion.com/v1/pages")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "notion-page-generated-id",
          }),
        } as any;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ message: "Not found" }),
      } as any;
    });
  };

  it("handles OPTIONS preflight with CORS headers", async () => {
    const { req, res } = createMockReqRes("OPTIONS", {});
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  it("rejects non-POST HTTP methods with 405", async () => {
    const { req, res } = createMockReqRes("GET", {});
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "METHOD_NOT_ALLOWED" })
    );
  });

  it("rejects requests missing Authorization header with 401", async () => {
    const { req, res } = createMockReqRes("POST", {});
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AUTH_REQUIRED" })
    );
  });

  it("rejects invalid Google token with 401", async () => {
    const { req, res } = createMockReqRes("POST", {
      authorization: "Bearer eyJhbGci.invalid.token",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error_description: "Invalid Value" }),
    } as any);

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AUTH_INVALID" })
    );
  });

  it("rejects Google token missing sub with 401", async () => {
    const { req, res } = createMockReqRes("POST", {
      authorization: "Bearer eyJhbGci.valid.token",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        aud: process.env.VITE_GOOGLE_CLIENT_ID,
        email: "owner@example.com",
      }),
    } as any);

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AUTH_INVALID" })
    );
  });

  it("rejects Google token with wrong audience with 401", async () => {
    const { req, res } = createMockReqRes("POST", {
      authorization: "Bearer eyJhbGci.valid.token",
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sub: "user_123",
        aud: "malicious_app_client_id",
        email: "owner@example.com",
      }),
    } as any);

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AUTH_INVALID" })
    );
  });

  it("rejects unauthorized Google email with 403", async () => {
    const { req, res } = createMockReqRes("POST", {
      authorization: "Bearer eyJhbGci.valid.token",
    });
    setupDefaultMocks({ email: "unauthorized_user@gmail.com" });

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AUTH_FORBIDDEN" })
    );
  });

  it("returns 500 when required environment configuration is missing", async () => {
    delete process.env.NOTION_API_SECRET;
    const { req, res } = createMockReqRes("POST", {
      authorization: "Bearer eyJhbGci.valid.token",
    });

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "CONFIG_ERROR" })
    );
  });

  it("rejects payload missing shoots array with 400", async () => {
    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { notShoots: [] }
    );
    setupDefaultMocks();

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_PAYLOAD" })
    );
  });

  it("rejects empty shoots array with 400", async () => {
    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [] }
    );
    setupDefaultMocks();

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_PAYLOAD" })
    );
  });

  it("rejects payload containing more than 10 shoots with 400", async () => {
    const shoots = Array.from({ length: 11 }, (_, i) => ({
      id: `shoot-${i + 1}`,
      title: `Shoot ${i + 1}`,
      completed: false,
    }));
    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots }
    );
    setupDefaultMocks();

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_PAYLOAD" })
    );
  });

  it("rejects duplicate FT IDs in the same request with 400", async () => {
    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      {
        shoots: [
          { id: "duplicate-id", title: "Shoot A", completed: false },
          { id: "duplicate-id", title: "Shoot B", completed: true },
        ],
      }
    );
    setupDefaultMocks();

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_PAYLOAD" })
    );
  });

  it("verifies Notion-Version is exactly 2026-03-11 across all calls", async () => {
    setupDefaultMocks();
    const capturedVersions: string[] = [];

    const originalFetch = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("api.notion.com")) {
        const v = init?.headers?.["Notion-Version"];
        if (v) capturedVersions.push(v);
      }
      return originalFetch!(url, init);
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-v", title: "Check Version", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedVersions.length).toBeGreaterThanOrEqual(3);
    for (const v of capturedVersions) {
      expect(v).toBe("2026-03-11");
    }
  });

  it("performs database metadata retrieval and data_source_id extraction", async () => {
    let dbMetadataCalled = false;
    let dsSchemaCalled = false;

    vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/databases/test_notion_database_123") {
        dbMetadataCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "test_notion_database_123",
            data_sources: [{ id: "extracted_ds_42", name: "Extracted Source" }],
          }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/data_sources/extracted_ds_42") {
        dsSchemaCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "extracted_ds_42",
            properties: VALID_SCHEMA,
          }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/data_sources/extracted_ds_42/query") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        } as any;
      }
      if (urlStr.includes("api.notion.com/v1/pages")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "page_new" }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-meta", title: "Metadata Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(dbMetadataCalled).toBe(true);
    expect(dsSchemaCalled).toBe(true);
  });

  it("returns 400 SCHEMA_MISMATCH when database metadata has zero data sources", async () => {
    setupDefaultMocks({ dataSources: [] });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-zero-ds", title: "Shoot Zero DS", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    });
  });

  it("returns 400 SCHEMA_MISMATCH when database metadata has multiple data sources", async () => {
    setupDefaultMocks({
      dataSources: [
        { id: "ds_1", name: "Data Source 1" },
        { id: "ds_2", name: "Data Source 2" },
      ],
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-multi-ds", title: "Shoot Multi DS", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    });
  });

  it("returns 400 SCHEMA_MISMATCH when database metadata only provides legacy data_source_id", async () => {
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      if (urlStr.includes("/databases/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "test_notion_database_123",
            data_source_id: "legacy_ds_id_only",
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-legacy-ds", title: "Shoot Legacy DS", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    });
  });

  it("returns 400 SCHEMA_MISMATCH when data source schema is missing required property", async () => {
    // Missing 'Status' property
    const incompleteSchema = {
      FT_ID: { type: "rich_text" },
      Name: { type: "title" },
      Date: { type: "date" },
      Category: { type: "select" },
      Completed: { type: "checkbox" },
    };

    setupDefaultMocks({ schema: incompleteSchema });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-bad-schema", title: "Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    });
  });

  it("returns 400 SCHEMA_MISMATCH when data source property has incompatible type", async () => {
    // 'Status' is status instead of select
    const invalidTypeSchema = {
      ...VALID_SCHEMA,
      Status: { type: "status" },
    };

    setupDefaultMocks({ schema: invalidTypeSchema });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "shoot-bad-type", title: "Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    });
  });

  it("creates new page using data_source_id parent", async () => {
    let capturedBody: any = null;

    vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      if (urlStr.includes("/databases/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data_sources: [{ id: "ds_parent_test", name: "Parent Test Source" }],
          }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/data_sources/ds_parent_test") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ properties: VALID_SCHEMA }),
        } as any;
      }
      if (urlStr.includes("/data_sources/ds_parent_test/query")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/pages" && init?.method === "POST") {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "new-page-id" }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "new-s", title: "New Page Parent Check", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.parent).toEqual({
      type: "data_source_id",
      data_source_id: "ds_parent_test",
    });
    expect(capturedBody.parent.type).toBe("data_source_id");
    expect(capturedBody.parent.data_source_id).toBe("ds_parent_test");
    expect(capturedBody.parent.database_id).toBeUndefined();
  });

  it("updates existing page by page ID via PATCH", async () => {
    let patchUrl = "";
    let patchMethod = "";

    setupDefaultMocks({
      existingPages: [{ id: "notion-existing-123", ftId: "update-target" }],
    });

    const originalFetch = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (init?.method === "PATCH") {
        patchUrl = urlStr;
        patchMethod = init.method;
      }
      return originalFetch!(url, init);
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "update-target", title: "Target Title", completed: true }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(patchMethod).toBe("PATCH");
    expect(patchUrl).toBe("https://api.notion.com/v1/pages/notion-existing-123");
  });

  it("generic 400 validation error does NOT become SCHEMA_MISMATCH", async () => {
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      // Return a generic 400 validation error unrelated to properties or schema
      return {
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          object: "error",
          status: 400,
          code: "validation_error",
          message: "Request payload body is corrupted or unrecognized syntax.",
        }),
      } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "s1", title: "Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: "NOTION_REQUEST_FAILED",
      message: "Notion request failed.",
    });
  });

  it("handles Notion 429 rate limit safely", async () => {
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      return {
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({
          object: "error",
          status: 429,
          code: "rate_limited",
          message: "Rate limit reached.",
        }),
      } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "s1", title: "Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "NOTION_RATE_LIMITED",
      message: "Notion is rate-limited or overloaded. Please try again later.",
    });
  });

  it("handles Notion 529 service overload safely", async () => {
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      return {
        ok: false,
        status: 529,
        headers: new Headers(),
        json: async () => ({
          object: "error",
          status: 529,
          code: "service_overload",
          message: "Notion is overloaded.",
        }),
      } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "s1", title: "Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(529);
    expect(res.json).toHaveBeenCalledWith({
      error: "NOTION_RATE_LIMITED",
      message: "Notion is rate-limited or overloaded. Please try again later.",
    });
  });

  it("observes Retry-After header from Notion and forwards it to client", async () => {
    const headers = new Headers();
    headers.set("Retry-After", "45");

    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      return {
        ok: false,
        status: 429,
        headers,
        json: async () => ({ code: "rate_limited" }),
      } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      { shoots: [{ id: "s1", title: "Shoot", completed: false }] }
    );

    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "45");
  });

  it("strips malicious extra shoot fields and keeps database ID immutable", async () => {
    let capturedBody: any = null;
    let databaseQueried = "";

    vi.mocked(fetch).mockImplementation(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      if (urlStr.includes("/databases/")) {
        databaseQueried = urlStr;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data_sources: [{ id: "ds_strict", name: "Strict Source" }],
          }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/data_sources/ds_strict") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ properties: VALID_SCHEMA }),
        } as any;
      }
      if (urlStr.includes("/query")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        } as any;
      }
      if (urlStr.includes("/pages")) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "p1" }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      {
        notionDatabaseId: "attacker_database_id_override",
        shoots: [
          {
            id: "s1",
            title: "Safe Gig",
            completed: true,
            maliciousPayload: "ATTACK",
            extraSql: "DROP ALL",
          },
        ],
      }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(databaseQueried).toBe("https://api.notion.com/v1/databases/test_notion_database_123");
    expect(capturedBody.properties.maliciousPayload).toBeUndefined();
    expect(capturedBody.properties.extraSql).toBeUndefined();
  });

  it("processes a mixed batch with both updates and creations correctly", async () => {
    setupDefaultMocks({
      existingPages: [{ id: "page-existing-1", ftId: "shoot-1" }],
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      {
        shoots: [
          { id: "shoot-1", title: "Gig 1 (Existing)", completed: true },
          { id: "shoot-2", title: "Gig 2 (Brand New)", completed: false },
        ],
      }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      created: 1,
      updated: 1,
    });
  });

  it("executes mutations strictly sequentially", async () => {
    let inFlightMutations = 0;
    let maxConcurrentMutations = 0;

    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: "sub_1",
            aud: process.env.VITE_GOOGLE_CLIENT_ID,
            email: "owner@example.com",
          }),
        } as any;
      }
      if (urlStr.includes("/databases/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data_sources: [{ id: "ds_seq", name: "Seq Source" }],
          }),
        } as any;
      }
      if (urlStr === "https://api.notion.com/v1/data_sources/ds_seq") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ properties: VALID_SCHEMA }),
        } as any;
      }
      if (urlStr.includes("/query")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        } as any;
      }
      if (urlStr.includes("api.notion.com/v1/pages")) {
        inFlightMutations++;
        if (inFlightMutations > maxConcurrentMutations) {
          maxConcurrentMutations = inFlightMutations;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlightMutations--;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "page-id" }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const { req, res } = createMockReqRes(
      "POST",
      { authorization: "Bearer eyJhbGci.valid.token" },
      {
        shoots: [
          { id: "seq-1", title: "Gig 1", completed: false },
          { id: "seq-2", title: "Gig 2", completed: false },
        ],
      }
    );

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(maxConcurrentMutations).toBe(1);
  });
});
