import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyExpenseDelete, useExpenseActions } from "./useExpenseActions";
import { applyPaydaySplit } from "./usePaydayActions";
import { useWalletActions } from "./useWalletActions";
import { useCloudSync } from "./useCloudSync";
import { WalletGrid } from "../components/WalletGrid";
import { applyLedgerSave } from "../components/HistoricalLedgerModal";
import {
  parseWalletBalance,
  reconcileWalletBalances,
  resolveActiveWalletDefault,
  validateActiveWalletAssignment,
} from "../utils/financeHelpers";
import type { Expense, UnifiedFinanceData } from "../types/finance";

const expense: Expense = {
  id: "expense-1", merchant: "Synthetic Shop", amount: 20, deductedAmount: 20,
  wallet: "main", category: "Other", date: "2026-11-14",
};
const makeData = (): UnifiedFinanceData => ({
  wallets: { main: 100, spare: 50 },
  settings: {
    defaultWallet: "main",
    customWallets: [{ id: "main", label: "Main" }, { id: "spare", label: "Spare" }],
  },
  library: { bills: [], receivables: [], shoots: [], expenses: [expense], manualTransactions: [] },
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("B1 correction regressions — authoritative expense reversal", () => {
  it("refunds only once through the real cloud committer even with stale hook props", () => {
    localStorage.clear();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const initial = makeData();
    const showToast = vi.fn();
    const { result } = renderHook(() => {
      const [data, setData] = React.useState(initial);
      const sync = useCloudSync(data, setData, showToast);
      const actions = useExpenseActions({
        globalData: initial, commitExpenseTransition: sync.commitDataTransition, showToast,
      });
      return { data, ...actions };
    });
    act(() => result.current.handleDeleteExpense(expense));
    expect(result.current.data.wallets.main).toBe(120);
    const accepted = result.current.data;
    showToast.mockClear();
    act(() => result.current.handleDeleteExpense(expense));
    expect(result.current.data).toBe(accepted);
    expect(showToast).not.toHaveBeenCalledWith("Expense deleted and refunded.");
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/no longer exists/i));
  });

  it.each([
    { amount: 30, deductedAmount: 30 }, { wallet: "spare" },
    { deductedAmount: 0 }, { date: "2026-11-13" },
  ])("rejects changed current expense %j without touching money or history", (change) => {
    const data = makeData();
    data.library.expenses = [{ ...expense, ...change }];
    const result = applyExpenseDelete(data, expense);
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });

  it("rejects a same-tick change observed by the real committer and gives no success toast", () => {
    localStorage.clear();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const initial = makeData();
    const showToast = vi.fn();
    const { result } = renderHook(() => {
      const [data, setData] = React.useState(initial);
      const sync = useCloudSync(data, setData, showToast);
      const actions = useExpenseActions({ globalData: initial, commitExpenseTransition: sync.commitDataTransition, showToast });
      return { data, sync, ...actions };
    });
    act(() => {
      result.current.sync.commitDataTransition(prev => ({
        ok: true,
        data: { ...prev, library: { ...prev.library, expenses: [{ ...expense, wallet: "spare" }] } },
      }));
      result.current.handleDeleteExpense(expense);
    });
    expect(result.current.data.wallets).toEqual(initial.wallets);
    expect(result.current.data.library.expenses?.[0].wallet).toBe("spare");
    expect(showToast).not.toHaveBeenCalledWith("Expense deleted and refunded.");
  });

  it("keeps the recorded partial debit and refunds an archived, absent original wallet", () => {
    const data = makeData();
    const old = { ...expense, wallet: "old", amount: 50, deductedAmount: 10 };
    data.settings!.archivedWallets = [{ id: "old", label: "Old" }];
    data.library.expenses = [old];
    const result = applyExpenseDelete(data, old);
    expect(result.ok).toBe(true);
    expect(result.data.wallets).toEqual({ ...data.wallets, old: 10 });
    expect(result.data.library.expenses).toEqual([]);
    expect(data.library.expenses).toEqual([old]);
  });

  it.each([NaN, Infinity, -1, 1e308])("rejects an invalid recorded debit %s atomically", (debit) => {
    const data = makeData();
    const old = { ...expense, deductedAmount: debit };
    data.library.expenses = [old];
    const result = applyExpenseDelete(data, old);
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });
});

describe("B1 correction regressions — payday targets", () => {
  it.each([null, NaN, "corrupted", "25.00"])("never rewrites a zero-allocation balance %s", (value) => {
    const data = makeData();
    data.wallets.broken = value as unknown as number;
    data.settings!.customWallets!.push({ id: "broken", label: "Broken" });
    data.settings!.archivedWallets = [{ id: "archived", label: "Archived" }];
    const result = applyPaydaySplit(data, { main: 10, broken: 0, unlisted: 0, archived: 0 }, [], "2026-11-14");
    expect(result.ok).toBe(true);
    expect(result.data.wallets.main).toBe(110);
    expect(result.data.wallets.broken).toBe(value);
    expect(result.data.wallets).not.toHaveProperty("unlisted");
    expect(result.data.wallets).not.toHaveProperty("archived");
    expect(data.wallets.main).toBe(100);
  });

  it.each([NaN, Infinity, -1, 0.001, "10", 1e308])("rejects invalid allocation %s before any wallet/log changes", (value) => {
    const data = makeData();
    const result = applyPaydaySplit(data, { main: 10, spare: value as number }, [], "2026-11-14");
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });

  it("rejects an overflowing final balance and preserves the execution and bill logs", () => {
    const data = makeData();
    data.wallets.spare = Math.floor(Number.MAX_SAFE_INTEGER / 100);
    const result = applyPaydaySplit(data, { main: 10, spare: 1000 }, [
      { id: "bill-1", month: "November 2026", wallet: "main", amount: 10 },
    ], "2026-11-14");
    expect(result.ok).toBe(false);
    expect(result.data).toBe(data);
  });
});

describe("B1 correction regressions — wallet actions and acknowledgement", () => {
  it.each([null, NaN, "broken", Infinity])("rejects Quick Add against corrupt balance %s", (value) => {
    let data = makeData();
    data.wallets.main = value as unknown as number;
    const initial = data;
    const { result } = renderHook(() => useWalletActions({ commitTransition: t => {
      const outcome = t(data); if (outcome.ok) data = outcome.data; return outcome;
    } }));
    let outcome: unknown;
    act(() => { outcome = result.current.incrementWallet("main", 100); });
    expect(outcome).toMatchObject({ ok: false });
    expect(data).toBe(initial);
  });

  it.each(["archived", "missing", "duplicate"])("blocks a %s wallet at authoritative execution time", (kind) => {
    let data = makeData();
    if (kind === "archived") data.settings!.archivedWallets = [{ id: "main", label: "Old" }];
    if (kind === "missing") data.settings!.customWallets = [{ id: "spare", label: "Spare" }];
    if (kind === "duplicate") data.settings!.customWallets!.push({ id: "main", label: "Duplicate" });
    const initial = data;
    const { result } = renderHook(() => useWalletActions({ commitTransition: t => {
      const outcome = t(data); if (outcome.ok) data = outcome.data; return outcome;
    } }));
    let outcome: unknown;
    act(() => { outcome = result.current.incrementWallet("main", 100); });
    expect(outcome).toMatchObject({ ok: false });
    expect(data).toBe(initial);
  });

  it("preserves signed balances, supports absent active balances, and rejects arithmetic overflow", () => {
    let data = makeData();
    data.wallets.main = -150;
    delete data.wallets.spare;
    const { result } = renderHook(() => useWalletActions({ commitTransition: t => {
      const outcome = t(data); if (outcome.ok) data = outcome.data; return outcome;
    } }));
    act(() => result.current.incrementWallet("main", 100));
    expect(data.wallets.main).toBe(-50);
    act(() => result.current.incrementWallet("spare", 0.1));
    act(() => result.current.incrementWallet("spare", 0.2));
    expect(data.wallets.spare).toBe(0.3);
    data = { ...data, wallets: { ...data.wallets, main: Math.floor(Number.MAX_SAFE_INTEGER / 100) } };
    const beforeOverflow = data;
    act(() => result.current.incrementWallet("main", 1000));
    expect(data).toBe(beforeOverflow);
  });

  it("distinguishes an explicit balance repair from an increment and rejects invalid replacement values", () => {
    let data = makeData();
    data.wallets.main = null as unknown as number;
    const { result } = renderHook(() => useWalletActions({ commitTransition: t => {
      const outcome = t(data); if (outcome.ok) data = outcome.data; return outcome;
    } }));
    const initial = data;
    act(() => result.current.commitWallet("main", Infinity));
    expect(data).toBe(initial);
    act(() => result.current.commitWallet("main", 45.25));
    expect(data.wallets.main).toBe(45.25);
  });

  it.each(["increment", "replace"])("keeps the balance editor open after rejected %s", (kind) => {
    const fail = vi.fn(() => ({ ok: false as const, error: "Wallet changed; review it." }));
    render(<WalletGrid wallets={{ main: 100 }} customWallets={[{ id: "main", label: "Main" }]}
      onCommit={fail} onIncrement={fail} />);
    fireEvent.click(screen.getByRole("button", { name: /Main/ }));
    if (kind === "increment") fireEvent.click(screen.getByRole("button", { name: /^100$/ }));
    else fireEvent.click(screen.getByRole("button", { name: "Save Balance" }));
    expect(screen.getByRole("heading", { name: "Edit Balance" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Wallet changed; review it.");
  });

  it("closes only after a confirmed accepted wallet change", () => {
    render(<WalletGrid wallets={{ main: 100 }} customWallets={[{ id: "main", label: "Main" }]}
      onCommit={() => ({ ok: true })} onIncrement={() => ({ ok: true })} />);
    fireEvent.click(screen.getByRole("button", { name: /Main/ }));
    fireEvent.click(screen.getByRole("button", { name: /^100$/ }));
    expect(screen.queryByRole("heading", { name: "Edit Balance" })).not.toBeInTheDocument();
  });
});

describe("B1 correction regressions — wallet identity and money range", () => {
  it("excludes every duplicate ID from defaults and rejects explicit duplicate routing", () => {
    const data = makeData();
    data.settings!.customWallets!.push({ id: "main", label: "Duplicate" });
    expect(resolveActiveWalletDefault(data.settings, data.wallets)).toBe("spare");
    expect(validateActiveWalletAssignment("main", data.settings, data.wallets).ok).toBe(false);
    expect(reconcileWalletBalances(data).totalLiquid).toBe(150);
    data.settings!.customWallets = [{ id: "main", label: "One" }, { id: "main", label: "Two" }];
    expect(resolveActiveWalletDefault(data.settings, data.wallets)).toBe("");
  });

  it.each([{ customWallets: [] }, { customWallets: [{ id: "ghost", label: "One" }, { id: "ghost", label: "Two" }] }])(
    "rejects ledger destinations without one eligible active identity: %j", ({ customWallets }) => {
      const data = makeData(); data.settings!.customWallets = customWallets;
      const result = applyLedgerSave(data, {
        id: "ledger-1", editingId: null, title: "Synthetic income", amount: "10", type: "income",
        date: "2026-11-14", wallet: "ghost", updateWallets: true,
      });
      expect(result.ok).toBe(false);
      expect(result.data).toBe(data);
    },
  );

  it.each([1e308, -1e308, "1" + "0".repeat(308), Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])(
    "rejects a balance outside safe monetary range: %s", (value) => {
      expect(parseWalletBalance(value).isValid).toBe(false);
      const data = makeData(); data.wallets.main = value as number;
      const reconciled = reconcileWalletBalances(data);
      expect(reconciled.isComplete).toBe(false);
      expect(reconciled.totalLiquid).toBe(50);
    },
  );
});
