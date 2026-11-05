import { describe, expect, it } from "vitest";
import { compareTransactionsNewestFirst, formatTransactionDateTime, transactionDay, transactionTimestamp } from "./transactionDates";

describe("transaction dates and logging times", () => {
  it("sorts by transaction day then actual time, with deterministic fallback for legacy records", () => {
    const records = [
      { id: "z-legacy", date: "2026-11-06" },
      { id: "a-evening", date: "2026-11-06", loggedAt: "2026-11-06T20:00:00+08:00" },
      { id: "z-morning", date: "2026-11-06", loggedAt: "2026-11-06T11:00:00+08:00" },
      { id: "backdated", date: "2026-11-05", loggedAt: "2026-11-07T22:00:00Z" },
      { id: "a-legacy", date: "2026-11-06" },
      { id: "tomorrow", date: "2026-11-07" },
    ];
    expect([...records].sort(compareTransactionsNewestFirst).map(t => t.id)).toEqual(["tomorrow", "a-evening", "z-morning", "z-legacy", "a-legacy", "backdated"]);
    expect(records[0].id).toBe("z-legacy");
  });

  it("compares equivalent timestamps across offsets and mixed ISO/date-only entries", () => {
    const a = { id: "a", date: "2026-11-06T01:00:00Z" };
    const b = { id: "b", date: transactionDay(a.date), loggedAt: "2026-11-06T09:00:00+08:00" };
    expect(compareTransactionsNewestFirst(a, b)).toBeGreaterThan(0); // same instant; ID tie-break
    const later = { id: "earlier-id", date: transactionDay(a.date), createdAt: Date.parse(a.date) + 60000 };
    expect(compareTransactionsNewestFirst(later, a)).toBeLessThan(0);
  });

  it("uses local calendar days across UTC midnight and keeps date-only values unchanged", () => {
    const instant = new Date(2026, 10, 6, 0, 30);
    expect(transactionDay(instant.toISOString())).toBe("2026-11-06");
    expect(transactionDay("2026-11-06")).toBe("2026-11-06");
    expect(transactionDay("2026-02-30")).toBe("");
  });

  it("shows known local time and labels separately when logged on a different date", () => {
    const logged = new Date(2026, 10, 6, 15, 45);
    expect(formatTransactionDateTime("2026-11-06", logged.toISOString())).toBe("Nov 6, 2026 · 3:45 PM");
    expect(formatTransactionDateTime("2026-10-01", logged.getTime())).toBe("Oct 1, 2026 · Logged Nov 6, 2026, 3:45 PM");
    expect(formatTransactionDateTime(logged.toISOString())).toBe("Nov 6, 2026 · 3:45 PM");
  });

  it("does not invent a time for date-only or invalid legacy metadata", () => {
    expect(formatTransactionDateTime("2026-11-06")).toBe("Nov 6, 2026");
    expect(formatTransactionDateTime("2026-11-06", "invalid")).toBe("Nov 6, 2026");
    expect(formatTransactionDateTime("not-a-date")).toBe("not-a-date");
    expect(transactionTimestamp("2026-11-06")).toBeUndefined();
    expect(transactionTimestamp(Infinity)).toBeUndefined();
  });
});
