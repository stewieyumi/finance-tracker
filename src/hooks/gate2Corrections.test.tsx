import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBillActions, applyBillStatusToggle } from "./useBillActions";
import { applyAddPayment, applyReceivableStatusToggle } from "./useReceivableActions";
import { applyUndoPaydaySplit } from "./usePaydayActions";
import { useCloudSync } from "./useCloudSync";
import { useFinanceCalculations } from "./useFinanceCalculations";
import { WalletsTab } from "../components/WalletsTab";
import { recordPaymentAction, type PaymentHistory, type PaymentHistoryAction } from "../utils/paymentHistory";
import type { BillViewModel, ReceivableViewModel, UnifiedFinanceData } from "../types/finance";

const month = "November 2026";
const bill: BillViewModel = {
  id: "bill-1", name: "Synthetic bill", amount: 20, baseAmount: 20, type: "Bill", dueDay: "15",
  wallet: "main", startMonth: month, endMonth: "", paid: false,
  targetMonthForDue: month, daysLeft: 1, isOverridden: false,
};
const rec = {
  id: "rec-1", name: "Synthetic inflow", amount: 20, amountReceived: 0,
  collected: false, wallet: "main", frequency: "By Date", date: "2026-11-14",
  targetMonthForDue: month, category: "Other",
} as ReceivableViewModel;
const makeData = (): UnifiedFinanceData => ({
  wallets: { main: 100, spare: 50 },
  settings: { defaultWallet: "main", hasMigratedBaseWallets: true,
    customWallets: [{ id: "main", label: "Main" }, { id: "spare", label: "Spare" }] },
  library: { bills: [bill], receivables: [rec], shoots: [], expenses: [], manualTransactions: [] },
  logs: {}, paydaySplitExecutions: [], updatedAt: 1,
});
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Gate 2 adversarial checks", () => {
  it("puts a redone bill back on the global Undo stack", () => {
    let data = makeData();
    let history: PaymentHistory = { owner: "synthetic-owner", undo: [], redo: [] };
    const showToast = vi.fn((_message: string, action?: PaymentHistoryAction) => {
      if (action) history = recordPaymentAction(history, "synthetic-owner", action);
    });
    const { result } = renderHook(() => useBillActions({
      globalData: data, selectedMonth: month, showToast,
      commitBillTransition: transition => {
        const result = transition(data); if (result.ok) data = result.data; return result;
      },
    }));
    act(() => result.current.toggleBillStatus(bill));
    expect(data.wallets.main).toBe(80);
    act(() => history.undo.at(-1)!.onClick());
    expect(data.wallets.main).toBe(100);
    act(() => history.redo.at(-1)!.onClick());
    expect(data.wallets.main).toBe(80);
    expect(history.undo).toHaveLength(1);
    expect(history.redo).toHaveLength(0);
    act(() => history.undo.at(-1)!.onClick());
    expect(data.wallets.main).toBe(100);
  });

  it("restores archived metadata without converting an invalid null balance into zero", () => {
    let data = makeData();
    data.wallets.old = null as unknown as number;
    data.settings!.archivedWallets = [{ id: "old", label: "Old" }];
    render(<WalletsTab globalData={data} setGlobalData={action => {
      data = typeof action === "function" ? action(data) : action;
    }} onCommit={vi.fn()} onIncrement={vi.fn()} />);
    fireEvent.click(screen.getByText("Archived wallets"));
    fireEvent.click(screen.getByRole("button", { name: "Restore Old" }));
    expect(data.wallets.old).toBeNull();
  });

  it("rejects paying a bill using a stale wallet after the authoritative bill route changed", () => {
    const data = makeData();
    data.library.bills = [{ ...bill, wallet: "spare" }];
    const result = applyBillStatusToggle(data, bill, month);
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });

  it.each(["toggle", "partial"])("rejects %s collection after the authoritative inflow was removed", (mode) => {
    const data = makeData();
    data.library.receivables = [];
    const result = mode === "toggle"
      ? applyReceivableStatusToggle(data, rec, month)
      : applyAddPayment(data, rec, 10, month);
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });

  it.each(["20", -20, NaN, null])("rejects undo of a malformed saved payday allocation %s without erasing its execution", (amount) => {
    const data = makeData();
    data.logs[month] = { billPaydayContributions: { "bill-1": 20 } };
    data.paydaySplitExecutions = [{
      id: "exec-1", date: "2026-11-13", timestamp: 1,
      allocations: { main: amount as number },
      billContributions: [{ id: "bill-1", month, amount: 20 }],
    }];
    const result = applyUndoPaydaySplit(data, "exec-1");
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });
});

describe("Gate 2 — current record and saved provenance boundaries", () => {
  it.each([null, NaN, "broken", "0", -5, undefined])("preserves archived raw balance %s on restore", raw => {
    let data = makeData();
    if (raw !== undefined) data.wallets.old = raw as number;
    data.settings!.archivedWallets = [{ id: "old", label: "Old" }];
    render(<WalletsTab globalData={data} setGlobalData={action => {
      data = typeof action === "function" ? action(data) : action;
    }} onCommit={vi.fn()} onIncrement={vi.fn()} />);
    fireEvent.click(screen.getByText("Archived wallets"));
    fireEvent.click(screen.getByRole("button", { name: "Restore Old" }));
    expect(data.wallets.old).toBe(raw === undefined ? 0 : raw);
    expect(data.settings!.customWallets?.filter(w => w.id === "old")).toHaveLength(1);
    expect(data.settings!.archivedWallets).toEqual([]);
    expect(data.wallets.main).toBe(100);
  });

  it.each(["missing", "duplicate", "amount", "base", "wallet", "due", "schedule", "override", "occurrence"])(
    "rejects stale bill %s atomically", kind => {
      const data = makeData();
      if (kind === "missing") data.library.bills = [];
      if (kind === "duplicate") data.library.bills = [bill, { ...bill }];
      if (kind === "amount" || kind === "base") data.library.bills = [{ ...bill, amount: 30 }];
      if (kind === "wallet") data.library.bills = [{ ...bill, wallet: "spare" }];
      if (kind === "due") data.library.bills = [{ ...bill, dueDay: "20" }];
      if (kind === "schedule" || kind === "occurrence") data.library.bills = [{ ...bill, startMonth: "October 2026" }];
      if (kind === "override") data.logs[month] = { billOverrides: { [bill.id]: 30 } };
      const candidate = kind === "base" ? { ...bill, amount: 30 } :
        kind === "occurrence" ? { ...bill, startMonth: "October 2026" } : bill;
      const result = applyBillStatusToggle(data, candidate, month);
      expect(result.ok).toBe(false);
      expect(result.data).toBe(data);
      expect(data.wallets).toEqual({ main: 100, spare: 50 });
    }
  );

  it("accepts the current bill override without changing its library base amount", () => {
    const data = makeData();
    data.logs[month] = { billOverrides: { [bill.id]: 30 } };
    const result = applyBillStatusToggle(data, { ...bill, amount: 30, isOverridden: true }, month);
    expect(result.ok).toBe(true);
    expect(result.data.wallets.main).toBe(70);
    expect(result.data.library.bills[0].amount).toBe(20);
    expect(result.data.logs[month].billSettlements?.[bill.id][0].amount).toBe(30);
  });

  it.each(["missing", "duplicate", "wallet", "amount", "date", "frequency", "start", "monthlyDay", "paydays", "occurrence"])(
    "rejects stale inflow %s for both fresh credit paths", kind => {
      const data = makeData();
      const candidate = { ...rec, ...(kind === "occurrence" ? { targetMonthForDue: "October 2026" } : {}) };
      if (kind === "missing") data.library.receivables = [];
      if (kind === "duplicate") data.library.receivables = [rec, { ...rec }];
      if (kind === "wallet") data.library.receivables = [{ ...rec, wallet: "spare" }];
      if (kind === "amount") data.library.receivables = [{ ...rec, amount: 30 }];
      if (kind === "date") data.library.receivables = [{ ...rec, date: "2026-11-15" }];
      if (kind === "frequency") data.library.receivables = [{ ...rec, frequency: "Monthly" }];
      if (kind === "start") data.library.receivables = [{ ...rec, startMonth: "October 2026" }];
      if (kind === "monthlyDay") data.library.receivables = [{ ...rec, monthlyDay: 15 }];
      if (kind === "paydays") data.library.receivables = [{ ...rec, biMonthlyDays: [5, 20] }];
      for (const result of [applyReceivableStatusToggle(data, candidate, month), applyAddPayment(data, candidate, 10, month)]) {
        expect(result.ok).toBe(false);
        expect(result.data).toBe(data);
      }
    }
  );

  it("keeps an overdue By Date inflow in its original occurrence for partial then full collection", () => {
    const data = makeData();
    const overdue = { ...rec, date: "2026-10-14", targetMonthForDue: "October 2026" };
    data.library.receivables = [overdue];
    const first = applyAddPayment(data, overdue, 10, month);
    expect(first.ok).toBe(true);
    const full = applyAddPayment(first.data, { ...overdue, amountReceived: 10 }, 10, month);
    expect(full.ok).toBe(true);
    expect(full.data.wallets.main).toBe(120);
    expect(full.data.logs[month]).toBeUndefined();
    expect(full.data.logs["October 2026"].recsCollected?.[rec.id]).toEqual({ amountReceived: 20, collected: true });
  });

  it("preserves a one-time inflow's existing legacy log month", () => {
    const data = makeData();
    data.logs["October 2026"] = { recsCollected: { [rec.id]: { amountReceived: 5, collected: false } } };
    const result = applyAddPayment(data, { ...rec, amountReceived: 5, targetMonthForDue: "October 2026" }, 5, month);
    expect(result.ok).toBe(true);
    expect(result.data.wallets.main).toBe(105);
    expect(result.data.logs[month]).toBeUndefined();
  });

  it("reverses a removed inflow into its recorded original archived wallet", () => {
    const data = makeData();
    const paid = applyReceivableStatusToggle(data, rec, month);
    expect(paid.ok).toBe(true);
    const archived = {
      ...paid.data,
      settings: { ...data.settings, customWallets: [{ id: "spare", label: "Spare" }], archivedWallets: [{ id: "main", label: "Main" }] },
      library: { ...data.library, receivables: [], archivedReceivables: [rec] },
    };
    const result = applyReceivableStatusToggle(archived, { ...rec, wallet: "spare", amount: 999, amountReceived: 20, collected: true }, month);
    expect(result.ok).toBe(true);
    expect(result.data.wallets).toEqual(data.wallets);
  });

  const savedPayday = () => {
    const data = makeData();
    data.logs[month] = { billPaydayContributions: { [bill.id]: 20 } };
    data.paydaySplitExecutions = [{ id: "exec", date: "2026-11-14", timestamp: 1,
      allocations: { main: 20 }, billContributions: [{ id: bill.id, month, amount: 20 }] }];
    return data;
  };

  it.each([
    { allocations: null }, { allocations: [] }, { allocations: { main: Infinity } },
    { allocations: { main: 0.001 } }, { allocations: { main: 1e100 } },
    { billContributions: null }, { billContributions: [null] },
    { billContributions: [{ id: bill.id, month, amount: "20" }] },
    { billContributions: [{ id: bill.id, month, amount: -20 }] },
    { billContributions: [{ id: bill.id, month, amount: NaN }] },
    { billContributions: [{ id: "", month, amount: 20 }] },
    { billContributions: [{ id: bill.id, month: "", amount: 20 }] },
    { billContributions: [{ id: bill.id, month, amount: 21 }] },
  ])("preserves a malformed saved execution and all state: %j", patch => {
    const data = savedPayday();
    Object.assign(data.paydaySplitExecutions![0], patch);
    const result = applyUndoPaydaySplit(data, "exec");
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
    expect(data.wallets.main).toBe(100);
    expect(data.logs[month].billPaydayContributions?.[bill.id]).toBe(20);
    expect(data.paydaySplitExecutions).toHaveLength(1);
  });

  it("rejects duplicate execution IDs without deleting either record", () => {
    const data = savedPayday();
    data.paydaySplitExecutions!.push(data.paydaySplitExecutions![0]);
    expect(applyUndoPaydaySplit(data, "exec").data).toBe(data);
  });

  it.each([null, "broken", NaN])("does not touch an invalid zero-allocation wallet during undo: %s", raw => {
    const data = savedPayday();
    data.wallets.spare = raw as number;
    const execution = data.paydaySplitExecutions![0] as Exclude<NonNullable<UnifiedFinanceData["paydaySplitExecutions"]>[number], string>;
    execution.allocations.spare = 0;
    const result = applyUndoPaydaySplit(data, "exec");
    expect(result.ok).toBe(true);
    expect(result.data.wallets.spare).toBe(raw);
    expect(result.data.wallets.main).toBe(80);
    expect(result.data.logs[month].billPaydayContributions?.[bill.id]).toBe(0);
    expect(result.data.paydaySplitExecutions).toHaveLength(0);
  });
});


describe("Gate 2 — real latest-state committer and calculation integration", () => {
  it("rejects a same-tick bill route change without a payment or history action", () => {
    const initial = makeData();
    const toast = vi.fn();
    const { result } = renderHook(() => {
      const [data, setData] = React.useState(initial);
      const sync = useCloudSync(data, setData, toast);
      return { data, sync, ...useBillActions({ globalData: initial, selectedMonth: month,
        commitBillTransition: sync.commitDataTransition, showToast: toast }) };
    });
    act(() => {
      result.current.sync.commitDataTransition(prev => ({ ok: true,
        data: { ...prev, library: { ...prev.library, bills: [{ ...bill, wallet: "spare" }] } } }));
      result.current.toggleBillStatus(bill);
    });
    expect(result.current.data.wallets).toEqual(initial.wallets);
    expect(result.current.data.logs).toEqual({});
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/bill changed/i));
    expect(toast.mock.calls.every(call => call.length === 1)).toBe(true);
  });

  it.each(["Monthly", "Bi-monthly"] as const)("accepts the actual oldest %s occurrence from the calculator", frequency => {
    const initial = makeData();
    initial.library.receivables = [{ ...rec, frequency, startMonth: "October 2026", biMonthlyDays: [5, 20] }];
    const { result } = renderHook(() => useFinanceCalculations(initial, month));
    const actual = result.current.activeReceivables[0];
    expect(actual.targetMonthForDue).toBe("October 2026");
    const paid = applyAddPayment(initial, actual, 10, month);
    expect(paid.ok).toBe(true);
    expect(paid.data.wallets.main).toBe(110);
    expect(paid.data.logs["October 2026"].recsCollected?.[rec.id]?.amountReceived).toBe(10);
  });

  it("accepts the calculator's oldest overdue installment after its end month", () => {
    const initial = makeData();
    initial.library.bills = [{ ...bill, type: "Loan / Installment", startMonth: "September 2026", endMonth: "October 2026" }];
    const { result } = renderHook(() => useFinanceCalculations(initial, month));
    const actual = result.current.activeBills[0];
    expect(actual.targetMonthForDue).toBe("September 2026");
    const paid = applyBillStatusToggle(initial, actual, month);
    expect(paid.ok).toBe(true);
    expect(paid.data.wallets.main).toBe(80);
  });
});
