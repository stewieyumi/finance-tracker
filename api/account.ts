import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { readFinanceSession, revokeFinanceSession } from "../server/financeSession.js";
import { accountEpochKey, DELETE_ACCOUNT } from "../server/accountLifecycle.js";
import { calendarUserKey } from "../server/appleCalendarConnection.js";
import type { VercelApiRequest, VercelApiResponse } from "./notion.js";

export const config = { api: { bodyParser: { sizeLimit: "1kb" } } };
export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed." });
  const site = req.headers["sec-fetch-site"];
  if (req.headers["x-finance-auth"] !== "1" || (site && site !== "same-origin")) return res.status(403).json({ error: "Open account settings in Finance Tracker." });
  try {
    const profile = await readFinanceSession(req);
    if (!profile) return res.status(401).json({ error: "Reconnect your Finance Tracker account before deleting it." });
    let body: unknown = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid request." }); } }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["confirmation", "expectedSub"].includes(key)) ||
        (body as any).confirmation !== "DELETE" || (body as any).expectedSub !== profile.sub) {
      return res.status(400).json({ error: "Confirm deletion for the account currently signed in." });
    }
    const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return res.status(503).json({ error: "Account deletion is temporarily unavailable." });
    const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
    const userKey = calendarUserKey(profile.sub);
    const result = await redis.eval(DELETE_ACCOUNT, [
      `finance_data_g_${profile.sub}`, accountEpochKey(profile.sub), `ft_apple_connection_v1:${userKey}`,
      `ft_apple_calendar_lock:${userKey}`, `ft_shortcut_owner_v1:${profile.sub}`,
    ], [profile.accountEpoch ?? "", `v1_${randomBytes(16).toString("hex")}`]);
    if (result === "changed") return res.status(409).json({ error: "This account changed. Reconnect before continuing." });
    if (result === "calendar_busy") return res.status(409).json({ error: "A calendar action is running. Let it finish, then try again." });
    if (result !== "deleted") throw new Error("Deletion not acknowledged.");
    // The epoch revokes every old session even if this best-effort row cleanup fails.
    // Do not clear the cookie here: another tab may have signed into a different account.
    try { await revokeFinanceSession(req); } catch { /* Remaining session rows expire automatically. */ }
    return res.status(200).json({ deleted: true, sub: profile.sub });
  } catch {
    return res.status(503).json({ error: "Deletion could not be confirmed. Reconnect to check your account before trying again." });
  }
}
