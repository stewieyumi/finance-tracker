import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  escapeIcsText,
  formatIcsDate,
  getNextDay,
  getBillDatesForMonth,
  buildBillIcsEvent,
  generateBillIcs,
  generateMonthBillsIcs,
  buildPaydayIcsEvents,
  generatePaydayIcs,
  downloadOrShareIcs,
  exportBillToCalendar,
  exportMonthBillsToCalendar,
  exportPaydaysToCalendar,
} from "./calendarExport";
import { Bill, BillViewModel } from "../types/finance";

describe("calendarExport utility", () => {
  describe("escapeIcsText", () => {
    it("escapes backslashes, semicolons, commas, and newlines", () => {
      const input = "Hello\\World; Test, One\nTwo";
      expect(escapeIcsText(input)).toBe("Hello\\\\World\\; Test\\, One\\nTwo");
    });

    it("returns empty string for empty input", () => {
      expect(escapeIcsText("")).toBe("");
    });
  });

  describe("formatIcsDate and getNextDay", () => {
    it("formats dates to YYYYMMDD string", () => {
      const d = new Date(2026, 8, 15); // Sep 15 2026
      expect(formatIcsDate(d)).toBe("20260915");
    });

    it("computes next day correctly across month boundary", () => {
      const d = new Date(2026, 8, 30); // Sep 30 2026
      const next = getNextDay(d);
      expect(formatIcsDate(next)).toBe("20261001");
    });

    it("computes next day correctly across year boundary", () => {
      const d = new Date(2026, 11, 31); // Dec 31 2026
      const next = getNextDay(d);
      expect(formatIcsDate(next)).toBe("20270101");
    });
  });

  describe("getBillDatesForMonth", () => {
    it("computes dates for standard dueDay", () => {
      const res = getBillDatesForMonth({ dueDay: "15" }, "September 2026");
      expect(formatIcsDate(res.startDate)).toBe("20260915");
      expect(formatIcsDate(res.endDate)).toBe("20260916");
      expect(res.dueDay).toBe(15);
    });

    it("clamps day 31 in a 30-day month", () => {
      const res = getBillDatesForMonth({ dueDay: "31" }, "September 2026");
      expect(formatIcsDate(res.startDate)).toBe("20260930");
      expect(formatIcsDate(res.endDate)).toBe("20261001");
      expect(res.dueDay).toBe(30);
    });

    it("clamps day 30 in February 2026 (28 days)", () => {
      const res = getBillDatesForMonth({ dueDay: "30" }, "February 2026");
      expect(formatIcsDate(res.startDate)).toBe("20260228");
      expect(formatIcsDate(res.endDate)).toBe("20260301");
      expect(res.dueDay).toBe(28);
    });

    it("falls back to day 1 for missing or invalid dueDay", () => {
      const res = getBillDatesForMonth({ dueDay: "" as any }, "September 2026");
      expect(formatIcsDate(res.startDate)).toBe("20260901");
      expect(formatIcsDate(res.endDate)).toBe("20260902");
      expect(res.dueDay).toBe(1);
    });
  });

  describe("buildBillIcsEvent and generateBillIcs", () => {
    const mockBill: Bill = {
      id: "bill-internet",
      name: "Fiber Internet",
      amount: 1899,
      dueDay: "10",
      type: "Bill",
      wallet: "bpi",
    };

    it("builds a single VEVENT block with proper fields", () => {
      const event = buildBillIcsEvent(mockBill, "September 2026");
      expect(event).toContain("BEGIN:VEVENT");
      expect(event).toContain("UID:bill-bill-internet-20260910@finance-tracker");
      expect(event).toContain("DTSTART;VALUE=DATE:20260910");
      expect(event).toContain("DTEND;VALUE=DATE:20260911");
      expect(event).toContain("SUMMARY:Bill Due: Fiber Internet (₱1\\,899.00)");
      expect(event).toContain("DESCRIPTION:Bill: Fiber Internet\\nAmount: ₱1\\,899.00\\nType: Bill\\nWallet: bpi\\nMonth: September 2026\\nDue Day: 10\\nStatus: Pending\\n\\nLogged via Finance Tracker");
      expect(event).toContain("END:VEVENT");
    });

    it("generates a full valid VCALENDAR string", () => {
      const ics = generateBillIcs(mockBill, "September 2026");
      expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:-//Finance Tracker//EN");
      expect(ics).toContain("CALSCALE:GREGORIAN");
      expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    });

    it("supports BillViewModel with paid status and targetMonthForDue", () => {
      const vm: BillViewModel = {
        ...mockBill,
        baseAmount: 1899,
        paid: true,
        targetMonthForDue: "August 2026",
        daysLeft: -5,
        isOverridden: false,
      };
      const event = buildBillIcsEvent(vm, "September 2026");
      expect(event).toContain("Status: Paid");
      expect(event).toContain("Month: August 2026");
      expect(event).toContain("DTSTART;VALUE=DATE:20260810");
    });
  });

  describe("generateMonthBillsIcs", () => {
    it("generates multiple VEVENT blocks for a month", () => {
      const bills: Bill[] = [
        { id: "b1", name: "Rent", amount: 15000, dueDay: "5", type: "Bill" },
        { id: "b2", name: "Electricity", amount: 3500, dueDay: "20", type: "Bill" },
      ];
      const ics = generateMonthBillsIcs(bills, "September 2026");
      expect(ics).toContain("UID:bill-b1-20260905@finance-tracker");
      expect(ics).toContain("UID:bill-b2-20260920@finance-tracker");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260905");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260920");
    });

    it("handles an empty bills array", () => {
      const ics = generateMonthBillsIcs([], "September 2026");
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).not.toContain("BEGIN:VEVENT");
    });
  });

  describe("buildPaydayIcsEvents and generatePaydayIcs", () => {
    it("generates 24 events for [15, 30] over 12 months in a specified year", () => {
      const events = buildPaydayIcsEvents([15, 30], { year: 2026 });
      expect(events).toHaveLength(24);

      // Check January
      expect(events[0]).toContain("DTSTART;VALUE=DATE:20260115");
      expect(events[1]).toContain("DTSTART;VALUE=DATE:20260130");

      // Check February (clamped to 28 in 2026)
      expect(events[2]).toContain("DTSTART;VALUE=DATE:20260215");
      expect(events[3]).toContain("DTSTART;VALUE=DATE:20260228");
      expect(events[3]).toContain("DTEND;VALUE=DATE:20260301");
    });

    it("generates paydays for a single month when monthKey is supplied", () => {
      const events = buildPaydayIcsEvents([15, 30], { monthKey: "September 2026" });
      expect(events).toHaveLength(2);
      expect(events[0]).toContain("DTSTART;VALUE=DATE:20260915");
      expect(events[1]).toContain("DTSTART;VALUE=DATE:20260930");
      expect(events[0]).toContain("Month: September 2026");
    });

    it("uses default [15, 30] when paydayDays is undefined or empty", () => {
      const events = buildPaydayIcsEvents(undefined, { monthKey: "September 2026" });
      expect(events).toHaveLength(2);
    });

    it("generates a full valid VCALENDAR for payday schedule", () => {
      const ics = generatePaydayIcs([15, 30], { monthKey: "September 2026" });
      expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    });
  });

  describe("downloadOrShareIcs and export helpers", () => {
    let originalShare: any;
    let originalCanShare: any;
    let originalCreateObjectURL: any;
    let originalRevokeObjectURL: any;

    beforeEach(() => {
      originalShare = (navigator as any).share;
      originalCanShare = (navigator as any).canShare;
      originalCreateObjectURL = window.URL.createObjectURL;
      originalRevokeObjectURL = window.URL.revokeObjectURL;
    });

    afterEach(() => {
      (navigator as any).share = originalShare;
      (navigator as any).canShare = originalCanShare;
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it("uses navigator.share when supported", () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      (navigator as any).share = mockShare;
      (navigator as any).canShare = vi.fn().mockReturnValue(true);

      downloadOrShareIcs("test.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR", "Test Calendar");

      expect(mockShare).toHaveBeenCalledTimes(1);
      const callArg = mockShare.mock.calls[0][0];
      expect(callArg.title).toBe("Test Calendar");
      expect(callArg.files).toHaveLength(1);
    });

    it("falls back to DOM anchor download when navigator.share is unavailable", () => {
      (navigator as any).share = undefined;
      (navigator as any).canShare = undefined;

      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      downloadOrShareIcs("my_bills.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR");

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("exportBillToCalendar generates ics and triggers export", () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      (navigator as any).share = mockShare;
      (navigator as any).canShare = vi.fn().mockReturnValue(true);

      exportBillToCalendar(
        { id: "b1", name: "Water", amount: 500, dueDay: "12", type: "Bill" },
        "September 2026"
      );

      expect(mockShare).toHaveBeenCalledTimes(1);
      expect(mockShare.mock.calls[0][0].title).toBe("Bill: Water");
    });

    it("exportMonthBillsToCalendar exports all bills", () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      (navigator as any).share = mockShare;
      (navigator as any).canShare = vi.fn().mockReturnValue(true);

      exportMonthBillsToCalendar(
        [{ id: "b1", name: "Water", amount: 500, dueDay: "12", type: "Bill" }],
        "September 2026"
      );

      expect(mockShare).toHaveBeenCalledTimes(1);
      expect(mockShare.mock.calls[0][0].title).toBe("September 2026 Commitments");
    });

    it("exportPaydaysToCalendar exports payday schedule", () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      (navigator as any).share = mockShare;
      (navigator as any).canShare = vi.fn().mockReturnValue(true);

      exportPaydaysToCalendar([15, 30], { year: 2026 });

      expect(mockShare).toHaveBeenCalledTimes(1);
      expect(mockShare.mock.calls[0][0].title).toBe("Payday Schedule");
    });
  });
});
