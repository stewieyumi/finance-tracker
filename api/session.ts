import { OAuth2Client } from "google-auth-library";
import { createFinanceSession, revokeFinanceSession, sessionCookie } from "../server/financeSession.js";
import type { VercelApiRequest, VercelApiResponse } from "./notion.js";

const google = new OAuth2Client();

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  // The browser's same-origin JSON request sets this header. Cross-origin
  // pages cannot set it without a preflight, which this endpoint rejects.
  const fetchSite = req.headers["sec-fetch-site"];
  if (req.headers["x-finance-auth"] !== "1" || (fetchSite && fetchSite !== "same-origin")) {
    return res.status(403).json({ error: "Request origin not allowed." });
  }

  if (req.body?.action === "logout") {
    try {
      if (await revokeFinanceSession(req) === false) {
        return res.status(409).json({ error: "The account changed in another tab." });
      }
      res.setHeader("Set-Cookie", sessionCookie("", 0));
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: "Unable to end the session. Please try again." });
    }
  }

  const audience = process.env.VITE_GOOGLE_CLIENT_ID;
  if (!audience) return res.status(503).json({ error: "Sign-in is unavailable." });

  const { credential, expectedSub } = req.body ?? {};
  if (typeof credential !== "string" || !credential || credential.length > 8192 ||
      (expectedSub !== undefined && typeof expectedSub !== "string")) {
    return res.status(400).json({ error: "Invalid sign-in request." });
  }

  const payload = await google.verifyIdToken({ idToken: credential, audience })
    .then(ticket => ticket.getPayload())
    .catch(() => undefined);
  if (!payload?.sub) return res.status(401).json({ error: "Google could not verify this sign-in." });
  if (expectedSub !== undefined && payload.sub !== expectedSub) {
    return res.status(409).json({ error: "Reconnect with the Google account already open in Finance Tracker." });
  }

  const profile = {
    sub: payload.sub,
    name: payload.name,
    email: payload.email_verified ? payload.email : undefined,
    picture: payload.picture,
  };

  try {
    const { binding, cookie } = await createFinanceSession(profile);
    res.setHeader("Set-Cookie", cookie);
    return res.status(200).json({ profile, binding });
  } catch {
    return res.status(503).json({ error: "Unable to start a session. Please try again." });
  }
}
