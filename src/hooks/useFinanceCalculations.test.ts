import { describe, it, expect } from "vitest";
import { UnifiedFinanceData } from "../types/finance";
import {
  parseMonthKey,
  normalizePaydayDays,
  getPaydayDatesInRange,
  countPaydaysUntil
} from "../utils/dateHelpers";

describe("Finance Calculations", () => {
  const baseData: UnifiedFinanceData = {
    wallets: {
      maribank: 0,
      gcash: 0,
      maya: 0,
      gotyme: 0,
      bpi: 0,
      cash: 0,
    },
    library: {
      bills: [],
      receivables: [],
      shoots: [],
    },
    logs: {},
  };

  it("parses a selected month correctly", () => {
    const selectedMonth = "September 2026";
    const result = parseMonthKey(selectedMonth);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
  });

  it("recognizes an active bill inside its date range", () => {
    const start = parseMonthKey("August 2026");
    const selected = parseMonthKey("September 2026");
    const end = parseMonthKey("December 2026");

    expect(selected >= start).toBe(true);
    expect(selected <= end).toBe(true);
  });

  it("recognizes a loan as outside its date range after the end month", () => {
    const selected = parseMonthKey("January 2027");
    const end = parseMonthKey("December 2026");

    expect(selected > end).toBe(true);
  });

  it("uses a month override when one exists", () => {
    const data = {
      ...baseData,
      logs: {
        "September 2026": {
          billOverrides: {
            b1: 699,
          },
        },
      },
    };

    const override =
      data.logs["September 2026"].billOverrides?.["b1"];

    expect(override).toBe(699);
  });

  it("falls back to the original bill amount without an override", () => {
    const billAmount = 599;

    const override: number | undefined = undefined;

    const effectiveAmount =
      override !== undefined ? override : billAmount;

    expect(effectiveAmount).toBe(599);
  });

  it("detects a paid bill from the monthly log", () => {
    const data = {
      ...baseData,
      logs: {
        "September 2026": {
          billsPaid: ["b1"],
        },
      },
    };

    expect(
      data.logs["September 2026"].billsPaid?.includes("b1")
    ).toBe(true);
  });

  it("detects an uncollected receivable when no collection log exists", () => {
    const collected =
      baseData.logs["September 2026"]?.recsCollected?.["r1"]?.collected;

    expect(collected).not.toBe(true);
  });

  it("normalizes custom payday days by removing invalid values, duplicates, and sorting", () => {
    expect(normalizePaydayDays([30, 5, 20, 20, 0, 32, 15])).toEqual([5, 15, 20, 30]);
  });

  it("falls back to the default 15th and 30th when payday settings are empty or invalid", () => {
    expect(normalizePaydayDays([])).toEqual([15, 30]);
    expect(normalizePaydayDays([0, 32, -4])).toEqual([15, 30]);
  });

  it("counts a custom 5th and 20th payday schedule correctly", () => {
    const today = new Date(2026, 8, 1);
    const dueDate = new Date(2026, 8, 30);

    expect(countPaydaysUntil(today, dueDate, [5, 20])).toBe(2);
  });

  it("counts a custom 10th and 25th payday schedule correctly", () => {
    const today = new Date(2026, 8, 1);
    const dueDate = new Date(2026, 8, 30);

    expect(countPaydaysUntil(today, dueDate, [10, 25])).toBe(2);
  });

  it("clamps payday day 31 to the last day of February", () => {
    const today = new Date(2026, 1, 1);
    const dueDate = new Date(2026, 1, 28);

    const dates = getPaydayDatesInRange(today, dueDate, [31]);

    expect(dates).toHaveLength(1);
    expect(dates[0].getFullYear()).toBe(2026);
    expect(dates[0].getMonth()).toBe(1);
    expect(dates[0].getDate()).toBe(28);
  });

  it("does not count payday dates before today", () => {
    const today = new Date(2026, 8, 18);
    const dueDate = new Date(2026, 8, 30);

    expect(countPaydaysUntil(today, dueDate, [5, 20])).toBe(1);
  });

  it("does not return payday dates after the due date", () => {
    const today = new Date(2026, 8, 1);
    const dueDate = new Date(2026, 8, 19);

    expect(countPaydaysUntil(today, dueDate, [5, 20])).toBe(1);
  });

});