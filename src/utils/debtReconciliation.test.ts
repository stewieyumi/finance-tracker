import { describe, expect, it } from "vitest";
import type { Bill, BillSettlement, UnifiedFinanceData } from "../types/finance";
import { reconcileDebt } from "./debtReconciliation";

const now = new Date("2026-11-15T12:00:00Z");
const loan: Bill = { id: "loan", name: "Phone", amount: 100, dueDay: "15", type: "Loan / Installment", startMonth: "January 2026", endMonth: "March 2026", wallet: "main" };
const data = (bill: Bill = loan): UnifiedFinanceData => ({ wallets: { main: 1000 }, settings: { customWallets: [{ id: "main", label: "Main" }] }, library: { bills: [bill], shoots: [], receivables: [] }, logs: {} });
const payment = (extra: Partial<BillSettlement> = {}): BillSettlement => ({ id: "pay", paidAt: "2026-01-15T12:00:00Z", amount: 100, wallet: "main", walletDebit: 100, historyComplete: true, statusHistory: [{ paid: true, at: "2026-01-15T12:00:00Z" }], ...extra });
function add(d: UnifiedFinanceData, month: string, entry: BillSettlement) {
  d.logs[month] = { billsPaid: entry.reversedAt ? [] : ["loan"], billSettlements: { loan: [entry] } };
  return d;
}

describe("B2 debt reconciliation", () => {
  it("does not backdate a March payment of a January installment", () => {
    const at = "2026-03-15T12:00:00Z";
    const d = add(data(), "January 2026", payment({ paidAt: at, statusHistory: [{ paid: true, at }] }));
    expect(reconcileDebt(d, "January 2026", now).totalPaid).toBe(0);
    expect(reconcileDebt(d, "March 2026", now).totalPaid).toBe(100);
  });
  it("counts an early payment from its actual date, even for a later installment", () => {
    const d = add(data(), "March 2026", payment());
    const result = reconcileDebt(d, "January 2026", now);
    expect(result.totalPaid).toBe(100);
    expect(result.loans[0].paidInstallments).toBe(1);
    expect(result.remainingScheduled).toBe(200);
  });
  it("retains a payment in earlier months after a later reversal", () => {
    const at = "2026-03-15T12:00:00Z";
    const d = add(data(), "January 2026", payment({ reversedAt: at, statusHistory: [{ paid: true, at: "2026-01-15T12:00:00Z" }, { paid: false, at }] }));
    expect(reconcileDebt(d, "February 2026", now).totalPaid).toBe(100);
    expect(reconcileDebt(d, "March 2026", now).totalPaid).toBe(0);
  });
  it("uses captured amounts and treats settled installments as satisfied after edits", () => {
    const d = add(data(), "January 2026", payment({ amount: 80, walletDebit: 80 }));
    d.logs["January 2026"].billOverrides = { loan: 150 };
    const result = reconcileDebt(d, "February 2026", now);
    expect(result.totalPaid).toBe(80);
    expect(result.remainingScheduled).toBe(200);
    d.library.bills[0] = { ...loan, amount: 200 };
    expect(reconcileDebt(d, "February 2026", now).totalPaid).toBe(80);
    expect(reconcileDebt(d, "February 2026", now).remainingScheduled).toBe(400);
  });
  it("retains completed and archived payments without counting an active loan", () => {
    const d = add(data({ ...loan, endMonth: "January 2026" }), "January 2026", payment({ amount: 80, walletDebit: 80 }));
    d.library.archivedBills = d.library.bills;
    d.library.bills = [];
    const result = reconcileDebt(d, "February 2026", now);
    expect(result.completedLoans).toHaveLength(1);
    expect(result.activeLoans).toHaveLength(0);
    expect(result.totalPaid).toBe(80);
    expect(result.remainingScheduled).toBe(0);
    expect(result.completedLoans[0].archived).toBe(true);
  });
  it("keeps unpaid archived installments as outstanding without restoring Plan", () => {
    const d = data(); d.library.archivedBills = d.library.bills; d.library.bills = [];
    expect(reconcileDebt(d, "February 2026", now).remainingScheduled).toBe(300);
    expect(reconcileDebt(d, "February 2026", now).activeLoans[0].archived).toBe(true);
    expect(d.library.bills).toEqual([]);
  });
  it("separates future scheduled loans from current active debt", () => {
    const result = reconcileDebt(data({ ...loan, startMonth: "July 2026", endMonth: "September 2026" }), "May 2026", now);
    expect(result.activeLoans).toHaveLength(0);
    expect(result.upcomingLoans).toHaveLength(1);
    expect(result.remainingScheduled).toBe(0);
  });
  it("does not count future actual payments in a future selected month", () => {
    const at = "2026-12-15T12:00:00Z";
    const result = reconcileDebt(add(data(), "January 2026", payment({ paidAt: at, statusHistory: [{ paid: true, at }] })), "December 2026", now);
    expect(result.totalPaid).toBe(0);
  });
  it("uses an exclusive local month boundary, including an offset timestamp", () => {
    const boundary = new Date(2026, 1, 1).getTime();
    const at = new Date(boundary).toISOString();
    const d = add(data(), "January 2026", payment({ paidAt: at, statusHistory: [{ paid: true, at }] }));
    expect(reconcileDebt(d, "January 2026", now).totalPaid).toBe(0);
    const before = new Date(boundary - 1).toISOString();
    d.logs["January 2026"].billSettlements!.loan = [payment({ paidAt: before, statusHistory: [{ paid: true, at: before }] })];
    expect(reconcileDebt(d, "January 2026", now).totalPaid).toBe(100);
    const offset = "2026-02-01T00:30:00+08:00";
    d.logs["January 2026"].billSettlements!.loan = [payment({ paidAt: offset, statusHistory: [{ paid: true, at: offset }] })];
    expect(reconcileDebt(d, "January 2026", now).totalPaid).toBe(Date.parse(offset) < boundary ? 100 : 0);
  });
  it("labels flags-only legacy data as approximate and respects a known legacy date", () => {
    const d = data(); d.logs["January 2026"] = { billsPaid: ["loan"] };
    expect(reconcileDebt(d, "January 2026", now)).toMatchObject({ totalPaid: 100, approximate: true, isComplete: true });
    d.logs["January 2026"].paymentDates = { loan: "2026-03-15T12:00:00Z" };
    expect(reconcileDebt(d, "February 2026", now).totalPaid).toBe(0);
  });
  it("uses occurrence approximation for prior-paid confirmations and never treats them as cash debits", () => {
    const at = "2026-03-15T12:00:00Z";
    const d = add(data(), "January 2026", payment({ paidAt: at, priorConfirmation: true, wallet: null, walletDebit: 0, statusHistory: [{ paid: true, at }] }));
    expect(reconcileDebt(d, "January 2026", now)).toMatchObject({ totalPaid: 100, approximate: true });
    expect(d.wallets.main).toBe(1000);
  });
  it("supports old settlement pairs but does not claim erased redo intervals are exact", () => {
    const d = add(data(), "January 2026", payment({ statusHistory: undefined, historyComplete: undefined, reversedAt: "2026-03-15T12:00:00Z" }));
    expect(reconcileDebt(d, "February 2026", now)).toMatchObject({ totalPaid: 100, approximate: true });
  });
  it.each([null, NaN, Infinity, -1, 0.001, 0.000000001, 1e308, "100oops"])("discloses invalid payment amount %s rather than an exact zero", amount => {
    const result = reconcileDebt(add(data(), "January 2026", payment({ amount: amount as number })), "February 2026", now);
    expect(result.isComplete).toBe(false);
    expect(result.loans[0].remainingScheduled).toBeNull();
  });
  it.each(["bad", "2026-02-30T12:00:00Z", "2026-01-15", "2026-01-15T24:00:00Z", ""])("discloses invalid payment time %s", paidAt => {
    expect(reconcileDebt(add(data(), "January 2026", payment({ paidAt })), "February 2026", now).isComplete).toBe(false);
  });
  it.each([
    [],
    [{ paid: false, at: "2026-01-15T12:00:00Z" }],
    [{ paid: true, at: "2026-01-15T12:00:00Z" }, { paid: true, at: "2026-02-15T12:00:00Z" }],
    [{ paid: true, at: "2026-01-15T12:00:00Z" }, { paid: false, at: "2026-01-01T12:00:00Z" }]
  ].map(statusHistory => ({ statusHistory })))("discloses malformed or inconsistent status history", ({ statusHistory }) => {
    expect(reconcileDebt(add(data(), "January 2026", payment({ statusHistory })), "February 2026", now).isComplete).toBe(false);
  });
  it("rejects duplicate loan and settlement IDs from exact aggregates", () => {
    const d = add(data(), "January 2026", payment());
    d.logs["February 2026"] = structuredClone(d.logs["January 2026"]);
    expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
    const duplicate = data(); duplicate.library.archivedBills = [loan];
    const result = reconcileDebt(duplicate, "February 2026", now);
    expect(result.loans).toHaveLength(1);
    expect(result.isComplete).toBe(false);
  });
  it("discloses overlapping live settlements and mismatched paid flags", () => {
    const d = add(data(), "January 2026", payment());
    d.logs["January 2026"].billSettlements!.loan.push(payment({ id: "second" }));
    expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
    d.logs["January 2026"].billSettlements!.loan.pop(); d.logs["January 2026"].billsPaid = [];
    expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
  });
  it("does not truncate a valid 121-month schedule at the old 120-month limit", () => {
    const result = reconcileDebt(data({ ...loan, startMonth: "January 2020", endMonth: "January 2030" }), "November 2026", now);
    expect(result.isComplete).toBe(true);
    expect(result.remainingScheduled).toBe(12100);
  });
  it.each([
    { startMonth: "invalid", endMonth: "March 2026" },
    { startMonth: "April 2026", endMonth: "March 2026" },
    { startMonth: "January 1000", endMonth: "January 9999" },
    { amount: NaN }, { amount: -1 }, { amount: 0.001 }
  ])("keeps malformed or unsafe schedules visibly incomplete", patch => {
    expect(reconcileDebt(data({ ...loan, ...patch }), "February 2026", now).loans[0].status).toBe("incomplete");
  });
  it("detects overflow across individually valid loans", () => {
    const d = data({ ...loan, amount: 90000000000000, endMonth: "January 2026" });
    d.library.bills.push({ ...d.library.bills[0], id: "other" });
    expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
  });
  it("never mutates source data or current pay flags while showing historical metrics", () => {
    const d = add(data(), "January 2026", payment());
    const before = JSON.stringify(d);
    reconcileDebt(d, "February 2026", now);
    expect(JSON.stringify(d)).toBe(before);
  });
});


it.each([null, "", "bad"])("does not silently accept malformed reversal timestamp %s", reversedAt => {
  const d = add(data(), "January 2026", payment({ reversedAt: reversedAt as string }));
  expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
});


it.each([null, undefined, 1, "broken", [], { billsPaid: 1 }, { billsPaid: [null] }, { billSettlements: [] }, { billOverrides: "bad" }, { paymentDates: null }])(
  "keeps malformed month logs visible as unknown without crashing: %j", log => {
    const d = data(); d.logs["January 2026"] = log as unknown as UnifiedFinanceData["logs"][string];
    const before = JSON.stringify(d);
    const result = reconcileDebt(d, "February 2026", now);
    expect(result.isComplete).toBe(false);
    expect(result.loans[0].remainingScheduled).toBeNull();
    expect(result.loans[0].status).toBe("incomplete");
    expect(JSON.stringify(d)).toBe(before);
    d.library.bills = [];
    expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
  }
);

it.each([null, [], "bad"])("does not call an unreadable root log map debt-free: %j", logs => {
  const d = data(); d.logs = logs as unknown as UnifiedFinanceData["logs"];
  expect(reconcileDebt(d, "February 2026", now).isComplete).toBe(false);
});


describe("debt overview reporting", () => {
  it("uses selected-month overrides, including settled installments, without changing records", () => {
    const d = add(data(), "January 2026", payment({ amount: 80, walletDebit: 80 }));
    d.logs["January 2026"].billOverrides = { loan: 150.25 };
    const before = structuredClone(d);
    expect(reconcileDebt(d, "January 2026", now)).toMatchObject({ monthlyScheduled: 150.25, remainingScheduled: 200, totalPaid: 80, scheduledFinish: "March 2026", finishStatus: "scheduled" });
    expect(d).toEqual(before);
  });
  it("includes archived active debt and keeps upcoming plans separate while including their finish", () => {
    const d = data(); d.library.archivedBills = [{ ...loan, id: "archived", amount: 50 }];
    d.library.bills.push({ ...loan, id: "future", amount: 200, startMonth: "December 2026", endMonth: "January 2027" });
    expect(reconcileDebt(d, "February 2026", now)).toMatchObject({ monthlyScheduled: 150, remainingScheduled: 450, upcomingScheduled: 400, scheduledFinish: "January 2027" });
    expect(reconcileDebt(d, "December 2026", now).monthlyScheduled).toBe(200);
  });
  it("shows overdue schedules rather than a promised debt-free date", () => {
    expect(reconcileDebt(data(), "November 2026", now)).toMatchObject({ monthlyScheduled: 0, scheduledFinish: null, finishStatus: "past-due" });
  });
  it("does not claim all debt is cleared when only upcoming plans exist", () => {
    const d = data({ ...loan, startMonth: "December 2026", endMonth: "January 2027" });
    expect(reconcileDebt(d, "November 2026", now)).toMatchObject({ activeLoans: [], remainingScheduled: 0, upcomingScheduled: 200, scheduledFinish: "January 2027", finishStatus: "scheduled" });
  });
  it("suppresses monthly totals and finish dates for incomplete schedules and duplicate IDs", () => {
    const d = data(); d.library.bills.push({ ...loan });
    expect(reconcileDebt(d, "January 2026", now)).toMatchObject({ monthlyScheduled: null, scheduledFinish: null, finishStatus: "review", upcomingScheduled: null });
    expect(reconcileDebt(data({ ...loan, endMonth: undefined }), "January 2026", now).finishStatus).toBe("review");
  });
  it("rejects malformed selected-month amounts even when a captured payment settles it", () => {
    const d = add(data(), "January 2026", payment());
    d.logs["January 2026"].billOverrides = { loan: NaN };
    expect(reconcileDebt(d, "January 2026", now).monthlyScheduled).toBeNull();
  });
  it("reports completed plans and empty records without a fabricated finish date", () => {
    const d = add(data({ ...loan, endMonth: "January 2026" }), "January 2026", payment());
    expect(reconcileDebt(d, "February 2026", now)).toMatchObject({ monthlyScheduled: 0, remainingScheduled: 0, scheduledFinish: null, finishStatus: "none" });
    d.library.bills = []; d.logs = {};
    expect(reconcileDebt(d, "February 2026", now).finishStatus).toBe("none");
  });
  it("guards aggregate scheduled amounts against money overflow", () => {
    const d = data({ ...loan, amount: 80000000000000, endMonth: "January 2026" });
    d.library.bills.push({ ...d.library.bills[0], id: "second" });
    expect(reconcileDebt(d, "January 2026", now).monthlyScheduled).toBeNull();
  });
});
