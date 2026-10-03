declare const process: {
  env: {
    NOTION_API_SECRET?: string;
    NOTION_DATABASE_ID?: string;
    ALLOWED_GOOGLE_EMAIL?: string;
    VITE_GOOGLE_CLIENT_ID?: string;
    [key: string]: string | undefined;
  };
};

export interface VercelApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
  url?: string;
}

export interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (data: any) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export interface ValidatedShoot {
  id: string;
  title: string;
  date?: string;
  category?: string;
  status?: string;
  completed: boolean;
}

const NOTION_API_VERSION = "2026-03-11";
const MUTATION_DELAY_MS = 350;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getClientToken(req: VercelApiRequest): string | undefined {
  const authorization = req.headers.authorization || req.headers.Authorization;
  if (typeof authorization === "string") {
    return authorization.replace(/^Bearer\s+/i, "");
  }
  return undefined;
}

function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function validateShootsPayload(
  shoots: unknown
): { valid: false; error: string } | { valid: true; data: ValidatedShoot[] } {
  if (!Array.isArray(shoots)) {
    return { valid: false, error: "Shoots must be an array." };
  }
  if (shoots.length < 1 || shoots.length > 10) {
    return { valid: false, error: "Payload must contain between 1 and 10 shoots." };
  }

  const seenIds = new Set<string>();
  const validated: ValidatedShoot[] = [];

  for (const s of shoots) {
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      return { valid: false, error: "Each shoot must be a valid object." };
    }

    if (typeof s.id !== "string" || s.id.trim().length === 0) {
      return { valid: false, error: "Shoot id must be a non-empty string." };
    }
    const cleanId = s.id.trim();
    if (seenIds.has(cleanId)) {
      return { valid: false, error: `Duplicate shoot ID in request: "${cleanId}".` };
    }
    seenIds.add(cleanId);

    if (typeof s.title !== "string") {
      return { valid: false, error: "Shoot title must be a string." };
    }

    if (typeof s.completed !== "boolean") {
      return { valid: false, error: "Shoot completed must be a boolean." };
    }

    if (s.date !== undefined && s.date !== null) {
      if (typeof s.date !== "string" || !isValidDateString(s.date.trim())) {
        return { valid: false, error: "Shoot date must be a valid YYYY-MM-DD string." };
      }
    }

    if (s.category !== undefined && s.category !== null) {
      if (typeof s.category !== "string") {
        return { valid: false, error: "Shoot category must be a string." };
      }
    }

    if (s.status !== undefined && s.status !== null) {
      if (typeof s.status !== "string") {
        return { valid: false, error: "Shoot status must be a string." };
      }
    }

    validated.push({
      id: cleanId,
      title: s.title,
      completed: s.completed,
      date: s.date ? s.date.trim() : undefined,
      category: s.category !== undefined && s.category !== null ? s.category : undefined,
      status: s.status !== undefined && s.status !== null ? s.status : undefined,
    });
  }

  return { valid: true, data: validated };
}

export function buildNotionProperties(shoot: ValidatedShoot): Record<string, any> {
  const properties: Record<string, any> = {
    FT_ID: {
      rich_text: [
        {
          text: {
            content: shoot.id,
          },
        },
      ],
    },
    Name: {
      title: [
        {
          text: {
            content: shoot.title,
          },
        },
      ],
    },
    Completed: {
      checkbox: shoot.completed,
    },
    Date: shoot.date
      ? {
          date: {
            start: shoot.date,
          },
        }
      : {
          date: null,
        },
    Category: shoot.category
      ? {
          select: {
            name: shoot.category,
          },
        }
      : {
          select: null,
        },
    Status: shoot.status
      ? {
          select: {
            name: shoot.status,
          },
        }
      : {
          select: null,
        },
  };

  return properties;
}

async function handleNotionError(
  res: Response,
  clientRes: VercelApiResponse
): Promise<{ status: number; error: string; message: string }> {
  const status = res.status;
  const isRateLimit = status === 429 || status === 529;

  let errorCode = "";
  let errorMessage = "";
  try {
    const errorBody = await res.json();
    errorCode = typeof errorBody?.code === "string" ? errorBody.code : "";
    errorMessage = typeof errorBody?.message === "string" ? errorBody.message : "";
  } catch {
    // ignore json parsing errors
  }

  const retryAfter = res.headers.get("retry-after") || res.headers.get("Retry-After");
  if (retryAfter) {
    clientRes.setHeader("Retry-After", retryAfter);
  }

  if (isRateLimit || errorCode === "rate_limited" || errorCode === "service_overload") {
    return {
      status: status === 529 ? 529 : 429,
      error: "NOTION_RATE_LIMITED",
      message: "Notion is rate-limited or overloaded. Please try again later.",
    };
  }

  const isSchemaMismatch =
    status === 400 &&
    ((errorCode === "object_not_found" && errorMessage.toLowerCase().includes("property")) ||
      errorMessage.toLowerCase().includes("property") ||
      errorMessage.toLowerCase().includes("schema"));

  if (isSchemaMismatch) {
    return {
      status: 400,
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    };
  }

  return {
    status: 502,
    error: "NOTION_REQUEST_FAILED",
    message: "Notion request failed.",
  };
}

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "METHOD_NOT_ALLOWED", message: `Method ${req.method} not allowed.` });
  }

  if (
    !process.env.NOTION_API_SECRET ||
    !process.env.NOTION_DATABASE_ID ||
    !process.env.ALLOWED_GOOGLE_EMAIL ||
    !process.env.VITE_GOOGLE_CLIENT_ID
  ) {
    return res.status(500).json({ error: "CONFIG_ERROR", message: "Server configuration error." });
  }

  const clientToken = getClientToken(req);
  if (!clientToken) {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "Missing authorization token." });
  }

  if (!clientToken.startsWith("eyJ") || clientToken.split(".").length !== 3) {
    return res.status(401).json({ error: "AUTH_INVALID", message: "Invalid token format." });
  }

  let tokenInfo: any;
  try {
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(clientToken)}`
    );
    if (!googleRes.ok) {
      return res.status(401).json({ error: "AUTH_INVALID", message: "Invalid or expired Google token." });
    }
    tokenInfo = await googleRes.json();
  } catch {
    return res.status(500).json({ error: "AUTH_FAILED", message: "Internal error validating Google token." });
  }

  if (!tokenInfo?.sub) {
    return res.status(401).json({ error: "AUTH_INVALID", message: "Invalid token payload: missing sub." });
  }

  if (tokenInfo.aud !== process.env.VITE_GOOGLE_CLIENT_ID) {
    return res.status(401).json({ error: "AUTH_INVALID", message: "Invalid token audience." });
  }

  if (!tokenInfo.email || typeof tokenInfo.email !== "string") {
    return res.status(401).json({ error: "AUTH_INVALID", message: "Invalid token payload: missing email." });
  }

  const userEmail = tokenInfo.email.trim().toLowerCase();
  const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL.trim().toLowerCase();

  if (userEmail !== allowedEmail) {
    return res.status(403).json({ error: "AUTH_FORBIDDEN", message: "Access forbidden." });
  }

  let rawBody = req.body;
  if (typeof rawBody === "string") {
    try {
      rawBody = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: "INVALID_PAYLOAD", message: "Invalid JSON body." });
    }
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return res.status(400).json({ error: "INVALID_PAYLOAD", message: "Request body must be an object." });
  }

  const validation = validateShootsPayload(rawBody.shoots);
  if (!validation.valid) {
    return res.status(400).json({ error: "INVALID_PAYLOAD", message: validation.error });
  }
  const shoots = validation.data;

  const databaseId = process.env.NOTION_DATABASE_ID;
  const notionSecret = process.env.NOTION_API_SECRET;

  const notionHeaders = {
    Authorization: `Bearer ${notionSecret}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };

  // 1. Retrieve database metadata to obtain its data_source_id
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: "GET",
    headers: notionHeaders,
  });

  if (!dbRes.ok) {
    const errorDetails = await handleNotionError(dbRes, res);
    return res.status(errorDetails.status).json({
      error: errorDetails.error,
      message: errorDetails.message,
    });
  }

  const dbData = await dbRes.json();
  const dataSources = dbData?.data_sources;

  if (
    !Array.isArray(dataSources) ||
    dataSources.length !== 1 ||
    typeof dataSources[0]?.id !== "string" ||
    dataSources[0].id.trim().length === 0
  ) {
    return res.status(400).json({
      error: "SCHEMA_MISMATCH",
      message: "Notion database schema does not match required properties.",
    });
  }

  const dataSourceId = dataSources[0].id.trim();

  // 2. Retrieve data source schema and validate required properties
  const dsRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, {
    method: "GET",
    headers: notionHeaders,
  });

  if (!dsRes.ok) {
    const errorDetails = await handleNotionError(dsRes, res);
    return res.status(errorDetails.status).json({
      error: errorDetails.error,
      message: errorDetails.message,
    });
  }

  const dsData = await dsRes.json();
  const properties = dsData?.properties;

  const expectedSchema: Record<string, string> = {
    FT_ID: "rich_text",
    Name: "title",
    Date: "date",
    Category: "select",
    Status: "select",
    Completed: "checkbox",
  };

  for (const [propName, expectedType] of Object.entries(expectedSchema)) {
    const prop = properties?.[propName];
    if (!prop || prop.type !== expectedType) {
      return res.status(400).json({
        error: "SCHEMA_MISMATCH",
        message: "Notion database schema does not match required properties.",
      });
    }
  }

  // 3. Query the data source for existing shoots in this batch
  const queryFilter = {
    or: shoots.map((s) => ({
      property: "FT_ID",
      rich_text: {
        equals: s.id,
      },
    })),
  };

  const queryRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: "POST",
    headers: notionHeaders,
    body: JSON.stringify({ filter: queryFilter }),
  });

  if (!queryRes.ok) {
    const errorDetails = await handleNotionError(queryRes, res);
    return res.status(errorDetails.status).json({
      error: errorDetails.error,
      message: errorDetails.message,
    });
  }

  const queryData = await queryRes.json();
  const ftIdToPageId = new Map<string, string>();
  if (Array.isArray(queryData?.results)) {
    for (const page of queryData.results) {
      const ftIdProp = page.properties?.FT_ID;
      const ftId =
        ftIdProp?.rich_text?.[0]?.plain_text ?? ftIdProp?.rich_text?.[0]?.text?.content;
      if (ftId && typeof ftId === "string") {
        ftIdToPageId.set(ftId, page.id);
      }
    }
  }

  // 4. Sequential mutations
  let created = 0;
  let updated = 0;

  for (let i = 0; i < shoots.length; i++) {
    const shoot = shoots[i];
    const existingPageId = ftIdToPageId.get(shoot.id);

    let mutationRes: Response;
    if (existingPageId) {
      mutationRes = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
        method: "PATCH",
        headers: notionHeaders,
        body: JSON.stringify({
          properties: buildNotionProperties(shoot),
        }),
      });
    } else {
      mutationRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify({
          parent: {
            type: "data_source_id",
            data_source_id: dataSourceId,
          },
          properties: buildNotionProperties(shoot),
        }),
      });
    }

    if (!mutationRes.ok) {
      const errorDetails = await handleNotionError(mutationRes, res);
      return res.status(errorDetails.status).json({
        error: errorDetails.error,
        message: errorDetails.message,
      });
    }

    if (existingPageId) {
      updated++;
    } else {
      created++;
    }

    if (i < shoots.length - 1) {
      await sleep(MUTATION_DELAY_MS);
    }
  }

  return res.status(200).json({
    success: true,
    created,
    updated,
  });
}
