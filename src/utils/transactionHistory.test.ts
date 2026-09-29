import { describe, expect, it } from "vitest";
import { UnifiedFinanceData } from "../types/finance";
import { buildTransactionHistory } from "./transactionHistory";

const makeData = (
  overrides: Partial<UnifiedFinanceData> = {}
): UnifiedFinanceData =>
  ({
    library: {
      bills: [],
      expenses: [],
      receivables: [],
      shoots: [],
      manualTransactions: []
    },
    logs: {},
    wallets: {},
    settings: {},
    paydaySplitExecutions: [],
    ...overrides
  }) as UnifiedFinanceData;

describe("buildTransactionHistory", () => {
  it("builds expense transactions with negative amounts", () => {
    const data = makeData({
      library: {
        bills: [],
        expenses: [
          {
            id: "exp-1",
            merchant: "Coffee Shop",
            amount: 150,
            category: "Food & Dining",
            wallet: "gcash",
            date: "2026-09-20"
          }
        ],
        receivables: [],
        shoots: [],
        manualTransactions: []
      }
    });

    expect(buildTransactionHistory(data)).toEqual([
      {
        id: "exp-1",
        title: "Coffee Shop",
        amount: -150,
        date: "2026-09-20",
        type: "expense",
        wallet: "gcash",
        category: "Food & Dining"
      }
    ]);
  });

  it("builds paid bills using overrides and recorded payment dates", () => {
    const data = makeData({
      library: {
        bills: [
          {
            id: "bill-1",
            name: "Internet",
            amount: 2000,
            type: "Bill",
            dueDay: "15",
            wallet: "bpi"
          }
        ],
        expenses: [],
        receivables: [],
        shoots: [],
        manualTransactions: []
      },
      logs: {
        "2026 September": {
          billsPaid: ["bill-1"],
          billOverrides: { "bill-1": 1750 },
          paymentDates: { "bill-1": "2026-09-14" }
        }
      }
    });

    expect(buildTransactionHistory(data)).toEqual([
      {
        id: "bill-1_2026 September",
        title: "Internet (2026)",
        amount: -1750,
        date: "2026-09-14",
        type: "bill",
        wallet: "bpi",
        category: "Bill"
      }
    ]);
  });

  it("builds collected receivables with their recorded amount", () => {
    const data = makeData({
      library: {
        bills: [],
        expenses: [],
        receivables: [
          {
            id: "rec-1",
            name: "Client Payment",
            amount: 5000,
            frequency: "Monthly",
            monthlyDay: 10,
            category: "Shoot",
            wallet: "maya"
          }
        ],
        shoots: [],
        manualTransactions: []
      },
      logs: {
        "2026 September": {
          recsCollected: {
            "rec-1": {
              amountReceived: 3000,
              collected: true
            }
          },
          paymentDates: {
            "rec-1": "2026-09-09"
          }
        }
      }
    });

    expect(buildTransactionHistory(data)).toEqual([
      {
        id: "rec-1_2026 September",
        title: "Client Payment",
        amount: 3000,
        date: "2026-09-09",
        type: "inflow",
        wallet: "maya",
        category: "Shoot"
      }
    ]);
  });

  it("builds positive payday allocations and ignores legacy string executions", () => {
    const data = makeData({
      paydaySplitExecutions: [
        "legacy-execution",
        {
          id: "pd-1",
          date: "2026-09-15",
          timestamp: 100,
          allocations: {
            gcash: 2500,
            bpi: 1000,
            maya: 0
          },
          billContributions: []
        }
      ]
    });

    expect(buildTransactionHistory(data)).toEqual([
      {
        id: "pd-1_gcash",
        title: "Payday Allocation",
        amount: 2500,
        date: "2026-09-15",
        type: "inflow",
        wallet: "gcash",
        category: "Payday"
      },
      {
        id: "pd-1_bpi",
        title: "Payday Allocation",
        amount: 1000,
        date: "2026-09-15",
        type: "inflow",
        wallet: "bpi",
        category: "Payday"
      }
    ]);
  });

  it("builds manual transfers as outgoing and destination inflow transactions", () => {
    const data = makeData({
      library: {
        bills: [],
        expenses: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "mt-1",
            title: "Move money",
            amount: 500,
            createdAt: 100,
            date: "2026-09-18",
            type: "transfer",
            wallet: "gcash",
            destinationWallet: "bpi",
            category: "Transfer"
          }
        ]
      }
    });

    expect(buildTransactionHistory(data)).toEqual([
      {
        id: "mt-1_dest",
        title: "Move money (Receive)",
        amount: 500,
        date: "2026-09-18",
        type: "inflow",
        wallet: "bpi",
        category: "Transfer"
      },
      {
        id: "mt-1",
        title: "Move money",
        amount: -500,
        date: "2026-09-18",
        type: "expense",
        wallet: "gcash",
        category: "Transfer"
      }
    ]);
  });

  it("sorts transactions by date descending, then id descending", () => {
    const data = makeData({
      library: {
        bills: [],
        expenses: [
          {
            id: "a",
            merchant: "Older",
            amount: 100,
            category: "Food & Dining",
            wallet: "gcash",
            date: "2026-09-18"
          },
          {
            id: "c",
            merchant: "Same Date C",
            amount: 100,
            category: "Food & Dining",
            wallet: "gcash",
            date: "2026-09-20"
          },
          {
            id: "b",
            merchant: "Same Date B",
            amount: 100,
            category: "Food & Dining",
            wallet: "gcash",
            date: "2026-09-20"
          }
        ],
        receivables: [],
        shoots: [],
        manualTransactions: []
      }
    });

    expect(buildTransactionHistory(data).map(tx => tx.id)).toEqual([
      "c",
      "b",
      "a"
    ]);
  });

  it("returns an empty array when given empty globalData", () => {
    const data = makeData();
    expect(buildTransactionHistory(data)).toEqual([]);
  });

  it("does not mutate the input globalData", () => {
    const data = makeData({
      library: {
        bills: [{ id: "b1", name: "Electricity", amount: 1200, type: "Bill", dueDay: "5" }],
        expenses: [{ id: "e1", merchant: "Market", amount: 300, date: "2026-09-01", category: "Food & Dining", wallet: "main" }],
        receivables: [{ id: "r1", name: "Design", amount: 4000, frequency: "Monthly" }],
        shoots: [],
        manualTransactions: []
      },
      logs: {
        "September 2026": {
          billsPaid: ["b1"],
          recsCollected: { r1: { amountReceived: 4000, collected: true } }
        }
      },
      paydaySplitExecutions: [
        {
          id: "pd-1",
          date: "2026-09-15",
          timestamp: 100,
          allocations: { main: 5000 },
          billContributions: []
        }
      ]
    });

    const snapshot = JSON.parse(JSON.stringify(data));
    buildTransactionHistory(data);
    expect(data).toEqual(snapshot);
  });

  it("handles fallback dueDay, monthlyDay, and defaultWallet when optional fields are missing", () => {
    const data = makeData({
      settings: {
        defaultWallet: "custom-default"
      },
      library: {
        bills: [
          {
            id: "bill-no-day",
            name: "Water",
            amount: 500,
            type: "Bill"
            // no dueDay, no wallet
          } as any
        ],
        receivables: [
          {
            id: "rec-monthly-no-day",
            name: "Retainer",
            amount: 10000,
            frequency: "Monthly"
            // no monthlyDay, no wallet, no date
          },
          {
            id: "rec-other-no-date",
            name: "One-off Project",
            amount: 8000
            // no frequency, no date, no wallet
          } as any
        ],
        expenses: [],
        shoots: [],
        manualTransactions: []
      },
      logs: {
        "September 2026": {
          billsPaid: ["bill-no-day"],
          recsCollected: {
            "rec-monthly-no-day": { amountReceived: 10000, collected: true },
            "rec-other-no-date": { amountReceived: 8000, collected: true }
          }
        }
      }
    });

    const txs = buildTransactionHistory(data);

    // Bill without dueDay falls back to day 1 ("2026-09-01") and defaultWallet
    const billTx = txs.find(t => t.id === "bill-no-day_September 2026");
    expect(billTx).toBeDefined();
    expect(billTx?.date).toBe("2026-09-01");
    expect(billTx?.wallet).toBe("custom-default");
    expect(billTx?.amount).toBe(-500);

    // Monthly receivable without monthlyDay falls back to day 15 ("2026-09-15")
    const recMonthlyTx = txs.find(t => t.id === "rec-monthly-no-day_September 2026");
    expect(recMonthlyTx).toBeDefined();
    expect(recMonthlyTx?.date).toBe("2026-09-15");
    expect(recMonthlyTx?.wallet).toBe("custom-default");
    expect(recMonthlyTx?.amount).toBe(10000);

    // Non-monthly receivable without date falls back to day 15 ("2026-09-15")
    const recOtherTx = txs.find(t => t.id === "rec-other-no-date_September 2026");
    expect(recOtherTx).toBeDefined();
    expect(recOtherTx?.date).toBe("2026-09-15");
    expect(recOtherTx?.wallet).toBe("custom-default");
    expect(recOtherTx?.amount).toBe(8000);
  });

  it("handles mixed transaction sources and sorts them strictly by date descending", () => {
    const data = makeData({
      library: {
        expenses: [
          { id: "exp-1", merchant: "Groceries", amount: 1200, date: "2026-09-10", category: "Food & Dining", wallet: "main" }
        ],
        bills: [
          { id: "bill-1", name: "Gym", amount: 1500, dueDay: "05", type: "Bill" }
        ],
        receivables: [
          { id: "rec-1", name: "Invoice A", amount: 7000, date: "2026-09-25", frequency: "By Date" }
        ],
        shoots: [],
        manualTransactions: [
          { id: "mt-1", title: "ATM Withdrawal", amount: 2000, date: "2026-09-15", type: "expense", wallet: "cash", createdAt: 100 }
        ]
      },
      logs: {
        "September 2026": {
          billsPaid: ["bill-1"],
          recsCollected: {
            "rec-1": { amountReceived: 7000, collected: true }
          }
        }
      }
    });

    const txs = buildTransactionHistory(data);
    expect(txs.map(t => ({ id: t.id, date: t.date }))).toEqual([
      { id: "rec-1_September 2026", date: "2026-09-25" },
      { id: "mt-1", date: "2026-09-15" },
      { id: "exp-1", date: "2026-09-10" },
      { id: "bill-1_September 2026", date: "2026-09-05" }
    ]);
  });
});
