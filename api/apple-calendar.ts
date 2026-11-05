import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { OAuth2Client } from "google-auth-library";
import { readFinanceSession, usesFinanceSession } from "../server/financeSession.js";
import { AppleCalendarError, connectAppleCalendar, getAppleCalendars, pushAppleEvent, readAppleEvents, setupAppleCalendars } from "../server/appleCalendar.js";
import { GIG_CALENDAR_GROUPS } from "../src/utils/gigStatus.js";
import { isCalendarGig, type AppleCalendarEvent } from "../src/utils/appleCalendar.js";
import type { VercelApiRequest, VercelApiResponse } from "./notion.js";

const google = new OAuth2Client();
export const maxDuration = 60;

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") {
    return res.status(403).json({ error: "Open Calendar sync from Finance Tracker." });
  }

  try {
    const allowedEmail = process.env.ALLOWED_GOOGLE_EMAIL?.trim().toLowerCase();
    if (!allowedEmail) throw new AppleCalendarError("Calendar sync owner has not been configured.", 503);
    let email: string | undefined;
    if (usesFinanceSession(req)) {
      const profile = await readFinanceSession(req);
      if (!profile) return res.status(401).json({ error: "Please reconnect your Finance Tracker account." });
      email = profile.email;
    } else {
      const authorization = req.headers.authorization;
      const credential = typeof authorization === "string" ? authorization.replace(/^Bearer\s+/i, "") : "";
      if (!credential || credential.length > 8192) return res.status(401).json({ error: "Please sign in to Finance Tracker." });
      const audience = process.env.VITE_GOOGLE_CLIENT_ID;
      if (!audience) throw new AppleCalendarError("Finance Tracker sign-in has not been configured.", 503);
      const payload = await google.verifyIdToken({ idToken: credential, audience })
        .then(ticket => ticket.getPayload()).catch(() => undefined);
      if (!payload?.sub || !payload.email_verified) return res.status(401).json({ error: "Please reconnect your Finance Tracker account." });
      email = payload.email;
    }
    if (email?.trim().toLowerCase() !== allowedEmail) {
      return res.status(403).json({ error: "Apple Calendar sync is available to the configured owner." });
    }
    if (!process.env.ICLOUD_APPLE_ID || !process.env.ICLOUD_APP_PASSWORD) {
      return res.status(503).json({
        error: "Connect iCloud first. Add ICLOUD_APPLE_ID and ICLOUD_APP_PASSWORD to the server environment using an Apple app-specific password.",
        setupRequired: true,
      });
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || !["preview", "setup", "push", "pull"].includes(body.action)) {
      return res.status(400).json({ error: "Choose a Calendar sync action." });
    }
    if (body.action === "push" && !isCalendarGig(body.gig)) {
      return res.status(400).json({ error: "Set a valid title, date, booking status, and completion state before syncing." });
    }
    const expected = body.expected as AppleCalendarEvent | null;
    if (["push", "pull"].includes(body.action) && (expected !== null && (
      !expected || typeof expected.uid !== "string" || !expected.uid || expected.uid.length > 1000 ||
      typeof expected.etag !== "string" || !expected.etag || expected.etag.length > 1000 ||
      !Object.hasOwn(GIG_CALENDAR_GROUPS, expected.group) || !isCalendarGig(expected.gig)
    ))) return res.status(400).json({ error: "Refresh the Calendar review before applying changes." });
    if (body.action === "pull" && !expected) return res.status(400).json({ error: "Choose a calendar event." });
    if (body.action === "push" && expected && expected.gig.id !== body.gig.id) {
      return res.status(400).json({ error: "The selected gig does not match this calendar event." });
    }

    const client = await connectAppleCalendar(AbortSignal.timeout(40000));
    const calendars = await getAppleCalendars(client);
    if (body.action === "preview") {
      const { events, skipped } = await readAppleEvents(client, calendars);
      return res.status(200).json({
        events: events.map(({ object: _object, ...event }) => event),
        skipped,
        missingCalendars: Object.entries(GIG_CALENDAR_GROUPS)
          .filter(([group]) => !calendars[group as keyof typeof calendars]).map(([, definition]) => definition.name),
      });
    }
    if (body.action === "pull") {
      const { events } = await readAppleEvents(client, calendars);
      const current = events.find(event => event.uid === expected!.uid);
      if (!current || current.etag !== expected!.etag || current.group !== expected!.group) {
        throw new AppleCalendarError("The calendar event changed. Refresh the review before importing it.", 409);
      }
      return res.status(200).json({ gig: current.gig });
    }

    // Serialize app-initiated moves and writes. Each individual remote write also uses an ETag.
    const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      throw new AppleCalendarError("The server sync store must be configured before Calendar writes.", 503);
    }
    const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
    const lockKey = "ft_apple_calendar_lock:" + allowedEmail;
    const lockToken = randomBytes(16).toString("hex");
    if (!await redis.set(lockKey, lockToken, { nx: true, ex: 60 })) {
      throw new AppleCalendarError("Another Calendar sync is running. Refresh in a moment.", 409);
    }
    try {
      if (body.action === "setup") {
        await setupAppleCalendars(client);
      } else {
        await pushAppleEvent(client, calendars, body.gig, expected);
      }
      return res.status(200).json({ success: true });
    } finally {
      await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [lockKey], [lockToken]).catch(() => {});
    }
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid Calendar request." });
    return res.status(error instanceof AppleCalendarError ? error.status : 503)
      .json({ error: error instanceof AppleCalendarError ? error.message : "iCloud sync is unavailable. Refresh the review and try again." });
  }
}
