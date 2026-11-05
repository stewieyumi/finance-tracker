import { afterEach, describe, expect, it, vi } from "vitest";
import ICAL from "ical.js";
import { appleFetch, getAppleCalendars, parseAppleEvent, pushAppleEvent, setupAppleCalendars, writeAppleEvent } from "./appleCalendar";
import type { Shoot } from "../src/types/finance";
import { GIG_CALENDAR_GROUPS } from "../src/utils/gigStatus";
import type { DAVClient } from "tsdav";

const gig: Shoot = { id: "sample", title: "Sample, shoot", date: "2026-11-05", category: "Solo Shoot", status: "Pencil", completed: false };
const uid = "ft-gig-sample@finance-tracker";
const pending = { url: "https://p01-caldav.icloud.com/1/calendars/pending/", displayName: "FT Pending" };
const done = { url: "https://p01-caldav.icloud.com/1/calendars/done/", displayName: "FT Done" };
const object = () => ({ data: writeAppleEvent(gig, uid), etag: '"old"', url: pending.url + "sample.ics" });
afterEach(() => vi.unstubAllGlobals());

describe("iCloud event adapter", () => {
  it("roundtrips app IDs, booking status, categories and completion through the group", () => {
    const parsed = parseAppleEvent(object(), "pending")!;
    expect(parsed.gig).toEqual(gig);
    expect(parseAppleEvent(object(), "done")!.gig.completed).toBe(true);
    expect(parseAppleEvent(object(), "cancelled")!.gig).toMatchObject({ status: "Cancelled", completed: false });
    expect(parseAppleEvent(object(), "moved")!.gig.status).toBe("Moved");
  });
  it("preserves a timed appointment's time, duration, timezone and notes when moving its date", () => {
    const source = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:native",
      "DTSTART;TZID=Asia/Manila:20261105T093000", "DTEND;TZID=Asia/Manila:20261105T113000",
      "DESCRIPTION:Keep these notes", "SUMMARY:Sample", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const written = writeAppleEvent({ ...gig, date: "2026-11-07" }, "native", source);
    expect(written).toContain("DTSTART;TZID=Asia/Manila:20261107T093000");
    expect(written).toContain("DTEND;TZID=Asia/Manila:20261107T113000");
    expect(written).toContain("DESCRIPTION:Keep these notes");
    expect(ICAL.Component.fromString(written).getFirstSubcomponent("vevent")!.getFirstPropertyValue("summary")).toBe(gig.title);
  });
  it("skips recurring events and invitations", () => {
    for (const property of ["RRULE:FREQ=WEEKLY", "ATTENDEE:mailto:sample@example.test"]) {
      expect(parseAppleEvent({ ...object(), data: object().data.replace("END:VEVENT", property + "\r\nEND:VEVENT") }, "pending")).toBeNull();
    }
  });
  it("rejects duplicate reserved calendar names before selecting a destination", async () => {
    const client = { fetchCalendars: vi.fn().mockResolvedValue([pending, { ...pending, url: done.url }]) } as unknown as DAVClient;
    await expect(getAppleCalendars(client)).rejects.toMatchObject({ status: 409 });
  });
  it("creates only missing calendars with the requested colors", async () => {
    const makeCalendar = vi.fn().mockResolvedValue([{ ok: true }]);
    const client = {
      account: { homeUrl: "https://p01-caldav.icloud.com/1/calendars/" },
      fetchCalendars: vi.fn().mockResolvedValue([pending]), makeCalendar,
    } as unknown as DAVClient;
    await setupAppleCalendars(client);
    expect(makeCalendar).toHaveBeenCalledTimes(3);
    expect(makeCalendar).toHaveBeenCalledWith(expect.objectContaining({
      props: expect.objectContaining({ "d:displayname": "FT Done", "ca:calendar-color": GIG_CALENDAR_GROUPS.done.color }),
    }));
  });
  it("rejects an ETag changed after preview before any writes", async () => {
    const original = object();
    const expected = parseAppleEvent(original, "pending")!;
    const updateCalendarObject = vi.fn();
    const client = {
      fetchCalendarObjects: vi.fn().mockImplementation(async ({ calendar }) => calendar.url === pending.url ? [{ ...original, etag: '"edited"' }] : []),
      updateCalendarObject,
    } as unknown as DAVClient;
    await expect(pushAppleEvent(client, { pending, done }, { ...gig, completed: true }, expected))
      .rejects.toThrow("This calendar event changed");
    expect(updateCalendarObject).not.toHaveBeenCalled();
  });
  it("updates conditionally then moves to Done with the new ETag and overwrite disabled", async () => {
    const original = object();
    const expected = parseAppleEvent(original, "pending")!;
    const updateCalendarObject = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { etag: '"new"' } }));
    const davRequest = vi.fn().mockResolvedValue([{ ok: true }]);
    const client = {
      fetchCalendarObjects: vi.fn().mockImplementation(({ calendar }) => Promise.resolve(calendar.url === pending.url ? [original] : [])),
      updateCalendarObject, davRequest,
    } as unknown as DAVClient;
    await pushAppleEvent(client, { pending, done }, { ...gig, completed: true }, expected);
    expect(updateCalendarObject).toHaveBeenCalledWith(expect.objectContaining({ calendarObject: expect.objectContaining({ etag: '"old"' }) }));
    expect(davRequest).toHaveBeenCalledWith(expect.objectContaining({
      init: expect.objectContaining({ method: "MOVE", headers: { Destination: done.url + "sample.ics", Overwrite: "F", "If-Match": '"new"' } }),
    }));
  });
  it("reports a partial update if iCloud does not provide the new ETag and never moves unconditionally", async () => {
    const original = object();
    const davRequest = vi.fn();
    const client = {
      fetchCalendarObjects: vi.fn().mockImplementation(async ({ calendar }) => calendar.url === pending.url ? [original] : []),
      updateCalendarObject: vi.fn().mockResolvedValue(new Response(null, { status: 204 })), davRequest,
    } as unknown as DAVClient;
    await expect(pushAppleEvent(client, { pending, done }, { ...gig, completed: true }, parseAppleEvent(original, "pending")!))
      .rejects.toThrow("Event details saved");
    expect(davRequest).not.toHaveBeenCalled();
  });
  it("prevents an existing event being duplicated on a retried create", async () => {
    const createCalendarObject = vi.fn();
    const client = { fetchCalendarObjects: vi.fn().mockResolvedValue([object()]), createCalendarObject } as unknown as DAVClient;
    await expect(pushAppleEvent(client, { pending }, gig, null)).rejects.toMatchObject({ status: 409 });
    expect(createCalendarObject).not.toHaveBeenCalled();
  });
  it("stops redirects before sending an authenticated request outside Apple", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.test/calendar" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(appleFetch("https://caldav.icloud.com/", { headers: { Authorization: "Basic fake" } })).rejects.toThrow("unsupported calendar address");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
