import type { VercelRequest, VercelResponse } from '@vercel/node';

const BIN_ID = process.env.JSONBIN_BIN_ID || "6a967958da38895dfe299d7f";
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const AUTH_SECRET = process.env.APP_AUTH_SECRET || "ft_secure_token_2026_prod";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGIN === '*' || (origin && origin === ALLOWED_ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-auth');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientToken = req.headers['x-app-auth'];
  if (!clientToken || clientToken !== AUTH_SECRET) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing x-app-auth header." });
  }

  if (!MASTER_KEY) {
    return res.status(500).json({ error: "Server missing JSONBIN_MASTER_KEY environment variable." });
  }

  try {
    if (req.method === 'GET') {
      const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
        headers: { "X-Master-Key": MASTER_KEY }
      });
      if (!response.ok) throw new Error(`JSONBin returned ${response.status}`);
      const data = await response.json();
      return res.status(200).json(data.record || data);
    } 
    
    if (req.method === 'PUT') {
      const payload = {
        ...req.body,
        updatedAt: Date.now()
      };
      const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": MASTER_KEY
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`JSONBin returned ${response.status}`);
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal server sync error" });
  }
}
