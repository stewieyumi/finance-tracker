import type { Shoot, UnifiedFinanceData } from "../types/finance";
import { GIG_BOOKING_STATUSES, type GigCalendarGroup } from "./gigStatus.js";

export interface AppleCalendarEvent {
  uid: string;
  etag: string;
  group: GigCalendarGroup;
  gig: Shoot;
}
export interface AppleCalendarPreview {
  connectionId: string;
  events: AppleCalendarEvent[];
  missingCalendars: string[];
  skipped: number;
}
export interface AppleCalendarChange {
  before: Shoot | null;
  after: Shoot;
}

export function isCalendarGig(value: unknown): value is Shoot {
  const gig = value as Shoot | null;
  if (!gig || typeof gig.id !== "string" || !gig.id || gig.id.length > 200 ||
      typeof gig.title !== "string" || !gig.title.trim() || gig.title.length > 1000 ||
      typeof gig.completed !== "boolean" || !GIG_BOOKING_STATUSES.includes(gig.status) ||
      (gig.category !== undefined && (typeof gig.category !== "string" || gig.category.length > 200))) return false;
  if (!gig.date || !/^\d{4}-\d{2}-\d{2}$/.test(gig.date)) return false;
  const date = new Date(gig.date + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === gig.date;
}

export function sameCalendarGig(a: Shoot | null | undefined, b: Shoot | null | undefined) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.title === b.title && (a.date || "") === (b.date || "") &&
    (a.category || "Other") === (b.category || "Other") && a.status === b.status && a.completed === b.completed;
}

// Recheck the live item so a preview cannot overwrite an edit or recreate a deleted gig.
export function applyAppleCalendarChange(data: UnifiedFinanceData, change: AppleCalendarChange) {
  const matches = data.library.shoots.filter(gig => gig.id === change.after.id);
  if (matches.length > 1) return data;
  const current = matches[0] ?? null;
  if (!isCalendarGig(change.after) || !sameCalendarGig(current, change.before) ||
      sameCalendarGig(current, change.after)) return data;
  return {
    ...data,
    library: {
      ...data.library,
      shoots: current
        ? data.library.shoots.map(gig => gig.id === current.id ? { ...gig, ...change.after } : gig)
        : [...data.library.shoots, change.after],
    },
    updatedAt: Date.now(),
  };
}
