import { describe, it, expect } from "vitest";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import type { Shoot } from "../types/finance";
import { applyAppleCalendarChange, isCalendarGig, sameCalendarGig } from "./appleCalendar";
import { getGigCalendarGroup } from "./gigStatus";

const gig: Shoot = { id: "sample", title: "Sample shoot", date: "2026-11-05", status: "Pencil", completed: false };
describe("Apple Calendar status and import", () => {
  it("groups Pencil and Confirmed as pending and completion as done", () => {
    expect(getGigCalendarGroup(gig)).toBe("pending");
    expect(getGigCalendarGroup({ ...gig, status: "Confirmed" })).toBe("pending");
    expect(getGigCalendarGroup({ ...gig, status: "Moved" })).toBe("moved");
    expect(getGigCalendarGroup({ ...gig, status: "Moved", completed: true })).toBe("done");
    expect(getGigCalendarGroup({ ...gig, status: "Cancelled", completed: true })).toBe("cancelled");
  });
  it("treats an omitted category as Other so an unchanged legacy gig does not reappear after every sync", () => {
    expect(sameCalendarGig(gig, { ...gig, category: "Other" })).toBe(true);
  });
  it("validates real dates, titles, statuses, and completion types", () => {
    expect(isCalendarGig(gig)).toBe(true);
    for (const change of [{ date: "2026-02-30" }, { title: "" }, { status: "done" }, { completed: "yes" }]) {
      expect(isCalendarGig({ ...gig, ...change })).toBe(false);
    }
  });
  it("imports a gig without modifying any financial state and repeated import does nothing", () => {
    const initial = INITIAL_UNIFIED_DATA;
    const imported = applyAppleCalendarChange(initial, { before: null, after: gig });
    expect(imported.library.shoots).toContainEqual(gig);
    expect(imported.wallets).toBe(initial.wallets);
    expect(imported.logs).toBe(initial.logs);
    expect(imported.library.receivables).toBe(initial.library.receivables);
    expect(imported.library.bills).toBe(initial.library.bills);
    expect(applyAppleCalendarChange(imported, { before: null, after: gig })).toBe(imported);
  });
  it("preserves a newer app edit and does not recreate a deleted gig from a stale review", () => {
    const before = { ...INITIAL_UNIFIED_DATA, library: { ...INITIAL_UNIFIED_DATA.library, shoots: [gig] } };
    const latest = { ...before, library: { ...before.library, shoots: [{ ...gig, title: "Edited while syncing" }] } };
    expect(applyAppleCalendarChange(latest, { before: gig, after: { ...gig, completed: true } })).toBe(latest);
    expect(applyAppleCalendarChange(INITIAL_UNIFIED_DATA, { before: gig, after: gig })).toBe(INITIAL_UNIFIED_DATA);
  });
});
