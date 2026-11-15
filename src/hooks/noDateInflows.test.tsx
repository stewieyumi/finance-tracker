import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Receivable, UnifiedFinanceData } from "../types/finance";
import { useFinanceCalculations } from "./useFinanceCalculations";
import { applyAddPayment, applyReceiptReplay, applyReceivableStatusToggle, useReceivableActions } from "./useReceivableActions";
import { applyReceivableEdit } from "./useReceivableSaveActions";
import { useCloudSync } from "./useCloudSync";
import { noDateIncomeReceived, noDateInflowState } from "../utils/noDateInflows";
import { groupReceivablesByHalf } from "../utils/receivablesHelpers";
import { calculateCashflowMomentum } from "../utils/financialAnalytics";
import { isValidFinanceBackup } from "../utils/validationHelpers";

const rec: Receivable = { id: "one", name: "Client payment", amount: 5000, wallet: "main", frequency: "No Specific Date", startMonth: "November 2026" };
const data = (): UnifiedFinanceData => ({ wallets: { main: 1000, other: 500 }, settings: { defaultWallet: "main", customWallets: [{ id: "main", label: "Main" }, { id: "other", label: "Other" }] }, library: { bills: [], receivables: [{ ...rec }], shoots: [] }, logs: {} });
const calc = (d: UnifiedFinanceData, month: string) => {
  const h = renderHook(() => useFinanceCalculations(d, month));
  const value = h.result.current; h.unmount(); return value;
};
const credit = (d: UnifiedFinanceData, month: string, amount: number) => {
  const result = applyAddPayment(d, calc(d, month).activeReceivables[0], amount, month);
  expect(result.ok).toBe(true); if (!result.ok) throw Error(result.error);
  return result;
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 15, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("one-time no-date inflow occurrence", () => {
  it("starts in the stored creation month and does not invent a due date", () => {
    expect(calc(data(), "October 2026").activeReceivables).toEqual([]);
    const view = calc(data(), "November 2026").activeReceivables[0];
    expect(view).toMatchObject({ frequency: "No Specific Date", targetMonthForDue: "November 2026", amountReceived: 0, collected: false, needsScheduleReview: false });
    expect(view.date).toBeUndefined(); expect(view.needsDate).not.toBe(true);
  });
  it("carries only the remaining balance across months and stops after full collection", () => {
    const first = credit(data(), "November 2026", 2000);
    expect(first.data.wallets.main).toBe(3000);
    expect(calc(first.data, "December 2026")).toMatchObject({ totalPendingReceivables: 3000, monthIncomeCollected: 0 });
    expect(calc(first.data, "December 2026").activeReceivables[0].targetMonthForDue).toBe("November 2026");
    vi.setSystemTime(new Date(2026, 11, 15, 12));
    const second = credit(first.data, "December 2026", 3000);
    expect(second.data.wallets.main).toBe(6000);
    expect(Object.keys(second.data.logs)).toEqual(["November 2026"]);
    expect(calc(second.data, "January 2027").activeReceivables).toEqual([]);
    expect(calc(second.data, "November 2026").activeReceivables[0].collected).toBe(true);
    expect(calc(second.data, "November 2026").monthIncomeCollected).toBe(2000);
    expect(calc(second.data, "December 2026").monthIncomeCollected).toBe(3000);
  });
  it("undoes and redoes the last receipt once using its original wallet, reopening the same occurrence", () => {
    const first = credit(data(), "November 2026", 2000);
    vi.setSystemTime(new Date(2026, 11, 15, 12));
    const second = credit(first.data, "December 2026", 3000);
    second.data.library.receivables[0].wallet = "other";
    second.data.settings!.customWallets = [{ id: "other", label: "Other" }];
    second.data.settings!.archivedWallets = [{ id: "main", label: "Main" }];
    const undo = applyReceiptReplay(second.data, second.change!);
    expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(undo.data.wallets).toEqual({ main: 3000, other: 500 });
    expect(calc(undo.data, "December 2026").totalPendingReceivables).toBe(3000);
    expect(applyReceiptReplay(undo.data, second.change!).ok).toBe(false);
    const redo = applyReceiptReplay(undo.data, second.change!, undo.change!.previousPaymentDate);
    expect(redo.ok).toBe(true); if (!redo.ok) return;
    expect(redo.data.wallets).toEqual({ main: 6000, other: 500 });
    expect(calc(redo.data, "January 2027").activeReceivables).toEqual([]);
    expect(applyReceiptReplay(redo.data, second.change!, undo.change!.previousPaymentDate).ok).toBe(false);
  });
  it("rejects stale repeated credits, a moved occurrence, and duplicate live IDs without mutation", () => {
    const d = data(), view = calc(d, "November 2026").activeReceivables[0];
    const paid = applyAddPayment(d, view, 2000, "November 2026");
    expect(paid.ok).toBe(true); if (!paid.ok) return;
    expect(applyAddPayment(paid.data, view, 2000, "December 2026")).toMatchObject({ ok: false, data: paid.data });
    const moved = data(); moved.library.receivables[0].startMonth = "December 2026";
    expect(applyAddPayment(moved, view, 2000, "November 2026")).toMatchObject({ ok: false, data: moved });
    const duplicate = data(); duplicate.library.receivables.push({ ...rec });
    expect(applyAddPayment(duplicate, view, 2000, "November 2026").ok).toBe(false);
    expect(d.wallets.main).toBe(1000);
  });
  it.each([undefined, "", "Nov 2026", "Bogus 2026", "November 2026 extra"])("flags an invalid anchor instead of shifting it: %s", anchor => {
    const d = data(); d.library.receivables[0].startMonth = anchor;
    const view = calc(d, "December 2026").activeReceivables[0];
    expect(view.needsScheduleReview).toBe(true);
    expect(applyAddPayment(d, view, 100, "December 2026")).toMatchObject({ ok: false, data: d });
  });
  it("does not truncate an unpaid occurrence after 120 months", () => {
    expect(calc(data(), "November 2040").activeReceivables[0].targetMonthForDue).toBe("November 2026");
  });
  it("flags unexpected additional occurrence buckets rather than crediting another month", () => {
    const d = data(); d.logs["December 2026"] = { recsCollected: { one: { amountReceived: 0, collected: false } } };
    const view = calc(d, "December 2026").activeReceivables[0];
    expect(view.needsScheduleReview).toBe(true);
    expect(applyAddPayment(d, view, 100, "December 2026").ok).toBe(false);
  });
  it("blocks anchor edits after partial or reversed history, preserving all state", () => {
    const paid = credit(data(), "November 2026", 2000);
    expect(applyReceivableEdit(paid.data, "one", { startMonth: "December 2026" }, 5000)).toMatchObject({ ok: false, data: paid.data });
    const undone = applyReceiptReplay(paid.data, paid.change!);
    expect(undone.ok).toBe(true); if (!undone.ok) return;
    expect(applyReceivableEdit(undone.data, "one", { frequency: "Monthly" }, 5000)).toMatchObject({ ok: false, data: undone.data });
    expect(applyReceivableEdit(undone.data, "one", { startMonth: "December 2026" }, 5000).ok).toBe(false);
  });
  it("permits safe pre-history anchor edits and non-schedule edits after collection", () => {
    expect(applyReceivableEdit(data(), "one", { startMonth: "December 2026" }, 5000).ok).toBe(true);
    const paid = credit(data(), "November 2026", 2000);
    const edit = applyReceivableEdit(paid.data, "one", { name: "New label", wallet: "other" }, 5000);
    expect(edit.ok).toBe(true); if (edit.ok) expect(edit.data.logs).toEqual(paid.data.logs);
  });
  it("keeps legacy undated By Date records marked Needs Date", () => {
    const d = data(); d.library.receivables[0] = { ...rec, frequency: "By Date", startMonth: undefined, date: "" };
    expect(calc(d, "November 2026").activeReceivables[0]).toMatchObject({ needsDate: true, frequency: "By Date" });
    expect(d.library.receivables[0].frequency).toBe("By Date");
  });
  it("does not assign no-date inflows to either half-month filter or dated projections", () => {
    const d = data(), view = calc(d, "November 2026").activeReceivables[0];
    expect(groupReceivablesByHalf([view])).toEqual({ firstHalf: [], secondHalf: [] });
    expect(calculateCashflowMomentum(d, "November 2026").every(month => month.inflow === 0)).toBe(true);
  });
});

describe("no-date actual receipt accounting and persistence", () => {
  it("attributes receipts to actual local months/years, including completed and archived inflows", () => {
    const first = credit(data(), "November 2026", 2000);
    vi.setSystemTime(new Date(2027, 0, 1, 10));
    const second = credit(first.data, "January 2027", 3000);
    const persisted: UnifiedFinanceData = JSON.parse(JSON.stringify(second.data));
    expect(isValidFinanceBackup(persisted)).toBe(true);
    expect(noDateIncomeReceived(persisted, "2026")).toBe(2000);
    expect(noDateIncomeReceived(persisted, "2027")).toBe(3000);
    persisted.library.archivedReceivables = persisted.library.receivables;
    persisted.library.receivables = [];
    expect(calc(persisted, "January 2027").monthIncomeCollected).toBe(3000);
    expect(noDateIncomeReceived(persisted, "January 2027")).toBe(3000);
  });
  it("retains actual dates and wallet credits through the real latest-state committer", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
    const h = renderHook(() => {
      const [snapshot, setSnapshot] = React.useState(data());
      const sync = useCloudSync(snapshot, setSnapshot, vi.fn());
      const finance = useFinanceCalculations(snapshot, "December 2026");
      return { snapshot, sync, finance };
    });
    act(() => { h.result.current.sync.commitDataTransition(prev => applyAddPayment(prev, h.result.current.finance.activeReceivables[0], 2000, "December 2026")); });
    expect(h.result.current.snapshot.wallets.main).toBe(3000);
    expect(Object.keys(h.result.current.snapshot.logs)).toEqual(["November 2026"]);
    expect(h.result.current.finance.totalPendingReceivables).toBe(3000);
    expect(h.result.current.finance.monthIncomeCollected).toBe(0);
  });
  it("creates the anchor from the selected Add context without a fake date", () => {
    let snapshot = data(); snapshot.library.receivables = [];
    const h = renderHook(() => useReceivableActions({ globalData: snapshot, selectedMonth: "December 2026", showToast: vi.fn(), commitReceivableTransition: update => { const out = update(snapshot); if (out.ok) snapshot = out.data; return out; } }));
    act(() => h.result.current.addReceivable({ name: "New", amount: 100, frequency: "No Specific Date", category: "Other", wallet: "main" }));
    expect(snapshot.library.receivables[0]).toMatchObject({ startMonth: "December 2026", frequency: "No Specific Date", date: "" });
    expect(snapshot.wallets.main).toBe(1000);
  });
  it.each([NaN, Infinity, -1, 0, 0.001, 1e308])("rejects an invalid new no-date amount: %s", amount => {
    let snapshot = data(); const original = snapshot;
    const h = renderHook(() => useReceivableActions({ globalData: snapshot, selectedMonth: "November 2026", showToast: vi.fn(), commitReceivableTransition: update => { const out = update(snapshot); if (out.ok) snapshot = out.data; return out; } }));
    act(() => h.result.current.addReceivable({ name: "Invalid", amount, frequency: "No Specific Date", category: "Other" }));
    expect(snapshot).toBe(original);
  });
  it("flags a collected cache with missing receipts rather than inventing an income date", () => {
    const d = data(); d.logs["November 2026"] = { recsCollected: { one: { amountReceived: 2000, collected: false } } };
    expect(noDateInflowState(d, rec, "December 2026").valid).toBe(false);
    expect(noDateIncomeReceived(d, "November 2026")).toBe(0);
  });
});


it("collects a no-date inflow in full and reverses it without creating a second occurrence", () => {
  const initial = data();
  const view = calc(initial, "December 2026").activeReceivables[0];
  const paid = applyReceivableStatusToggle(initial, view, "December 2026");
  expect(paid.ok).toBe(true); if (!paid.ok) return;
  expect(paid.data.wallets.main).toBe(6000);
  expect(Object.keys(paid.data.logs)).toEqual(["November 2026"]);
  expect(applyReceivableStatusToggle(paid.data, view, "December 2026").ok).toBe(false);
  const settled = calc(paid.data, "November 2026").activeReceivables[0];
  const reversed = applyReceivableStatusToggle(paid.data, settled, "November 2026");
  expect(reversed.ok).toBe(true); if (!reversed.ok) return;
  expect(reversed.data.wallets.main).toBe(1000);
  expect(calc(reversed.data, "January 2027").totalPendingReceivables).toBe(5000);
  expect(noDateIncomeReceived(reversed.data, "November 2026")).toBe(0);
  expect(Object.keys(reversed.data.logs)).toEqual(["November 2026"]);
});
