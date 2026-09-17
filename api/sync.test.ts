import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './sync';

const { mockGet, mockSet } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn() }));

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      get = mockGet;
      set = mockSet;
    }
  };
});

describe('Sync API Auth & Data Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    process.env.VITE_GOOGLE_CLIENT_ID = 'test_google_client_id';
    process.env.KV_REST_API_URL = 'https://test-upstash.local';
    process.env.KV_REST_API_TOKEN = 'test_redis_token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  const createMockReqRes = (method: string, headers: Record<string, string>, body?: any) => {
    const req: any = { method, headers, body, url: '/api/sync' };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() };
    return { req, res };
  };

  it('rejects requests with missing tokens', async () => {
    const { req, res } = createMockReqRes('GET', {});
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Missing token.' });
  });

  it('rejects invalid Google JWTs', async () => {
    const { req, res } = createMockReqRes('GET', { authorization: 'Bearer eyJhbGci.invalid.payload' });
    vi.mocked(fetch).mockResolvedValue({ ok: false } as any);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects valid Google JWTs intended for a different app (Audience Check)', async () => {
    const { req, res } = createMockReqRes('GET', { authorization: 'Bearer eyJhbGci.valid.payload' });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ sub: 'user_123', aud: 'malicious_client_id' }) } as any);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts valid Google JWTs and routes to isolated storage', async () => {
    const { req, res } = createMockReqRes('GET', { authorization: 'Bearer eyJhbGci.valid.payload' });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ sub: 'user_123', aud: 'test_google_client_id' }) } as any);
    mockGet.mockResolvedValue({ updatedAt: 1000, library: {} });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGet).toHaveBeenCalled();
  });
});
