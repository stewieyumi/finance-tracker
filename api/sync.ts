import { Redis } from "@upstash/redis";

declare const process: {
  env: {
    APP_AUTH_SECRET?: string;
    KV_REST_API_URL?: string;
    KV_REST_API_TOKEN?: string;
    VITE_GOOGLE_CLIENT_ID?: string;
    VITE_GOOGLE_CLIENT_ID?: string;
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

interface SyncPayload {
  updatedAt: number;
  wallets: unknown;
  library: unknown;
  logs?: unknown;
  settings?: unknown;
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || ""
});



function getClientToken(
  req: VercelApiRequest
): string | undefined {
  const syncPasscode = req.headers["x-sync-passcode"];

  if (typeof syncPasscode === "string") {
    return syncPasscode;
  }

  const appAuth = req.headers["x-app-auth"];

  if (typeof appAuth === "string") {
    return appAuth;
  }

  const authorization = req.headers.authorization;

  if (typeof authorization === "string") {
    return authorization.replace(/^Bearer\s+/i, "");
  }

  return undefined;
}

function isValidUpdatedAt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isValidPayload(
  payload: unknown
): payload is SyncPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const data = payload as SyncPayload;

  if (!isValidUpdatedAt(data.updatedAt)) {
    return false;
  }

  if (!data.wallets || typeof data.wallets !== "object") {
    return false;
  }

  if (!data.library || typeof data.library !== "object") {
    return false;
  }

  return true;
}

export default async function handler(
  req: VercelApiRequest,
  res: VercelApiResponse
) {
  const appAuthSecret = process.env.APP_AUTH_SECRET;

  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-sync-passcode, x-app-auth, Authorization"
    );

    return res.status(200).end();
  }

  if (!appAuthSecret) {
    return res.status(500).json({
      error: "Server configuration error: Missing APP_AUTH_SECRET."
    });
  }

  if (
    !process.env.KV_REST_API_URL ||
    !process.env.KV_REST_API_TOKEN
  ) {
    return res.status(500).json({
      error: "Server configuration error: Missing Redis credentials."
    });
  }

  const clientToken = getClientToken(req);

  if (!clientToken) {
    return res.status(401).json({
      error: "Unauthorized: Missing token."
    });
  }

  let USER_REDIS_KEY = "";
  let isAuthenticated = false;

  // 1. Dev Shortcut (Master Passcode)
  if (clientToken === appAuthSecret) {
    USER_REDIS_KEY = "finance_data";
    isAuthenticated = true;
  } 
  // 2. Google OAuth Token Verification
  else if (clientToken.startsWith("eyJ") && clientToken.split(".").length === 3) {
    try {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${clientToken}`);
      if (!googleRes.ok) {
        return res.status(401).json({ error: "Unauthorized: Invalid or expired Google token." });
      }
      
      const tokenInfo = await googleRes.json();
      if (!tokenInfo.sub) {
        return res.status(401).json({ error: "Unauthorized: Invalid token payload." });
      }
      
      if (tokenInfo.aud !== process.env.VITE_GOOGLE_CLIENT_ID) {
        return res.status(401).json({ error: "Unauthorized: Invalid token audience (cross-app replay risk)." });
      }
      
      USER_REDIS_KEY = `finance_data_g_${tokenInfo.sub}`;
      isAuthenticated = true;
    } catch (err) {
      return res.status(500).json({ error: "Internal error validating Google token." });
    }
  }

  if (!isAuthenticated) {
    return res.status(401).json({ error: "Unauthorized: Invalid passcode or Google token." });
  }

  try {
    if (req.method === "GET") {
      const isVersionCheck = req.url?.includes("version_only=true");
      const data: any = await redis.get(USER_REDIS_KEY);
      
      // If the client only wants to know if there's an update, send the tiny timestamp
      if (isVersionCheck && data?.updatedAt) {
        return res.status(200).json({ updatedAt: data.updatedAt });
      }

      return res.status(200).json(data || {});
    }

    if (req.method === "PUT" || req.method === "POST") {
      const payload =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

      if (!isValidPayload(payload)) {
        return res.status(400).json({
          error:
            "Invalid sync payload: updatedAt, wallets, and library are required."
        });
      }

      const existing =
        await redis.get<SyncPayload>(USER_REDIS_KEY);

      const existingUpdatedAt =
        existing &&
        isValidUpdatedAt(existing.updatedAt)
          ? existing.updatedAt
          : null;

      /*
       * Last-write-wins:
       *
       * A payload may replace the cloud copy only when it is
       * at least as new as the existing cloud record.
       */
      if (
        existingUpdatedAt !== null &&
        payload.updatedAt <= existingUpdatedAt
      ) {
        return res.status(200).json({
          success: true,
          accepted: false,
          cloudUpdatedAt: existingUpdatedAt,
          data: existing
        });
      }

      await redis.set(USER_REDIS_KEY, payload);

      return res.status(200).json({
        success: true,
        accepted: true,
        updatedAt: payload.updatedAt
      });
    }

    return res.status(405).json({
      error: `Method ${req.method} not allowed`
    });
  } catch (err: any) {
    console.error(
      "Redis Sync handler error:",
      err
    );

    return res.status(500).json({
      error:
        "Internal server error during sync."
    });
  }
}