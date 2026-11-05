import type { Shoot, ShootStatus } from "../types/finance";

export const GIG_BOOKING_STATUSES: ShootStatus[] = ["Confirmed", "Pencil", "Moved", "Cancelled"];
export const GIG_CALENDAR_GROUPS = {
  pending: { name: "FT Pending", label: "Pending", color: "#FFCC00FF", chip: "chip-amber" },
  done: { name: "FT Done", label: "Done", color: "#34C759FF", chip: "chip-emerald" },
  moved: { name: "FT Moved", label: "Moved", color: "#FF9500FF", chip: "chip-orange" },
  cancelled: { name: "FT Cancelled", label: "Cancelled", color: "#FF3B30FF", chip: "chip-rose" },
} as const;
export type GigCalendarGroup = keyof typeof GIG_CALENDAR_GROUPS;

export function getGigCalendarGroup(gig: Pick<Shoot, "status" | "completed">): GigCalendarGroup {
  if (gig.status === "Cancelled") return "cancelled";
  if (gig.completed) return "done";
  if (gig.status === "Moved") return "moved";
  return "pending";
}
