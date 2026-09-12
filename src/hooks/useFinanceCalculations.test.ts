import { describe, it, expect } from "vitest";
import { UnifiedFinanceData } from "../types/finance";
import { parseMonthKey } from "../utils/dateHelpers";

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
});