import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivableFrequency, UnifiedFinanceData } from "../types/finance";
import { useFinanceCalculations } from "./useFinanceCalculations";
import { applyAddPayment, applyReceiptReplay } from "./useReceivableActions";
import { readInflowIncome } from "../utils/inflowIncome";
import { buildFinancialSummary } from "../utils/summaryHelpers";
import { useCloudSync } from "./useCloudSync";

const fixture = (frequency: ReceivableFrequency): UnifiedFinanceData => ({
  wallets: { main: 1000 }, settings: { customWallets: [{ id: "main", label: "Main" }], defaultWallet: "main" },
  library: { bills: [], shoots: [], receivables: [{ id: "client", name: "Client", amount: 5000, frequency, startMonth: "November 2026", date: frequency === "By Date" ? "2026-11-15" : "", monthlyDay: 15, biMonthlyDays: [5, 20], wallet: "main" }] }, logs: {}
});
const calc = (data: UnifiedFinanceData, month: string) => {
  const hook = renderHook(() => useFinanceCalculations(data, month));
  const value = hook.result.current; hook.unmount(); return value;
};
const receive = (data: UnifiedFinanceData, selected: string, amount: number) => {
  const view = calc(data, selected).activeReceivables.find(r => r.id === "client")!;
  const result = applyAddPayment(data, view, amount, selected);
  expect(result.ok).toBe(true); if (!result.ok) throw Error(result.error); return result;
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 15, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("actual income independent of Plan occurrences", () => {
  it.each(["By Date", "Monthly", "Bi-monthly", "No Specific Date"] as const)("reports partial carry, completion, archive and Undo/Redo correctly for %s", frequency => {
    const first = receive(fixture(frequency), "November 2026", 2000);
    expect(calc(first.data, "December 2026").monthIncomeCollected).toBe(0);
    expect(calc(first.data, "December 2026").activeReceivables[0]).toMatchObject({ targetMonthForDue: "November 2026", amountReceived: 2000 });
    vi.setSystemTime(new Date(2026, 11, 15, 12));
    const second = receive(first.data, "December 2026", 3000);
    const snapshot = JSON.stringify(second.data);
    expect(calc(second.data, "November 2026").monthIncomeCollected).toBe(2000);
    expect(calc(second.data, "December 2026").monthIncomeCollected).toBe(3000);
    expect(readInflowIncome(second.data, "2026").actual).toBe(5000);
    expect(second.data.wallets.main).toBe(6000);
    expect(Object.keys(second.data.logs)).toEqual(["November 2026"]);
    expect(JSON.stringify(second.data)).toBe(snapshot);

    const archived = { ...second.data, library: { ...second.data.library, archivedReceivables: second.data.library.receivables, receivables: [] } };
    expect(calc(archived, "November 2026").monthIncomeCollected).toBe(2000);
    expect(calc(archived, "December 2026").monthIncomeCollected).toBe(3000);
    expect(readInflowIncome(archived, "2026").actual).toBe(5000);
    expect(archived.wallets).toBe(second.data.wallets);

    const undo = applyReceiptReplay(second.data, second.change!);
    expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect(calc(undo.data, "December 2026").monthIncomeCollected).toBe(0);
    expect(calc(undo.data, "November 2026").monthIncomeCollected).toBe(2000);
    expect(undo.data.wallets.main).toBe(3000);
    expect(applyReceiptReplay(undo.data, second.change!).ok).toBe(false);
    const redo = applyReceiptReplay(undo.data, second.change!, undo.change!.previousPaymentDate);
    expect(redo.ok).toBe(true); if (!redo.ok) return;
    expect(calc(redo.data, "December 2026").monthIncomeCollected).toBe(3000);
    expect(calc(redo.data, "November 2026").monthIncomeCollected).toBe(2000);
    expect(redo.data.wallets.main).toBe(6000);
    expect(applyReceiptReplay(redo.data, second.change!, undo.change!.previousPaymentDate).ok).toBe(false);
    expect(readInflowIncome(redo.data, "2026").actual).toBe(5000);
  });

  it.each(["By Date", "Monthly", "Bi-monthly"] as const)("recognizes cross-year receipts for %s without relocating stored logs", frequency => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    const first = receive(fixture(frequency), "December 2026", 2000);
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
    const second = receive(first.data, "January 2027", 3000);
    expect(readInflowIncome(second.data, "2026").actual).toBe(2000);
    expect(readInflowIncome(second.data, "2027").actual).toBe(3000);
    expect(calc(second.data, "January 2027").monthIncomeCollected).toBe(3000);
    expect(Object.keys(second.data.logs)).toEqual(["November 2026"]);
  });

  it.each(["Monthly", "Bi-monthly"] as const)("counts two occurrence payments received in one real month for %s", frequency => {
    vi.setSystemTime(new Date(2026, 11, 5, 12));
    const first = receive(fixture(frequency), "December 2026", 5000);
    const second = receive(first.data, "December 2026", 4000);
    expect(Object.keys(second.data.logs)).toEqual(["November 2026", "December 2026"]);
    expect(calc(second.data, "December 2026").monthIncomeCollected).toBe(9000);
    expect(calc(second.data, "November 2026").monthIncomeCollected).toBe(0);
    expect(second.data.wallets.main).toBe(10000);
  });

  it("includes an actual receipt before its scheduled occurrence in the actual reporting month", () => {
    const data = fixture("By Date");data.library.receivables[0].date = "2026-12-15";
    const paid = receive(data, "December 2026", 5000);
    expect(calc(paid.data, "November 2026").activeReceivables).toEqual([]);
    expect(calc(paid.data, "November 2026").monthIncomeCollected).toBe(5000);
    expect(calc(paid.data, "December 2026").monthIncomeCollected).toBe(0);
  });

  it("gives copied summaries the same actual/legacy/review result as the dashboard hook", () => {
    const d=fixture("Monthly");d.logs["November 2026"]={recsCollected:{client:{amountReceived:1000,collected:false}},receivableSettlements:{client:[{id:"p",amount:800,wallet:"main",walletCredit:800,receivedAt:"2026-11-15T04:00:00Z"}]}};
    const c=calc(d,"November 2026");
    const text=buildFinancialSummary({ globalData:d, selectedMonth:"November 2026", activeBills:[], activeReceivables:c.activeReceivables, totalLiquid:c.totalLiquid, totalUnpaidCommitments:0, overdueBills:[], targetMilestoneFund:0, fundProgressPercent:"0", incomeReport:c.incomeReport });
    expect(c.monthIncomeCollected).toBe(800);
    expect(text).toContain("Month Income Collected: ₱800.00 (actual Inflows receipts)");
    expect(text).toContain("Historical income — date unverified: ₱200.00");
    expect(text).not.toContain("Month Income Collected: ₱1,000.00");
  });

  it("updates the actual report through the existing latest-state cloud committer", () => {
    const stored = new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v),removeItem:(k:string)=>stored.delete(k)});
    const h=renderHook(()=>{const [snapshot,setSnapshot]=React.useState(fixture("Monthly"));const sync=useCloudSync(snapshot,setSnapshot,vi.fn());const calculations=useFinanceCalculations(snapshot,"December 2026");return{sync,calculations,snapshot};});
    act(()=>{h.result.current.sync.commitDataTransition(prev=>applyAddPayment(prev,h.result.current.calculations.activeReceivables[0],2000,"December 2026"));});
    expect(h.result.current.calculations.monthIncomeCollected).toBe(0);
    expect(readInflowIncome(h.result.current.snapshot,"November 2026").actual).toBe(2000);
    expect(h.result.current.snapshot.wallets.main).toBe(3000);
    expect(Object.keys(h.result.current.snapshot.logs)).toEqual(["November 2026"]);
  });
});
