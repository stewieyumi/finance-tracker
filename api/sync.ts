import { Redis } from "@upstash/redis";

declare const process: {
  env: {
    KV_REST_API_URL?: string;
    KV_REST_API_TOKEN?: string;
    VITE_GOOGLE_CLIENT_ID?: string;
    [key: string]: string | undefined;
  };
};

interface VercelApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
  url?: string;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (data: any) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
  automaticDeserialization: false
});

function getClientToken(req: VercelApiRequest): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    return authorization.replace(/^Bearer\s+/i, "");
  }
  return undefined;
}

function isValidUpdatedAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCompatibleStoredData(data: unknown): data is Record<string, unknown> {
  if (!isObject(data)) return false;
  const { wallets, library, logs, settings } = data;
  return !!wallets && typeof wallets === "object" &&
    isObject(library) && Array.isArray(library.bills) &&
    Array.isArray(library.receivables) && Array.isArray(library.shoots) &&
    !!logs && typeof logs === "object" &&
    !!settings && typeof settings === "object";
}

function isValidIncomingFinanceData(data: unknown): data is Record<string, unknown> & { updatedAt: number } {
  return isCompatibleStoredData(data) && isValidUpdatedAt(data.updatedAt) &&
    isObject(data.wallets) && isObject(data.logs) && isObject(data.settings);
}

function readStoredRecord(raw: unknown) {
  if (!isObject(raw)) return null;
  if ("data" in raw || "revision" in raw) {
    if (!isValidRevision(raw.revision) || !isCompatibleStoredData(raw.data)) return null;
    return { data: raw.data, revision: raw.revision };
  }
  return isCompatibleStoredData(raw) ? { data: raw, revision: 0 } : null;
}

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: "Server configuration error: Missing Redis credentials." });
  }

  const clientToken = getClientToken(req);
  if (!clientToken) {
    return res.status(401).json({ error: "Unauthorized: Missing token." });
  }

  let USER_REDIS_KEY = "";
  let isAuthenticated = false;

  if (clientToken.startsWith("eyJ") && clientToken.split(".").length === 3) {
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
    return res.status(401).json({ error: "Unauthorized: Invalid Google token." });
  }

  try {
    if (req.method === "GET") {
      const isVersionCheck = req.url?.includes("version_only=true");
      const rawData = await redis.get<unknown>(USER_REDIS_KEY);

      if (rawData === null) {
        return res.status(200).json({});
      }

      let stored: unknown = rawData;
      if (typeof rawData === "string") {
        try {
          stored = JSON.parse(rawData);
        } catch {
          return res.status(500).json({ error: "INVALID_STORED_ENVELOPE" });
        }
      }
      const record = readStoredRecord(stored);
      if (!record) return res.status(500).json({ error: "INVALID_STORED_ENVELOPE" });
      const { data, revision } = record;

      if (isVersionCheck) {
        return res.status(200).json({ updatedAt: data.updatedAt, revision });
      }
      // Return { record, revision } so legacy clients using `res.record || res` work seamlessly
      return res.status(200).json({ ...data, record: data, revision });
    }

    if (req.method === "PUT" || req.method === "POST") {
      let payload: unknown = req.body;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return res.status(400).json({ error: "Invalid JSON body." });
        }
      }
      if (!isObject(payload)) return res.status(400).json({ error: "Invalid sync payload." });

      const isLegacyWrite = !Object.prototype.hasOwnProperty.call(payload, "baseRevision");
      const baseRevision = isLegacyWrite ? null : payload.baseRevision;
      if (baseRevision !== null && !isValidRevision(baseRevision)) {
        return res.status(400).json({ error: "Invalid baseRevision." });
      }

      const dataToSave = isLegacyWrite ? payload : payload.data;
      if (!isValidIncomingFinanceData(dataToSave)) {
        return res.status(400).json({ error: "Invalid sync payload." });
      }

      const script = `
        local rawCurrent = redis.call('GET', KEYS[1])
        local maxRevision = 9007199254740991
        local currentRevision = 0
        local existingUpdatedAt = 0
        local invalid = '{"ok":false,"error":"INVALID_STORED_ENVELOPE"}'

        -- cjson decodes objects and arrays as tables. Add an array element
        -- to a validation-only copy so even empty arrays can be identified.
        local function markArrays(raw)
          local pieces = {}
          local inString = false
          local escaped = false
          local start = 1
          for index = 1, #raw do
            local char = raw:sub(index, index)
            if inString then
              if escaped then
                escaped = false
              elseif char == string.char(92) then
                escaped = true
              elseif char == '"' then
                inString = false
              end
            elseif char == '"' then
              inString = true
            elseif char == '[' then
              pieces[#pieces + 1] = raw:sub(start, index) .. 'true'
              if not raw:find('^%s*%]', index + 1) then
                pieces[#pieces + 1] = ','
              end
              start = index + 1
            end
          end
          pieces[#pieces + 1] = raw:sub(start)
          return table.concat(pieces)
        end

        local function isArray(value)
          return type(value) == 'table' and value[1] == true
        end

        local function isObject(value)
          return type(value) == 'table' and not isArray(value)
        end

        local function isCompatible(data)
          return isObject(data) and type(data.wallets) == 'table'
            and isObject(data.library) and isArray(data.library.bills)
            and isArray(data.library.receivables) and isArray(data.library.shoots)
            and type(data.logs) == 'table' and type(data.settings) == 'table'
        end

        if rawCurrent then
          local valid = pcall(cjson.decode, rawCurrent)
          if not valid then return invalid end
          local decoded, current = pcall(cjson.decode, markArrays(rawCurrent))
          if not decoded or not isObject(current) then return invalid end
          local data = current
          if current.revision ~= nil or current.data ~= nil then
            currentRevision = current.revision
            if type(currentRevision) ~= 'number' or currentRevision < 0
              or currentRevision > maxRevision or currentRevision % 1 ~= 0 then
              return invalid
            end
            data = current.data
          end
          if not isCompatible(data) then return invalid end
          existingUpdatedAt = tonumber(data.updatedAt) or 0
        end

        local revisionJson = string.format('%.0f', currentRevision)
        if currentRevision == maxRevision then
          return '{"ok":false,"error":"REVISION_EXHAUSTED","revision":' .. revisionJson .. '}'
        end

        local isLegacyWrite = ARGV[4] == '1'
        if (isLegacyWrite and rawCurrent and existingUpdatedAt >= tonumber(ARGV[3]))
          or (not isLegacyWrite and currentRevision ~= tonumber(ARGV[1])) then
          local rawJson = rawCurrent and cjson.encode(rawCurrent) or 'null'
          return '{"ok":false,"conflict":true,"revision":' .. revisionJson .. ',"raw":' .. rawJson .. '}'
        end

        local nextRevision = string.format('%.0f', currentRevision + 1)
        redis.call('SET', KEYS[1], '{"data":' .. ARGV[2] .. ',"revision":' .. nextRevision .. '}')
        return '{"ok":true,"revision":' .. nextRevision .. '}'
      `;

      const resultStr = await redis.eval<[number, string, number, number], string>(
        script,
        [USER_REDIS_KEY],
        [
          baseRevision ?? 0,
          JSON.stringify(dataToSave),
          dataToSave.updatedAt,
          isLegacyWrite ? 1 : 0
        ]
      );

      const result = typeof resultStr === "string" ? JSON.parse(resultStr) : resultStr;

      if (result?.error === "REVISION_EXHAUSTED") {
        return res.status(503).json({ error: result.error, revision: result.revision });
      }
      if (result?.error === "INVALID_STORED_ENVELOPE") {
        return res.status(500).json({ error: result.error });
      }
      if (result?.conflict) {
        const record = result.raw === null ? null : readStoredRecord(JSON.parse(result.raw));
        const data = record?.data ?? null;
        if (isLegacyWrite) {
          return res.status(200).json({ success: true, accepted: false, cloudUpdatedAt: data?.updatedAt, data, revision: result.revision });
        }
        return res.status(409).json({
          success: false, accepted: false, error: "conflict", revision: result.revision, data,
          ...(result.raw === null ? { empty: true } : {})
        });
      }
      if (!result?.ok || !isValidRevision(result.revision)) {
        throw new Error("Invalid Redis sync result.");
      }

      return res.status(200).json({ success: true, accepted: true, data: dataToSave, revision: result.revision });
    }

    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err: any) {
    console.error("Redis Sync handler error:", err);
    return res.status(500).json({ error: "Internal server error during sync." });
  }
}
