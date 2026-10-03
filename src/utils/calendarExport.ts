import { Bill, BillViewModel, Shoot } from "../types/finance";
import { parseMonthKey, normalizePaydayDays } from "./dateHelpers";

/**
 * Escapes characters that have special meaning in iCalendar text fields according to RFC 5545.
 */
export function escapeIcsText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Formats a Date object to YYYYMMDD string for iCalendar VALUE=DATE.
 */
export function formatIcsDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Helper to compute next day for non-inclusive DTEND all-day events.
 */
export function getNextDay(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Computes the exact start and end Date for a bill in a given month.
 */
export function getBillDatesForMonth(
  bill: Pick<Bill, "dueDay">,
  monthKey: string
): { startDate: Date; endDate: Date; dueDay: number } {
  const baseDate = parseMonthKey(monthKey);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const parsedDay = parseInt(bill.dueDay, 10);
  const rawDay = Number.isInteger(parsedDay) ? parsedDay : 1;
  const clampedDay = Math.min(Math.max(1, rawDay), lastDay);

  const startDate = new Date(year, month, clampedDay);
  const endDate = getNextDay(startDate);

  return { startDate, endDate, dueDay: clampedDay };
}

/**
 * Builds a single VEVENT string block for a bill in a given month.
 */
export function buildBillIcsEvent(
  bill: Bill | BillViewModel,
  monthKey: string
): string {
  const effectiveMonth =
    ("targetMonthForDue" in bill && bill.targetMonthForDue) || monthKey;
  const { startDate, endDate, dueDay } = getBillDatesForMonth(bill, effectiveMonth);

  const dtStart = formatIcsDate(startDate);
  const dtEnd = formatIcsDate(endDate);

  const amountStr = bill.amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isPaid = "paid" in bill ? bill.paid : false;

  const summary = escapeIcsText(`Bill Due: ${bill.name} (₱${amountStr})`);
  const descriptionLines = [
    `Bill: ${bill.name}`,
    `Amount: ₱${amountStr}`,
    `Type: ${bill.type}`,
    bill.wallet ? `Wallet: ${bill.wallet}` : null,
    `Month: ${effectiveMonth}`,
    `Due Day: ${dueDay}`,
    `Status: ${isPaid ? "Paid" : "Pending"}`,
    "",
    "Logged via Finance Tracker",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const description = escapeIcsText(descriptionLines);
  const uid = `bill-${bill.id}-${dtStart}@finance-tracker`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
  ].join("\n");
}

/**
 * Generates a full .ics VCALENDAR for a single bill.
 */
export function generateBillIcs(
  bill: Bill | BillViewModel,
  monthKey: string
): string {
  const event = buildBillIcsEvent(bill, monthKey);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance Tracker//EN",
    "CALSCALE:GREGORIAN",
    event,
    "END:VCALENDAR",
  ].join("\n");
}

/**
 * Generates a full .ics VCALENDAR containing all given bills for a month.
 */
export function generateMonthBillsIcs(
  bills: (Bill | BillViewModel)[],
  monthKey: string
): string {
  const events = bills.map((b) => buildBillIcsEvent(b, monthKey));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance Tracker//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\n");
}

export interface PaydayIcsOptions {
  year?: number;
  monthKey?: string;
}

/**
 * Builds VEVENT string blocks for configured paydays.
 * If monthKey is provided, generates events for that month.
 * Otherwise, generates 12 months of events for the specified year (defaults to current year).
 */
export function buildPaydayIcsEvents(
  paydayDays?: number[],
  options?: PaydayIcsOptions
): string[] {
  const validDays = normalizePaydayDays(paydayDays);
  const events: string[] = [];

  const formatOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  if (options?.monthKey) {
    const baseDate = parseMonthKey(options.monthKey);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (const day of validDays) {
      const actualDay = Math.min(day, lastDay);
      const startDate = new Date(year, month, actualDay);
      const endDate = getNextDay(startDate);
      const dtStart = formatIcsDate(startDate);
      const dtEnd = formatIcsDate(endDate);

      const summary = escapeIcsText("Payday");
      const description = escapeIcsText(
        `Payday Flow (${formatOrdinal(day)} of the month)\nMonth: ${options.monthKey}\n\nLogged via Finance Tracker`
      );
      const uid = `payday-${dtStart}@finance-tracker`;

      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTART;VALUE=DATE:${dtStart}`,
          `DTEND;VALUE=DATE:${dtEnd}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          "END:VEVENT",
        ].join("\n")
      );
    }
    return events;
  }

  const targetYear = options?.year || new Date().getFullYear();

  for (let month = 0; month < 12; month++) {
    const lastDay = new Date(targetYear, month + 1, 0).getDate();

    for (const day of validDays) {
      const actualDay = Math.min(day, lastDay);
      const startDate = new Date(targetYear, month, actualDay);
      const endDate = getNextDay(startDate);
      const dtStart = formatIcsDate(startDate);
      const dtEnd = formatIcsDate(endDate);

      const summary = escapeIcsText("Payday");
      const description = escapeIcsText(
        `Payday Schedule (${formatOrdinal(day)} of the month)\n\nLogged via Finance Tracker`
      );
      const uid = `payday-${dtStart}@finance-tracker`;

      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTART;VALUE=DATE:${dtStart}`,
          `DTEND;VALUE=DATE:${dtEnd}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          "END:VEVENT",
        ].join("\n")
      );
    }
  }

  return events;
}

/**
 * Generates a full .ics VCALENDAR for payday schedule.
 */
export function generatePaydayIcs(
  paydayDays?: number[],
  options?: PaydayIcsOptions
): string {
  const events = buildPaydayIcsEvents(paydayDays, options);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance Tracker//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\n");
}

/**
 * Parses a YYYY-MM-DD string into a valid local Date.
 * Throws an Error if the date string is missing or malformed, avoiding timezone-dependent drift.
 */
export function parseGigDate(dateStr?: string): Date {
  if (!dateStr || typeof dateStr !== "string") {
    throw new Error("Gig date is required for calendar export");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid gig date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in gig date: "${dateStr}".`);
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid calendar date in gig date: "${dateStr}".`);
  }

  return date;
}

/**
 * Builds a single VEVENT string block for a production gig.
 */
export function buildGigIcsEvent(shoot: Shoot): string {
  const startDate = parseGigDate(shoot.date);
  const endDate = getNextDay(startDate);

  const dtStart = formatIcsDate(startDate);
  const dtEnd = formatIcsDate(endDate);

  const summary = escapeIcsText(shoot.title);
  const category = shoot.category || "Other";
  const status = shoot.status || "Confirmed";

  const descriptionLines = [
    `Category: ${category}`,
    `Status: ${status}`,
    "",
    "Logged via Finance Tracker",
  ].join("\n");

  const description = escapeIcsText(descriptionLines);
  const uid = `gig-${shoot.id || "shoot"}-${dtStart}@finance-tracker`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
  ].join("\n");
}

/**
 * Generates a full .ics VCALENDAR for a single gig.
 */
export function generateGigIcs(shoot: Shoot): string {
  const event = buildGigIcsEvent(shoot);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance Tracker//EN",
    "CALSCALE:GREGORIAN",
    event,
    "END:VCALENDAR",
  ].join("\n");
}

/**
 * Triggers browser download or mobile Web Share for an ICS string.
 */
export function downloadOrShareIcs(
  fileName: string,
  icsContent: string,
  title?: string
): void {
  if (typeof window === "undefined") return;

  const safeFileName = fileName.replace(/[^a-z0-9_.-]/gi, "_").toLowerCase();

  try {
    const file = new File([icsContent], safeFileName, { type: "text/calendar;charset=utf-8" });

    if (
      typeof navigator !== "undefined" &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      navigator
        .share({
          files: [file],
          title: title || safeFileName,
        })
        .catch((err) => {
          if ((err as Error)?.name !== "AbortError") {
            console.log("Share cancelled or failed:", err);
          }
        });
      return;
    }
  } catch {
    // Fallback if File constructor or navigator.canShare fails
  }

  if (typeof document !== "undefined" && window.URL && typeof window.URL.createObjectURL === "function") {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", safeFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
  }
}

/**
 * Convenience helper to export a single bill to calendar.
 */
export function exportBillToCalendar(
  bill: Bill | BillViewModel,
  monthKey: string
): void {
  const ics = generateBillIcs(bill, monthKey);
  const fileName = `${bill.name}_due_${monthKey}.ics`;
  downloadOrShareIcs(fileName, ics, `Bill: ${bill.name}`);
}

/**
 * Convenience helper to export all bills for a month to calendar.
 */
export function exportMonthBillsToCalendar(
  bills: (Bill | BillViewModel)[],
  monthKey: string
): void {
  const ics = generateMonthBillsIcs(bills, monthKey);
  const fileName = `commitments_${monthKey}.ics`;
  downloadOrShareIcs(fileName, ics, `${monthKey} Commitments`);
}

/**
 * Convenience helper to export configured payday dates to calendar.
 */
export function exportPaydaysToCalendar(
  paydayDays?: number[],
  options?: PaydayIcsOptions
): void {
  const ics = generatePaydayIcs(paydayDays, options);
  const year =
    options?.year ||
    (options?.monthKey ? parseMonthKey(options.monthKey).getFullYear() : new Date().getFullYear());
  const fileName = options?.monthKey
    ? `payday_${options.monthKey}.ics`
    : `payday_schedule_${year}.ics`;
  downloadOrShareIcs(fileName, ics, "Payday Schedule");
}

/**
 * Convenience helper to export a single gig to calendar.
 */
export function exportGigToCalendar(shoot: Shoot): void {
  const ics = generateGigIcs(shoot);
  const fileName = `${shoot.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.ics`;
  downloadOrShareIcs(fileName, ics, shoot.title);
}
