import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFinanceCalculations } from "./useFinanceCalculations";
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

  it("carries only unpaid installments beyond the loan end month", () => {
    const loan = {
      id: "loan", name: "Installment", amount: 500, dueDay: "15",
      type: "Loan / Installment" as const, startMonth: "August 2026", endMonth: "September 2026",
    };
    const data = {
      ...baseData,
      library: { ...baseData.library, bills: [loan] },
      logs: { "August 2026": { billsPaid: [loan.id] } },
    };
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: UnifiedFinanceData }) => useFinanceCalculations(snapshot, "October 2026"),
      { initialProps: { snapshot: data as UnifiedFinanceData } }
    );
    expect(result.current.activeBills).toEqual([
      expect.objectContaining({ id: loan.id, paid: false, targetMonthForDue: "September 2026" }),
    ]);
    expect(result.current.totalUnpaidCommitments).toBe(500);
    rerender({ snapshot: {
      ...data,
      logs: { ...data.logs, "September 2026": { billsPaid: [loan.id] } },
    } });
    expect(result.current.activeBills).toEqual([]);
    expect(result.current.totalUnpaidCommitments).toBe(0);
  });

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


  const makePaydayTestData = (billId: string, contribution = 0) => {
    const today = new Date();
    const currentMonth = `${today.toLocaleString("en-US", { month: "long" })} ${today.getFullYear()}`;
    const data: UnifiedFinanceData = {
      ...baseData,
      library: {
        ...baseData.library,
        bills: [{
          id: billId,
          name: "Test Bill",
          amount: 1000,
          dueDay: String(Math.min(today.getDate() + 7, 28)),
          type: "Utility",
          startMonth: currentMonth,
          wallet: "maya",
        } as any],
      },
      logs: contribution
        ? { [currentMonth]: { billPaydayContributions: { [billId]: contribution } } }
        : {},
      settings: {
        paydayDays: [15, 30],
        defaultWallet: "maya",
        perPayoutSalary: 5000,
      } as any,
    };

    return { data, currentMonth };
  };

  it("creates a payday allocation for an unpaid bill and routes it to the bill wallet", () => {
    const { data, currentMonth } = makePaydayTestData("bill-1");

    const { result } = renderHook(() =>
      useFinanceCalculations(data, currentMonth)
    );

    expect(result.current.billPaydayAllocations).toHaveLength(1);
    expect(result.current.billPaydayAllocations[0]).toMatchObject({
      id: "bill-1",
      month: currentMonth,
      wallet: "maya",
    });
    expect(result.current.billPaydayAllocations[0].amount).toBeGreaterThan(0);
  });

  it("reduces a bill payday allocation by an existing contribution", () => {
    const { data, currentMonth } = makePaydayTestData("bill-2", 500);

    const { result } = renderHook(() =>
      useFinanceCalculations(data, currentMonth)
    );

    expect(result.current.billPaydayAllocations).toHaveLength(1);
    expect(result.current.billPaydayAllocations[0].amount).toBeLessThan(1000);
  });


  it("counts actual paid loan installments even when an earlier installment was skipped", () => {
    const loanData: UnifiedFinanceData = {
      ...baseData,
      library: {
        ...baseData.library,
        bills: [
          {
            id: "loan-1",
            name: "Test Loan",
            amount: 1000,
            dueDay: "15",
            type: "Loan / Installment",
            wallet: "maya",
            startMonth: "August 2026",
            endMonth: "October 2026",
          },
        ],
      },
      logs: {
        "August 2026": {
          billsPaid: ["loan-1"],
        },
        "September 2026": {
          billsPaid: [],
        },
        "October 2026": {
          billsPaid: ["loan-1"],
          billOverrides: {
            "loan-1": 750,
          },
        },
      },
    };

    const { result } = renderHook(() =>
      useFinanceCalculations(loanData, "October 2026")
    );

    const loan = result.current.activeBills.find(
      bill => bill.id === "loan-1"
    );

    expect(loan).toBeDefined();
    expect(loan?.paidLoanInstallments).toBe(2);
    expect(loan?.totalLoanPaid).toBe(1750);
  });

  it("counts all recorded installments when a loan is fully paid", () => {
    const loanData: UnifiedFinanceData = {
      ...baseData,
      library: {
        ...baseData.library,
        bills: [
          {
            id: "loan-2",
            name: "Completed Loan",
            amount: 1000,
            dueDay: "15",
            type: "Loan / Installment",
            wallet: "maya",
            startMonth: "August 2026",
            endMonth: "October 2026",
          },
        ],
      },
      logs: {
        "August 2026": {
          billsPaid: ["loan-2"],
        },
        "September 2026": {
          billsPaid: ["loan-2"],
        },
        "October 2026": {
          billsPaid: ["loan-2"],
        },
      },
    };

    const { result } = renderHook(() =>
      useFinanceCalculations(loanData, "October 2026")
    );

    const loan = result.current.activeBills.find(
      bill => bill.id === "loan-2"
    );

    expect(loan).toBeDefined();
    expect(loan?.paidLoanInstallments).toBe(3);
    expect(loan?.totalLoanPaid).toBe(3000);
  });

  describe("By Date inflow lifecycle and recurrence prevention", () => {
    it("excludes future scheduled By Date inflows from prior months", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-future",
              name: "Future Project",
              amount: 5000,
              frequency: "By Date",
              date: "2026-10-15",
              wallet: "main",
            },
          ],
        },
      };

      const { result } = renderHook(() =>
        useFinanceCalculations(data, "September 2026")
      );

      const found = result.current.activeReceivables.find(
        r => r.id === "rec-future"
      );
      expect(found).toBeUndefined();
    });

    it("includes By Date inflow in its scheduled month", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-current",
              name: "Current Project",
              amount: 5000,
              frequency: "By Date",
              date: "2026-09-15",
              wallet: "main",
            },
          ],
        },
      };

      const { result } = renderHook(() =>
        useFinanceCalculations(data, "September 2026")
      );

      const found = result.current.activeReceivables.find(
        r => r.id === "rec-current"
      );
      expect(found).toBeDefined();
      expect(found?.targetMonthForDue).toBe("September 2026");
      expect(found?.collected).toBe(false);
      expect(found?.amountReceived).toBe(0);
    });

    it("carries forward an unpaid overdue By Date inflow as the same occurrence", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-overdue",
              name: "Overdue Project",
              amount: 5000,
              frequency: "By Date",
              date: "2026-08-15",
              wallet: "main",
            },
          ],
        },
        logs: {
          "August 2026": {
            recsCollected: {
              "rec-overdue": {
                amountReceived: 2000,
                collected: false,
              },
            },
          },
        },
      };

      const { result } = renderHook(() =>
        useFinanceCalculations(data, "September 2026")
      );

      const found = result.current.activeReceivables.find(
        r => r.id === "rec-overdue"
      );
      expect(found).toBeDefined();
      expect(found?.targetMonthForDue).toBe("August 2026");
      expect(found?.amountReceived).toBe(2000);
      expect(found?.collected).toBe(false);
    });

    it("hides a fully settled By Date inflow from subsequent months", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-settled",
              name: "Settled Project",
              amount: 5000,
              frequency: "By Date",
              date: "2026-08-15",
              wallet: "main",
            },
          ],
        },
        logs: {
          "August 2026": {
            recsCollected: {
              "rec-settled": {
                amountReceived: 5000,
                collected: true,
              },
            },
          },
        },
      };

      const { result } = renderHook(() =>
        useFinanceCalculations(data, "September 2026")
      );

      const found = result.current.activeReceivables.find(
        r => r.id === "rec-settled"
      );
      expect(found).toBeUndefined();
    });

    it("keeps a settled By Date inflow visible as collected when viewing its original month", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-settled",
              name: "Settled Project",
              amount: 5000,
              frequency: "By Date",
              date: "2026-08-15",
              wallet: "main",
            },
          ],
        },
        logs: {
          "August 2026": {
            recsCollected: {
              "rec-settled": {
                amountReceived: 5000,
                collected: true,
              },
            },
          },
        },
      };

      const { result } = renderHook(() =>
        useFinanceCalculations(data, "August 2026")
      );

      const found = result.current.activeReceivables.find(
        r => r.id === "rec-settled"
      );
      expect(found).toBeDefined();
      expect(found?.collected).toBe(true);
      expect(found?.amountReceived).toBe(5000);
    });

    it("preserves authoritative historical reporting and receipt breakdown when viewing the original month", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-aug-settled",
              name: "August Shoot",
              amount: 10000,
              frequency: "By Date",
              date: "2026-08-20",
              wallet: "main",
            },
          ],
        },
        logs: {
          "August 2026": {
            recsCollected: {
              "rec-aug-settled": {
                amountReceived: 10000,
                collected: true,
              },
            },
            receivableSettlements: {
              "rec-aug-settled": [
                {
                  id: "rcpt-aug-1",
                  amount: 10000,
                  wallet: "main",
                  walletCredit: 10000,
                  receivedAt: "2026-08-20T10:00:00.000Z",
                  paydayDay: 15,
                },
              ],
            },
          },
        },
      };

      const { result } = renderHook(() =>
        useFinanceCalculations(data, "August 2026")
      );

      const found = result.current.activeReceivables.find(
        r => r.id === "rec-aug-settled"
      );
      expect(found).toBeDefined();
      expect(found?.collected).toBe(true);
      expect(found?.amountReceived).toBe(10000);
      expect(found?.targetMonthForDue).toBe("August 2026");
      expect(found?.paydayReceived?.[15]).toBe(10000);
    });

    it("handles undated legacy By Date inflows without recurring monthly occurrences, keeping them accessible with needsDate flag", () => {
      const uncollectedData: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-legacy-undated",
              name: "Legacy Undated Inflow",
              amount: 3000,
              frequency: "By Date",
              date: "",
              wallet: "main",
            },
          ],
        },
      };

      const { result: uncollectedResult } = renderHook(() =>
        useFinanceCalculations(uncollectedData, "September 2026")
      );

      const uncollectedFound = uncollectedResult.current.activeReceivables.find(
        r => r.id === "rec-legacy-undated"
      );
      expect(uncollectedFound).toBeDefined();
      expect(uncollectedFound?.needsDate).toBe(true);
      expect(uncollectedFound?.collected).toBe(false);

      // Once collected in September 2026, it must NOT reappear in October 2026
      const collectedData: UnifiedFinanceData = {
        ...uncollectedData,
        logs: {
          "September 2026": {
            recsCollected: {
              "rec-legacy-undated": {
                amountReceived: 3000,
                collected: true,
              },
            },
          },
        },
      };

      const { result: octResult } = renderHook(() =>
        useFinanceCalculations(collectedData, "October 2026")
      );
      const octFound = octResult.current.activeReceivables.find(
        r => r.id === "rec-legacy-undated"
      );
      expect(octFound).toBeUndefined();

      // But still visible in September 2026 as collected
      const { result: sepResult } = renderHook(() =>
        useFinanceCalculations(collectedData, "September 2026")
      );
      const sepFound = sepResult.current.activeReceivables.find(
        r => r.id === "rec-legacy-undated"
      );
      expect(sepFound).toBeDefined();
      expect(sepFound?.collected).toBe(true);
    });

    it("preserves independent monthly recurring occurrences for Monthly and Bi-monthly receivables", () => {
      const data: UnifiedFinanceData = {
        ...baseData,
        library: {
          ...baseData.library,
          receivables: [
            {
              id: "rec-monthly",
              name: "Monthly Retainer",
              amount: 15000,
              frequency: "Monthly",
              monthlyDay: 15,
              startMonth: "August 2026",
              wallet: "main",
            },
          ],
        },
        logs: {
          "August 2026": {
            recsCollected: {
              "rec-monthly": {
                amountReceived: 15000,
                collected: true,
              },
            },
          },
        },
      };

      // In August 2026, it is collected
      const { result: augResult } = renderHook(() =>
        useFinanceCalculations(data, "August 2026")
      );
      const augFound = augResult.current.activeReceivables.find(
        r => r.id === "rec-monthly"
      );
      expect(augFound).toBeDefined();
      expect(augFound?.collected).toBe(true);

      // In September 2026, it recurs as an active uncollected monthly obligation
      const { result: sepResult } = renderHook(() =>
        useFinanceCalculations(data, "September 2026")
      );
      const sepFound = sepResult.current.activeReceivables.find(
        r => r.id === "rec-monthly"
      );
      expect(sepFound).toBeDefined();
      expect(sepFound?.collected).toBe(false);
      expect(sepFound?.amountReceived).toBe(0);
      expect(sepFound?.targetMonthForDue).toBe("September 2026");
    });
  });

});
