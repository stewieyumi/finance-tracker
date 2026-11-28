import type { BillSettlement, UnifiedFinanceData } from "../types/finance";
import { MONTH_LIST } from "../constants/config";

export interface ReconciledDebtLoan {
  id: string;
  name: string;
  monthlyAmount: number | null;
  startMonth?: string;
  endMonth?: string;
  totalMonths: number;
  paidInstallments: number;
  totalPaid: number;
  remainingScheduled: number | null;
  progressPercent: number;
  archived: boolean;
  status: "active" | "completed" | "upcoming" | "incomplete";
  approximate: boolean;
  issues: string[];
}

export interface DebtReconciliation {
  loans: ReconciledDebtLoan[];
  activeLoans: ReconciledDebtLoan[];
  completedLoans: ReconciledDebtLoan[];
  upcomingLoans: ReconciledDebtLoan[];
  totalPaid: number;
  remainingScheduled: number;
  isComplete: boolean;
  approximate: boolean;
  /** Full scheduled installment amount in the selected month, including settled payments. */
  monthlyScheduled: number | null;
  scheduledFinish: string | null;
  finishStatus: "scheduled" | "past-due" | "review" | "none";
  upcomingScheduled: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function monthIndex(key?: string): number | null {
  if (typeof key !== "string") return null;
  const match = /^([A-Za-z]+) ([1-9]\d{3})$/.exec(key);
  if (!match) return null;
  const month = MONTH_LIST.indexOf(match[1]);
  return month < 0 ? null : Number(match[2]) * 12 + month;
}

const monthKey = (index: number) => `${MONTH_LIST[index % 12]} ${Math.floor(index / 12)}`;
const monthStart = (index: number) => new Date(Math.floor(index / 12), index % 12, 1).getTime();

function moneyCents(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value))) return null;
  const n = Number(value);
  const cents = Math.round(n * 100);
  return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(cents) && n === cents / 100 ? cents : null;
}

function timestamp(value: unknown): number | null {
  // Settlement writers use ISO instants. Date-only legacy strings are not exact instants.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const clock = value.slice(11, 19).split(":").map(Number);
  if (clock[0] > 23 || clock[1] > 59 || clock[2] > 59) return null;
  const time = Date.parse(value);
  const day = value.slice(0, 10).split("-").map(Number);
  const check = new Date(Date.UTC(day[0], day[1] - 1, day[2]));
  return Number.isFinite(time) && check.getUTCFullYear() === day[0] && check.getUTCMonth() === day[1] - 1 && check.getUTCDate() === day[2] ? time : null;
}

function paymentAt(
  entry: BillSettlement,
  occurrence: number,
  cutoff: number,
  issue: (message: string) => void
): { paid: boolean; approximate: boolean } {
  const initial = timestamp(entry.paidAt);
  if (initial === null) {
    issue("A payment timestamp needs review.");
    return { paid: false, approximate: true };
  }
  const hasReversal = entry.reversedAt !== undefined;
  if (hasReversal && timestamp(entry.reversedAt) === null) issue("A reversal timestamp needs review.");
  const history = entry.statusHistory === undefined
    ? [{ paid: true, at: entry.paidAt }, ...(entry.reversedAt ? [{ paid: false, at: entry.reversedAt }] : [])]
    : entry.statusHistory;
  if (!Array.isArray(history) || !history.length) {
    issue("Payment status history needs review.");
    return { paid: false, approximate: true };
  }
  let previous = -Infinity;
  let previousPaid = false;
  let paid = false;
  for (let i = 0; i < history.length; i++) {
    const event = history[i];
    const rawTime = timestamp(event?.at);
    if (!event || typeof event.paid !== "boolean" || rawTime === null || rawTime < previous || event.paid === previousPaid || (i === 0 && rawTime !== initial)) {
      issue("Payment status history needs review.");
      return { paid: false, approximate: true };
    }
    previous = rawTime;
    previousPaid = event.paid;
    // Prior confirmation says the occurrence was already paid, not when money moved.
    const effectiveTime = i === 0 && entry.priorConfirmation ? monthStart(occurrence) : rawTime;
    if (effectiveTime < cutoff) paid = event.paid;
  }
  if (previousPaid !== !hasReversal || (hasReversal && timestamp(entry.reversedAt) !== previous)) {
    issue("Payment status and history disagree.");
  }
  return { paid, approximate: !!entry.priorConfirmation || !Array.isArray(entry.statusHistory) || entry.historyComplete !== true };
}

/** Reporting only. Current payment permissions continue to use authoritative bill logs. */
export function reconcileDebt(
  data: UnifiedFinanceData,
  selectedMonth: string,
  now = new Date()
): DebtReconciliation {
  const logs = data.logs || {};
  const invalidLogs = !isRecord(data.logs) || Object.values(logs).some(log =>
    !isRecord(log) ||
    (log.billsPaid !== undefined && (!Array.isArray(log.billsPaid) || !log.billsPaid.every(id => typeof id === "string"))) ||
    [log.billSettlements, log.billOverrides, log.paymentDates].some(value => value !== undefined && !isRecord(value))
  );
  const selected = monthIndex(selectedMonth);
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const validPeriod = selected !== null && Number.isFinite(now.getTime());
  const cutoff = validPeriod ? Math.min(monthStart(selected! + 1), now.getTime() + 1) : -Infinity;
  const period = validPeriod ? Math.min(selected!, nowIndex) : -Infinity;
  const records = [
    ...(data.library?.bills || []).map(bill => ({ bill, archived: false })),
    ...(data.library?.archivedBills || []).map(bill => ({ bill, archived: true }))
  ];
  const loanIds = new Set(records.filter(({ bill }) => bill.type === "Loan / Installment").map(({ bill }) => bill.id));
  const idCounts = new Map<string, number>();
  for (const { bill } of records) idCounts.set(bill.id, (idCounts.get(bill.id) || 0) + 1);
  const paymentIds = new Map<string, number>();
  for (const log of Object.values(logs)) {
    if (!isRecord(log)) continue;
    for (const rows of Object.values(log.billSettlements || {})) {
      if (Array.isArray(rows)) for (const row of rows) {
        if (row?.id) paymentIds.set(row.id, (paymentIds.get(row.id) || 0) + 1);
      }
    }
  }
  const loans: ReconciledDebtLoan[] = [];
  let monthlyCents = 0;
  let monthlyValid = validPeriod && !invalidLogs;
  for (const id of loanIds) {
    const { bill, archived } = records.find(record => record.bill.id === id && record.bill.type === "Loan / Installment")!;
    const issues: string[] = [];
    const issue = (message: string) => { if (!issues.includes(message)) issues.push(message); };
    const start = monthIndex(bill.startMonth);
    const end = monthIndex(bill.endMonth);
    const count = start !== null && end !== null ? end - start + 1 : 0;
    const base = moneyCents(bill.amount);
    if (!validPeriod) issue("The reporting month needs review.");
    if (invalidLogs) issue("A month log needs review before calculating debt.");
    if (!id || idCounts.get(id) !== 1) issue("Duplicate or missing loan ID.");
    // Bound pathological imported schedules explicitly, without silently truncating them.
    if (count < 1 || count > 1200 || start === null || end === null) issue("The loan schedule needs review (maximum 1,200 months).");
    if (base === null) issue("The scheduled amount needs review.");
    let paidCents = 0;
    let remainingCents = 0;
    let paidInstallments = 0;
    let approximate = false;
    if (issues.length === 0) {
      const months = new Set(Array.from({ length: count }, (_, i) => monthKey(start! + i)));
      for (const [key, log] of Object.entries(logs)) {
        if (log.billsPaid?.includes(id) || log.billSettlements?.[id]?.length) months.add(key);
      }
      for (const key of months) {
        const occurrence = monthIndex(key);
        const inSchedule = occurrence !== null && occurrence >= start! && occurrence <= end!;
        const log = logs[key];
        const rows = log?.billSettlements?.[id];
        if (occurrence === null || !inSchedule) issue("Payment records fall outside the current schedule.");
        const expected = moneyCents(log?.billOverrides?.[id] ?? bill.amount);
        let settled = false;
        if (rows !== undefined && !Array.isArray(rows)) issue("Settlement records need review.");
        if (Array.isArray(rows) && rows.length) {
          let active = 0;
          for (const row of rows) {
            if (!row || typeof row.id !== "string" || !row.id || paymentIds.get(row.id) !== 1) {
              issue("Duplicate or missing payment ID.");
              continue;
            }
            const amount = moneyCents(row.amount);
            if (amount === null) { issue("A recorded payment amount needs review."); continue; }
            const state = paymentAt(row, occurrence ?? start!, cutoff, issue);
            approximate ||= state.approximate;
            if (state.paid) { active++; paidCents += amount; }
          }
          if (active > 1) issue("Multiple payments settle the same installment.");
          settled = active === 1;
          // Current flags must agree with recorded present-day status, not historical status.
          const currentPaid = rows.some(row => row && !row.reversedAt);
          if (currentPaid !== !!log?.billsPaid?.includes(id)) issue("Paid status and settlement records disagree.");
        } else if (log?.billsPaid?.includes(id)) {
          approximate = true;
          const dated = log.paymentDates?.[id];
          const time = dated === undefined ? monthStart(occurrence ?? start!) : timestamp(dated);
          if (time === null) issue("A legacy payment date needs review.");
          settled = time !== null && time < cutoff;
          if (settled && expected !== null) paidCents += expected;
          if (expected === null) issue("A legacy payment amount needs review.");
        }
        if (inSchedule) {
          if (settled) paidInstallments++;
          else if (expected === null) issue("An unpaid installment amount needs review.");
          else remainingCents += expected;
        }
      }
    }
    if (!Number.isSafeInteger(paidCents) || !Number.isSafeInteger(remainingCents)) issue("Debt totals exceed the supported money range.");
    const status = issues.length ? "incomplete" : paidInstallments === count ? "completed" : start! > period ? "upcoming" : "active";
    if (issues.length) monthlyValid = false;
    if (selected !== null && start !== null && end !== null && selected >= start && selected <= end) {
      const scheduled = moneyCents(logs[selectedMonth]?.billOverrides?.[id] ?? bill.amount);
      if (scheduled === null) monthlyValid = false;
      else monthlyCents += scheduled;
    }
    loans.push({
      id, name: bill.name, monthlyAmount: base === null ? null : base / 100,
      startMonth: bill.startMonth, endMonth: bill.endMonth, totalMonths: Math.max(0, count),
      paidInstallments, totalPaid: issues.length ? 0 : paidCents / 100,
      remainingScheduled: issues.length ? null : remainingCents / 100,
      progressPercent: count > 0 ? Math.min(100, paidInstallments / count * 100) : 0,
      archived, status, approximate, issues
    });
  }
  const activeLoans = loans.filter(loan => loan.status === "active" || loan.status === "incomplete");
  const paid = loans.reduce((sum, loan) => sum + Math.round(loan.totalPaid * 100), 0);
  const remaining = activeLoans.reduce((sum, loan) => sum + Math.round((loan.remainingScheduled ?? 0) * 100), 0);
  const safeTotals = Number.isSafeInteger(paid) && Number.isSafeInteger(remaining);
  const isComplete = validPeriod && !invalidLogs && safeTotals && loans.every(loan => loan.issues.length === 0);
  const outstanding = loans.filter(loan => loan.status !== "completed");
  const upcomingLoans = loans.filter(loan => loan.status === "upcoming");
  const upcomingCents = upcomingLoans.reduce((sum, loan) => sum + Math.round((loan.remainingScheduled ?? 0) * 100), 0);
  const ends = outstanding.map(loan => monthIndex(loan.endMonth)!);
  const finishStatus: DebtReconciliation["finishStatus"] = !isComplete ? "review"
    : outstanding.length === 0 ? "none"
    : ends.some(end => end < period) ? "past-due" : "scheduled";
  return {
    loans, activeLoans,
    completedLoans: loans.filter(loan => loan.status === "completed"),
    upcomingLoans,
    totalPaid: safeTotals ? paid / 100 : 0,
    remainingScheduled: safeTotals ? remaining / 100 : 0,
    isComplete,
    approximate: loans.some(loan => loan.approximate),
    monthlyScheduled: monthlyValid && Number.isSafeInteger(monthlyCents) ? monthlyCents / 100 : null,
    scheduledFinish: finishStatus === "scheduled" ? monthKey(Math.max(...ends)) : null,
    finishStatus,
    upcomingScheduled: isComplete && Number.isSafeInteger(upcomingCents) ? upcomingCents / 100 : null
  };
}
