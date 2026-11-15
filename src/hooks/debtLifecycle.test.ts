import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useCloudSync } from "./useCloudSync";
import { isValidFinanceData } from "../utils/validationHelpers";
import { describe, expect, it, afterEach, vi } from "vitest";
import type { Bill, BillViewModel, BillSettlement, UnifiedFinanceData } from "../types/finance";
import { applyBillStatusToggle, applyConfirmPriorBillPayments } from "./useBillActions";
import { reconcileDebt } from "../utils/debtReconciliation";

const bill: Bill = { id: "loan", name: "Phone", amount: 100, dueDay: "15", type: "Loan / Installment", wallet: "main", startMonth: "January 2026", endMonth: "January 2026" };
const initial = (): UnifiedFinanceData => ({ settings: { defaultWallet: "main", customWallets: [{ id: "main", label: "Main" }] }, wallets: { main: 1000 }, library: { bills: [bill], shoots: [], receivables: [] }, logs: {} });
const view = (paid: boolean): BillViewModel => ({ ...bill, baseAmount: 100, paid, targetMonthForDue: "January 2026", daysLeft: 0, isOverridden: false });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("B2 real bill lifecycle and persistence", () => {
  it("retains cross-month intervals through repeated Undo/Redo with the same identity and exact wallet effect", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    const paid = applyBillStatusToggle(initial(), view(false), "January 2026");
    expect(paid.ok).toBe(true); if (!paid.ok) return;
    const id = paid.settlementId!;
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const undone = applyBillStatusToggle(paid.data, view(true), "January 2026", false, false, id);
    expect(undone.ok).toBe(true); if (!undone.ok) return;
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
    const redone = applyBillStatusToggle(undone.data, view(false), "January 2026", false, true, id, undone.reversedAt);
    expect(redone.ok).toBe(true); if (!redone.ok) return;
    const persisted: UnifiedFinanceData = JSON.parse(JSON.stringify(redone.data));
    expect(persisted.logs["January 2026"].billSettlements!.loan[0]).toMatchObject({ id, historyComplete: true, paidAt: "2026-01-15T12:00:00.000Z", statusHistory: [{ paid: true, at: "2026-01-15T12:00:00.000Z" }, { paid: false, at: "2026-03-15T12:00:00.000Z" }, { paid: true, at: "2026-04-15T12:00:00.000Z" }] });
    expect(persisted.wallets.main).toBe(900);
    expect(reconcileDebt(persisted, "February 2026").totalPaid).toBe(100);
    expect(reconcileDebt(persisted, "March 2026").totalPaid).toBe(0);
    expect(reconcileDebt(persisted, "April 2026").totalPaid).toBe(100);
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
    const twice = applyBillStatusToggle(persisted, view(true), "January 2026", false, false, id);
    expect(twice.ok).toBe(true); if (!twice.ok) return;
    expect(twice.data.wallets.main).toBe(1000);
    expect(reconcileDebt(twice.data, "March 2026").totalPaid).toBe(0);
    expect(reconcileDebt(twice.data, "April 2026").totalPaid).toBe(100);
    expect(reconcileDebt(twice.data, "May 2026").totalPaid).toBe(0);
    expect(applyBillStatusToggle(twice.data, view(true), "January 2026", false, false, id).ok).toBe(false);
  });
  it("keeps archived-wallet reversal provenance and does not invent completeness for old records", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const d = initial(); d.settings!.customWallets = []; d.settings!.archivedWallets = [{ id: "main", label: "Old" }]; d.wallets.main = 900;
    d.logs["January 2026"] = { billsPaid: ["loan"], billSettlements: { loan: [{ id: "old", paidAt: "2026-01-15T12:00:00Z", amount: 100, wallet: "main", walletDebit: 100 }] } };
    const result = applyBillStatusToggle(d, view(true), "January 2026", false, false, "old");
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.wallets.main).toBe(1000);
    expect(result.data.logs["January 2026"].billSettlements!.loan[0].historyComplete).toBe(false);
    expect(reconcileDebt(result.data, "February 2026")).toMatchObject({ totalPaid: 100, approximate: true });
  });
  it("rejects stale routes without introducing any lifecycle record", () => {
    const d = initial(); d.library.bills = [{ ...bill, wallet: "other" }];
    const result = applyBillStatusToggle(d, view(false), "January 2026");
    expect(result).toMatchObject({ ok: false, data: d });
    expect(result.data.logs).toEqual({});
  });
  it("retains prior-confirmation history without changing balances", () => {
    const d = initial(); const result = applyConfirmPriorBillPayments(d, "loan", ["January 2026"], new Date("2026-03-15T12:00:00Z"));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.wallets).toEqual(d.wallets);
    expect(result.data.logs["January 2026"].billSettlements!.loan[0]).toMatchObject({ historyComplete: true, priorConfirmation: true, walletDebit: 0 });
    expect(reconcileDebt(result.data, "January 2026", new Date("2026-04-15T12:00:00Z"))).toMatchObject({ totalPaid: 100, approximate: true });
  });
});


it("preserves lifecycle metadata through the actual latest-state committer and JSON rehydration", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k), clear: () => values.clear(), key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; } });
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  const { result } = renderHook(() => {
    const [data, setData] = React.useState(initial());
    const sync = useCloudSync(data, setData, vi.fn());
    return { data, sync };
  });
  act(() => { result.current.sync.commitDataTransition(prev => applyBillStatusToggle(prev, view(false), "January 2026")); });
  const id = result.current.data.logs["January 2026"].billSettlements!.loan[0].id;
  vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  act(() => { result.current.sync.commitDataTransition(prev => applyBillStatusToggle(prev, view(true), "January 2026", false, false, id)); });
  const reversed = result.current.data.logs["January 2026"].billSettlements!.loan[0].reversedAt;
  vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
  act(() => { result.current.sync.commitDataTransition(prev => applyBillStatusToggle(prev, view(false), "January 2026", false, true, id, reversed)); });
  const wireRecord = JSON.parse(JSON.stringify({ data: result.current.data, revision: 2 }));
  expect(isValidFinanceData(wireRecord.data)).toBe(true);
  expect(wireRecord.data.logs["January 2026"].billSettlements.loan[0].statusHistory).toHaveLength(3);
  expect(reconcileDebt(wireRecord.data, "March 2026").totalPaid).toBe(0);
  expect(result.current.data.wallets.main).toBe(900);
});


it("keeps legacy paid-marker history on a new undo without inventing a wallet refund", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  const d = initial(); d.logs["January 2026"] = { billsPaid: ["loan"] };
  const result = applyBillStatusToggle(d, view(true), "January 2026");
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.data.wallets).toEqual(d.wallets);
  expect(result.data.logs["January 2026"].billSettlements!.loan[0]).toMatchObject({ walletDebit: 0, wallet: null, priorConfirmation: true, historyComplete: false });
  expect(reconcileDebt(result.data, "February 2026")).toMatchObject({ totalPaid: 100, approximate: true });
  expect(reconcileDebt(result.data, "March 2026").totalPaid).toBe(0);
});

it("retains a known late legacy payment date when undoing its status", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
  const d = initial(); d.logs["January 2026"] = { billsPaid: ["loan"], paymentDates: { loan: "2026-03-15T12:00:00Z" } };
  const result = applyBillStatusToggle(d, view(true), "January 2026");
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.data.wallets.main).toBe(1000);
  expect(reconcileDebt(result.data, "February 2026").totalPaid).toBe(0);
  expect(reconcileDebt(result.data, "March 2026").totalPaid).toBe(100);
  expect(reconcileDebt(result.data, "April 2026").totalPaid).toBe(0);
});

it("does not replace an existing malformed settlement list with invented legacy history", () => {
  const d = initial(); const rows = [null as unknown as BillSettlement];
  d.logs["January 2026"] = { billsPaid: ["loan"], billSettlements: { loan: rows } };
  const result = applyBillStatusToggle(d, view(true), "January 2026");
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.data.wallets).toEqual(d.wallets);
  expect(result.data.logs["January 2026"].billSettlements!.loan).toBe(rows);
});
