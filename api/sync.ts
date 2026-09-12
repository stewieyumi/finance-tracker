// api/sync.ts
import { Redis } from '@upstash/redis';

// Tell TypeScript about our environment variables
declare const process: {
  env: {
    APP_AUTH_SECRET?: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
    [key: string]: string | undefined;
  };
};

interface VercelApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (data: any) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET;

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-sync-passcode, x-app-auth, Authorization");
    return res.status(200).end();
  }

  // 1. Validate Secret & Redis Config
  if (!APP_AUTH_SECRET) {
    return res.status(500).json({ error: "Server configuration error: Missing APP_AUTH_SECRET." });
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) {
     return res.status(500).json({ error: "Server configuration error: Missing Upstash Redis credentials." });
  }

  // 2. Validate client passcode
  const clientToken =
    (req.headers["x-sync-passcode"] as string) ||
    (req.headers["x-app-auth"] as string) ||
    (typeof req.headers.authorization === "string"
      ? req.headers.authorization.replace(/^Bearer\s+/i, "")
      : undefined);

  if (!clientToken || clientToken !== APP_AUTH_SECRET) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing passcode." });
  }

  try {
    // GET: Pull data from Upstash Redis
    if (req.method === "GET") {
      const data = await redis.get("finance_data");
      return res.status(200).json(data || {});
    }

    // PUT or POST: Save data to Upstash Redis
    if (req.method === "PUT" || req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await redis.set("finance_data", payload);
      return res.status(200).json({ success: true, updatedAt: Date.now(), data: payload });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err: any) {
    console.error("Redis Sync handler error:", err);
    return res.status(500).json({ error: "Internal server error during sync." });
  }
}