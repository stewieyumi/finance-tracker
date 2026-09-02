// api/sync.ts

declare const process: {
  env: {
    JSONBIN_MASTER_KEY?: string;
    JSONBIN_BIN_ID?: string;
    APP_AUTH_SECRET?: string;
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

const JSONBIN_API_KEY = process.env.JSONBIN_MASTER_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET;

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-sync-passcode, x-app-auth, Authorization");
    return res.status(200).end();
  }

  // 1. Fail closed if server env variables are missing
  if (!APP_AUTH_SECRET || !JSONBIN_API_KEY || !JSONBIN_BIN_ID) {
    console.error("Missing required server environment variables.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  // 2. Validate client passcode via custom header or Bearer authorization
  const clientToken =
    (req.headers["x-sync-passcode"] as string) ||
    (req.headers["x-app-auth"] as string) ||
    (typeof req.headers.authorization === "string"
      ? req.headers.authorization.replace(/^Bearer\s+/i, "")
      : undefined);

  if (!clientToken || clientToken !== APP_AUTH_SECRET) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing passcode." });
  }

  const jsonBinUrl = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

  try {
    // GET: Pull latest from JSONBin
    if (req.method === "GET") {
      const response = await fetch(`${jsonBinUrl}/latest`, {
        headers: {
          "X-Master-Key": JSONBIN_API_KEY,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch remote data." });
      }

      const data = await response.json();
      return res.status(200).json(data.record || data);
    }

    // PUT or POST: Save to JSONBin
    if (req.method === "PUT" || req.method === "POST") {
      const response = await fetch(jsonBinUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY,
        },
        body: typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to persist remote data." });
      }

      const data = await response.json();
      return res.status(200).json({ success: true, updatedAt: Date.now(), data });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err: any) {
    console.error("Sync handler error:", err);
    return res.status(500).json({ error: "Internal server error during sync." });
  }
}