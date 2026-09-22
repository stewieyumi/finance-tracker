import { describe, expect, it } from "vitest";
import {
  calculateCashflowMomentum,
  calculateDebtRunway,
  calculateSafeToSpend
} from "./financialAnalytics";
import { UnifiedFinanceData } from "../types/finance";

const baseData = (): UnifiedFinanceData =>
  ({
    wallets: {},
    logs: {},
    library: {
      bills: [],
      receivables: [],
      shoots: [],
      expenses: [],
      manualTransactions: []
    },
    settings: {}
  }) as UnifiedFinanceData;

describe("financial analytics", () => {
  it("calculates loan runway using paid installments and overrides", () => {
    const data = baseData();

    data.library.bills = [
      {
        id: "loan-1",
        name: "Laptop",
        amount: 1000,
        dueDay: "15",
        type: "Loan / Installment",
        startMonth: "January 2026",
        endMonth: "March 2026"
      }
    ];

    data.logs = {
      "January 2026": {
        billsPaid: ["loan-1"],
        billOverrides: {}
      },
      "February 2026": {
        billsPaid: ["loan-1"],
        billOverrides: { "loan-1": 1200 }
      }
    };

    const result = calculateDebtRunway(data, "February 2026");

    expect(result).toEqual([
      {
        id: "loan-1",
        name: "Laptop",
        monthlyAmount: 1000,
        startMonth: "January 2026",
        endMonth: "March 2026",
        totalMonths: 3,
        elapsedMonths: 2,
        totalPrincipal: 3000,
        totalPaid: 2200,
        remainingPrincipal: 800,
        progressPercent: (2 / 3) * 100
      }
    ]);
  });

  it("scans the full loan term when the selected month is after the end month", () => {
    const data = baseData();

    data.library.bills = [
      {
        id: "loan-2",
        name: "Phone",
        amount: 500,
        dueDay: "15",
        type: "Loan / Installment",
        startMonth: "January 2026",
        endMonth: "March 2026"
      }
    ];

    data.logs = {
      "January 2026": { billsPaid: ["loan-2"] },
      "February 2026": { billsPaid: ["loan-2"] },
      "March 2026": { billsPaid: ["loan-2"] }
    };

    const result = calculateDebtRunway(data, "May 2026");

    expect(result[0].elapsedMonths).toBe(3);
    expect(result[0].totalPaid).toBe(1500);
    expect(result[0].remainingPrincipal).toBe(0);
    expect(result[0].progressPercent).toBe(100);
  });

  it("calculates six months of cashflow momentum around the selected month", () => {
    const data = baseData();

    data.library.bills = [
      {
        id: "bill-1",
        name: "Rent",
        amount: 10000,
        dueDay: "15",
        type: "Bill",
        startMonth: "January 2026"
      }
    ];

    data.library.receivables = [
      {
        id: "rec-1",
        name: "Client",
        amount: 5000,
        frequency: "Monthly",
        startMonth: "January 2026"
      }
    ];

    const result = calculateCashflowMomentum(data, "March 2026");

    expect(result).toHaveLength(6);
    expect(result.map(item => item.month)).toEqual([
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May"
    ]);
    expect(result.find(item => item.isCurrent)).toMatchObject({
      month: "Mar",
      inflow: 5000,
      bills: 10000
    });
  });

  it("uses collected receivable amounts and bill overrides in cashflow momentum", () => {
    const data = baseData();

    data.library.bills = [
      {
        id: "bill-1",
        name: "Subscription",
        amount: 1000,
        dueDay: "15",
        type: "Subscription",
        startMonth: "January 2026"
      }
    ];

    data.library.receivables = [
      {
        id: "rec-1",
        name: "Client",
        amount: 5000,
        frequency: "Monthly",
        startMonth: "January 2026"
      }
    ];

    data.logs = {
      "March 2026": {
        billOverrides: { "bill-1": 1200 },
        recsCollected: {
          "rec-1": { amountReceived: 3000, collected: true }
        }
      }
    };

    const result = calculateCashflowMomentum(data, "March 2026");

    expect(result.find(item => item.isCurrent)).toMatchObject({
      inflow: 3000,
      bills: 1200
    });
  });

  it("only schedules By Date receivables in their exact month", () => {
    const data = baseData();

    data.library.receivables = [
      {
        id: "rec-2",
        name: "Project",
        amount: 8000,
        frequency: "By Date",
        date: "2026-03-20"
      }
    ];

    const result = calculateCashflowMomentum(data, "March 2026");

    expect(result.find(item => item.isCurrent)?.inflow).toBe(8000);
    expect(result.find(item => item.month === "Apr")?.inflow).toBe(0);
  });

  it("ignores bills before their start month and after loan end month", () => {
    const data = baseData();

    data.library.bills = [
      {
        id: "loan-3",
        name: "Old Loan",
        amount: 900,
        dueDay: "15",
        type: "Loan / Installment",
        startMonth: "February 2026",
        endMonth: "March 2026"
      }
    ];

    const result = calculateCashflowMomentum(data, "January 2026");

    expect(result.find(item => item.isCurrent)?.bills).toBe(0);
  });

  describe("calculateSafeToSpend", () => {
    it("returns totalLiquid minus totalUnpaidCommitments when liquid exceeds commitments", () => {
      expect(calculateSafeToSpend(10000, 3000)).toBe(7000);
    });

    it("floors at 0 when commitments exceed liquid cash", () => {
      expect(calculateSafeToSpend(2000, 5000)).toBe(0);
    });

    it("handles zeros and undefined gracefully", () => {
      expect(calculateSafeToSpend(0, 0)).toBe(0);
      expect(calculateSafeToSpend(5000, 0)).toBe(5000);
    });
  });
});
