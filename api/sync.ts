import type { VercelRequest, VercelResponse } from "@vercel/node";

const JSONBIN_API_KEY = process.env.JSONBIN_MASTER_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Fail closed: If server environment variables are missing, deny immediately
  if (!APP_AUTH_SECRET || !JSONBIN_API_KEY || !JSONBIN_BIN_ID) {
    console.error("Missing required server environment variables.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  // 2. Validate client passcode via custom header or Bearer authorization
  const clientToken =
    req.headers["x-sync-passcode"] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!clientToken || clientToken !== APP_AUTH_SECRET) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing passcode." });
  }

  const jsonBinUrl = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

  try {
    // GET: Pull from JSONBin
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

    // POST: Push to JSONBin
    if (req.method === "POST") {
      const response = await fetch(jsonBinUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": JSONBIN_API_KEY,
        },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to persist remote data." });
      }

      const data = await response.json();
      return res.status(200).json({ success: true, updatedAt: Date.now(), data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("Sync handler error:", err);
    return res.status(500).json({ error: "Internal server error during sync." });
  }
}