import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { DAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import type { Shoot } from "../src/types/finance.js";
import { GIG_BOOKING_STATUSES, GIG_CALENDAR_GROUPS, getGigCalendarGroup, type GigCalendarGroup } from "../src/utils/gigStatus.js";
import { isCalendarGig, type AppleCalendarEvent } from "../src/utils/appleCalendar.js";
import type { AppleCredentials } from "./appleCalendarConnection.js";

export class AppleCalendarError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
type CalendarMap = Partial<Record<GigCalendarGroup, DAVCalendar>>;
interface RemoteEvent extends AppleCalendarEvent { object: DAVCalendarObject }

function appleUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^(?:p\d+-)?caldav\.icloud\.com$/.test(url.hostname) ||
      url.username || url.password || (url.port && url.port !== "443")) {
    throw new AppleCalendarError("iCloud returned an unsupported calendar address.");
  }
  return url.href;
}

// Discovery may redirect to an iCloud shard. Validate every hop before sending credentials.
export const appleFetch: typeof fetch = async (input, options) => {
  let url = appleUrl(input instanceof Request ? input.url : String(input));
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { ...options, redirect: "manual" });
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new AppleCalendarError("iCloud returned an incomplete redirect.");
      url = appleUrl(new URL(location, url).href);
      continue;
    }
    if ([401, 403].includes(response.status)) {
      throw new AppleCalendarError("Reconnect iCloud using a valid app-specific password.", 503);
    }
    if (Number(response.headers.get("content-length")) > 4 * 1024 * 1024) {
      throw new AppleCalendarError("This calendar is too large to review in one request.", 413);
    }
    return response;
  }
  throw new AppleCalendarError("iCloud redirected too many times.");
};

export async function connectAppleCalendar(signal: AbortSignal, credentials: AppleCredentials) {
  const client = new DAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials,
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetch: appleFetch,
    fetchOptions: { signal },
  });
  await client.login();
  return client;
}

export async function getAppleCalendars(client: DAVClient): Promise<CalendarMap> {
  const calendars = await client.fetchCalendars();
  const map: CalendarMap = {};
  for (const [group, definition] of Object.entries(GIG_CALENDAR_GROUPS)) {
    const matches = calendars.filter(calendar => calendar.displayName === definition.name);
    if (matches.length > 1) throw new AppleCalendarError(`More than one calendar is named ${definition.name}. Rename the duplicate before syncing.`, 409);
    if (matches[0]) {
      appleUrl(matches[0].url);
      map[group as GigCalendarGroup] = matches[0];
    }
  }
  return map;
}

export async function setupAppleCalendars(client: DAVClient) {
  const existing = await getAppleCalendars(client);
  const home = client.account?.homeUrl;
  if (!home) throw new AppleCalendarError("iCloud did not return a calendar home.");
  for (const [group, definition] of Object.entries(GIG_CALENDAR_GROUPS)) {
    if (existing[group as GigCalendarGroup]) continue;
    const result = await client.makeCalendar({
      url: appleUrl(new URL(`finance-tracker-${group}/`, home).href),
      props: {
        "d:displayname": definition.name,
        "ca:calendar-color": definition.color,
        "c:supported-calendar-component-set": { "c:comp": { _attributes: { name: "VEVENT" } } },
      },
    });
    if (!result.length || result.some(response => !response.ok)) {
      throw new AppleCalendarError("Could not finish creating the status calendars. Refresh before trying again.");
    }
  }
}

function localId(uid: string) {
  const own = /^ft-gig-(.+)@finance-tracker$/.exec(uid);
  if (own) return decodeURIComponent(own[1]);
  // Match gigs previously shared using the app's original calendar export.
  const legacy = /^gig-(.+)-\d{8}@finance-tracker$/.exec(uid);
  if (legacy) return legacy[1];
  return "apple_" + createHash("sha256").update(uid).digest("hex");
}

export function parseAppleEvent(object: DAVCalendarObject, group: GigCalendarGroup): RemoteEvent | null {
  if (typeof object.data !== "string" || object.data.length > 256000 || !object.etag) return null;
  const root = ICAL.Component.fromString(object.data);
  const events = root.getAllSubcomponents("vevent");
  if (events.length !== 1) return null;
  const event = events[0];
  if (["rrule", "rdate", "recurrence-id", "attendee", "organizer"].some(name => event.hasProperty(name))) return null;
  const uid = event.getFirstPropertyValue("uid");
  const start = event.getFirstPropertyValue("dtstart");
  if (typeof uid !== "string" || !uid || uid.length > 1000 || !(start instanceof ICAL.Time)) return null;
  const booking = event.getFirstPropertyValue("x-ft-booking-status");
  const status = group === "cancelled" ? "Cancelled" : group === "moved" ? "Moved"
    : GIG_BOOKING_STATUSES.includes(booking as Shoot["status"]) && booking !== "Cancelled" && booking !== "Moved"
      ? booking as Shoot["status"] : "Confirmed";
  const gig: Shoot = {
    id: localId(uid),
    title: String(event.getFirstPropertyValue("summary") || ""),
    date: start.toString().slice(0, 10),
    category: String(event.getFirstPropertyValue("x-ft-category") || "Other"),
    status,
    completed: group === "done",
  };
  // Done may retain Moved as a booking status after completion.
  if (group === "done" && GIG_BOOKING_STATUSES.includes(booking as Shoot["status"]) && booking !== "Cancelled") {
    gig.status = booking as Shoot["status"];
  }
  return isCalendarGig(gig) ? { uid, etag: object.etag, group, gig, object } : null;
}

export async function readAppleEvents(client: DAVClient, calendars: CalendarMap) {
  const events: RemoteEvent[] = [];
  let skipped = 0;
  let total = 0;
  for (const [group, calendar] of Object.entries(calendars)) {
    const objects = await client.fetchCalendarObjects({ calendar });
    total += objects.length;
    if (total > 500) throw new AppleCalendarError("Review is limited to 500 events across the four FT calendars.", 413);
    for (const object of objects) {
      appleUrl(object.url);
      let parsed: RemoteEvent | null = null;
      try { parsed = parseAppleEvent(object, group as GigCalendarGroup); } catch {}
      if (!parsed) { skipped++; continue; }
      if (events.some(event => event.uid === parsed.uid || event.gig.id === parsed.gig.id)) {
        throw new AppleCalendarError("Duplicate linked gigs were found in the FT calendars. Resolve those duplicates before syncing.", 409);
      }
      events.push(parsed);
    }
  }
  return { events, skipped };
}

export function writeAppleEvent(gig: Shoot, uid: string, existing?: string) {
  const root = existing ? ICAL.Component.fromString(existing) : new ICAL.Component("vcalendar");
  root.updatePropertyWithValue("version", "2.0");
  root.updatePropertyWithValue("prodid", "-//Finance Tracker//Apple Calendar//EN");
  let event = root.getFirstSubcomponent("vevent");
  if (!event) { event = new ICAL.Component("vevent"); root.addSubcomponent(event); }
  const start = event.getFirstPropertyValue("dtstart");
  const nextDate = ICAL.Time.fromDateString(gig.date!);
  if (start instanceof ICAL.Time) {
    const oldDate = Date.parse(start.toString().slice(0, 10) + "T00:00:00Z");
    const days = (Date.parse(gig.date! + "T00:00:00Z") - oldDate) / 86400000;
    for (const property of ["dtstart", "dtend"]) {
      const value = event.getFirstPropertyValue(property);
      if (value instanceof ICAL.Time) { value.adjust(days, 0, 0, 0); event.updatePropertyWithValue(property, value); }
    }
  } else {
    event.addPropertyWithValue("dtstart", nextDate);
    const end = nextDate.clone();
    end.adjust(1, 0, 0, 0);
    event.addPropertyWithValue("dtend", end);
  }
  event.updatePropertyWithValue("uid", uid);
  event.updatePropertyWithValue("summary", gig.title);
  event.updatePropertyWithValue("x-ft-category", gig.category || "Other");
  event.updatePropertyWithValue("x-ft-booking-status", gig.status);
  event.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  const sequence = Number(event.getFirstPropertyValue("sequence") || 0);
  event.updatePropertyWithValue("sequence", sequence + 1);
  return root.toString();
}

export async function pushAppleEvent(client: DAVClient, calendars: CalendarMap, gig: Shoot, expected: AppleCalendarEvent | null) {
  const target = calendars[getGigCalendarGroup(gig)];
  if (!target) throw new AppleCalendarError("Create all four status calendars before syncing.", 409);
  const { events } = await readAppleEvents(client, calendars);
  const current = events.find(event => event.gig.id === gig.id);
  if (expected ? !current || current.uid !== expected.uid || current.etag !== expected.etag || current.group !== expected.group : current) {
    throw new AppleCalendarError("This calendar event changed. Refresh the review before applying it.", 409);
  }
  const uid = current?.uid || `ft-gig-${encodeURIComponent(gig.id)}@finance-tracker`;
  const filename = createHash("sha256").update(uid).digest("hex") + ".ics";
  const data = writeAppleEvent(gig, uid, current?.object.data);
  const result = current
    ? await client.updateCalendarObject({ calendarObject: { ...current.object, data } })
    : await client.createCalendarObject({ calendar: target, filename, iCalString: data, headers: { "If-None-Match": "*" } });
  if (!result.ok) {
    throw new AppleCalendarError("The event could not be saved. Refresh the review before retrying.", result.status === 412 ? 409 : 502);
  }
  if (current && current.group !== getGigCalendarGroup(gig)) {
    // Use the ETag returned by the write. A missing ETag needs a fresh review, not an unconditional move.
    const etag = result.headers.get("etag");
    if (!etag) throw new AppleCalendarError("Event details saved, but iCloud did not confirm its version for the status move. Refresh the review.", 409);
    const destination = appleUrl(new URL(current.object.url.split("/").pop()!, target.url).href);
    const moved = await client.davRequest({
      url: current.object.url,
      init: { method: "MOVE", body: "", headers: { Destination: destination, Overwrite: "F", "If-Match": etag } },
      convertIncoming: false,
      parseOutgoing: false,
    });
    if (!moved.length || moved.some(response => !response.ok)) {
      throw new AppleCalendarError("Event details saved, but the status calendar move failed. Refresh the review before retrying.", 409);
    }
  }
}
