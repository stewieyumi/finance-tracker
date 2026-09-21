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
});
