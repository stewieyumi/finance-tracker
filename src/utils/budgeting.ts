import { readWalletSavings } from "./walletSavings";
import { reconcileWalletBalances, validateActiveWalletAssignment } from "./financeHelpers";
import type { MonthlyBudget, UnifiedFinanceData } from '../types/finance';
import { MONTH_LIST } from '../constants/config';
import { expenseCents } from './expenseChanges';
import { isValidDateKey, parseDateKey, parseMonthKey } from './dateHelpers';
import { transactionDay } from './transactionDates';

export const BUDGET_CATEGORIES = ['Food & Dining', 'Transport', 'Utilities', 'Laundry & Home', 'Shopping', 'Other', 'Commitments', 'Transfer fees'] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const isBudgetMonth = (value: string) => MONTH_LIST.some(month => new RegExp(`^${month} [1-9]\\d{3}$`).test(value));

export function isMonthlyBudget(value: unknown): value is MonthlyBudget {
  if (!record(value)) return false;
  const limit = expenseCents(value.limit);
  if (limit === null) return false;
  if (value.rollover !== undefined && typeof value.rollover !== 'boolean') return false;
  if (value.cashPlan !== undefined) {
    const cash = value.cashPlan;
    if (!record(cash) || !Array.isArray(cash.walletIds) || !cash.walletIds.length || new Set(cash.walletIds).size !== cash.walletIds.length || !cash.walletIds.every(id => typeof id === 'string' && id.trim()) ||
        typeof cash.startDate !== 'string' || typeof cash.endDate !== 'string' || !isValidDateKey(cash.startDate) || !isValidDateKey(cash.endDate) || budgetDays(cash.startDate, cash.endDate) < 1 || budgetDays(cash.startDate, cash.endDate) > 366 ||
        !['dailyEssentials', 'savingsTarget', 'commitmentsReserve', 'cushion', 'baselineSpent', 'baselineCommitments'].every(key => expenseCents(cash[key]) !== null) ||
        (cash.pacingStartDate !== undefined && (typeof cash.pacingStartDate !== 'string' || !isValidDateKey(cash.pacingStartDate) || cash.pacingStartDate < cash.startDate || cash.pacingStartDate > cash.endDate)) ||
        !record(cash.baselineDailyFlexible) || !Object.entries(cash.baselineDailyFlexible).every(([day, amount]) => isValidDateKey(day) && expenseCents(amount) !== null)) return false;
  }
  if (value.categoryLimits === undefined) return true;
  if (!record(value.categoryLimits)) return false;
  let total = 0;
  for (const [category, amount] of Object.entries(value.categoryLimits)) {
    const cents = expenseCents(amount);
    if (!BUDGET_CATEGORIES.includes(category as typeof BUDGET_CATEGORIES[number]) || cents === null) return false;
    total += cents;
    if (!Number.isSafeInteger(total) || total > limit) return false;
  }
  return true;
}

export function isMonthlyBudgetMap(value: unknown): value is Record<string, MonthlyBudget | null> {
  return record(value) && Object.entries(value).every(([month, budget]) => isBudgetMonth(month) && (budget === null || isMonthlyBudget(budget)));
}

/** Only the chosen plan changes; spending records and wallet balances are never rewritten. */
export function applyMonthlyBudget(data: UnifiedFinanceData, month: string, next: MonthlyBudget | undefined, expected: unknown) {
  const reject = (error: string) => ({ ok: false as const, data, error });
  if (!isBudgetMonth(month) || (next !== undefined && !isMonthlyBudget(next))) return reject('Enter a nonnegative limit with at most two decimal places. Category limits must fit within it.');
  const plans: unknown = data.settings?.monthlyBudgets;
  if (plans !== undefined && !record(plans)) return reject('Saved budgets need review before they can be edited.');
  if (next?.cashPlan && next.cashPlan.walletIds.some(id => !validateActiveWalletAssignment(id, data.settings, data.wallets).ok)) return reject('Review the selected wallets before saving this plan.');
  const current = plans?.[month];
  if (JSON.stringify(current) !== JSON.stringify(expected)) return reject('This budget changed. Close the editor and reopen it to see the latest plan.');
  const monthlyBudgets = { ...(plans as Record<string, MonthlyBudget | null> | undefined) };
  if (next === undefined) monthlyBudgets[month] = null;
  else monthlyBudgets[month] = structuredClone(next);
  return { ok: true as const, data: { ...data, settings: { ...data.settings, monthlyBudgets },
    updatedAt: Math.max(Date.now(), (Number.isFinite(data.updatedAt) ? data.updatedAt! : 0) + 1) } };
}

/** Read actual transaction days, not entry timestamps, due dates or pending commitments. */
export function readBudgetSpending(data: UnifiedFinanceData, month: string, options?: { startDate: string; endDate: string; walletIds?: string[] }) {
  const range = options ?? budgetMonthRange(month);
  const byDay: Record<string, { spent: number; commitments: number }> = {};
  const centsByCategory: Record<string, number> = Object.fromEntries(BUDGET_CATEGORIES.map(category => [category, 0]));
  let total = 0, excluded = 0;
  const add = (amount: unknown, date: unknown, category: string, bucket?: string, wallet?: string | null) => {
    if (options?.walletIds && wallet && !options.walletIds.includes(wallet)) return;
    if (options?.walletIds && !wallet) { excluded++; return; }
    const cents = expenseCents(amount);
    const day = typeof date === 'string' && isValidDateKey(date.slice(0, 10)) ? transactionDay(date) : '';
    if (cents === null || !day) { if (!bucket || bucket === month) excluded++; return; }
    if (day < range.startDate || day > range.endDate) return;
    if (!Number.isSafeInteger(total + cents)) { excluded++; return; }
    const key = BUDGET_CATEGORIES.includes(category as typeof BUDGET_CATEGORIES[number]) ? category : 'Other';
    total += cents;
    centsByCategory[key] += cents;
    const prior = byDay[day] ?? { spent: 0, commitments: 0 };
    byDay[day] = { spent: Math.round(prior.spent * 100 + cents) / 100, commitments: Math.round(prior.commitments * 100 + (key === 'Commitments' ? cents : 0)) / 100 };
  };
  const unique = <T extends { id: string }>(rows: T[] | undefined): T[] => {
    if (rows === undefined) return [];
    if (!Array.isArray(rows)) { excluded++; return []; }
    const counts = new Map<string, number>();
    for (const row of rows) if (row?.id) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
    return rows.filter(row => { if (!row?.id || counts.get(row.id) !== 1) { excluded++; return false; } return true; });
  };
  for (const expense of unique(data.library.expenses)) add(expense.amount, expense.date, expense.category, undefined, expense.wallet);
  for (const entry of unique(data.library.manualTransactions)) {
    if (entry.type === 'expense') add(entry.amount, entry.date, entry.category ?? 'Other', undefined, entry.wallet);
    if (entry.type === 'transfer' && entry.transferFee !== undefined) add(entry.transferFee, entry.date, 'Transfer fees', undefined, entry.wallet);
  }
  const receiptCounts = new Map<string, number>();
  for (const log of Object.values(data.logs ?? {})) for (const rows of Object.values(log?.billSettlements ?? {})) {
    if (Array.isArray(rows)) for (const row of rows) if (row?.id) receiptCounts.set(row.id, (receiptCounts.get(row.id) ?? 0) + 1);
  }
  for (const [bucket, log] of Object.entries(data.logs ?? {})) {
    for (const id of new Set(log.billsPaid ?? [])) {
      const rows = log.billSettlements?.[id] ?? [];
      const active = Array.isArray(rows) ? rows.filter(row => row && !row.reversedAt) : [];
      // Prior confirmations describe an earlier payment, not money spent on the confirmation day.
      if (active.length !== 1 || active[0].priorConfirmation || !active[0].id || receiptCounts.get(active[0].id) !== 1) {
        if (bucket === month) excluded++;
        continue;
      }
      add(active[0].amount, active[0].paidAt, 'Commitments', bucket, active[0].wallet);
    }
  }
  return { byDay, spent: total / 100, byCategory: Object.fromEntries(Object.entries(centsByCategory).map(([key, cents]) => [key, cents / 100])), excluded };
}

export const budgetDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function budgetMonthRange(month: string) {
  const start = parseMonthKey(month);
  return { startDate: budgetDateKey(start), endDate: budgetDateKey(new Date(start.getFullYear(), start.getMonth() + 1, 0)) };
}
const dayNumber = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
};
export const budgetDays = (start: string, end: string) => dayNumber(end) - dayNumber(start) + 1;

export function budgetCash(data: UnifiedFinanceData, ids?: string[]) {
  const wallets = reconcileWalletBalances(data).activeWallets;
  const selected = ids ?? wallets.map(wallet => wallet.id);
  let cents = 0, needsReview = false;
  for (const id of new Set(selected)) {
    const wallet = wallets.find(candidate => candidate.id === id);
    if (!wallet || !validateActiveWalletAssignment(id, data.settings, data.wallets).ok) { needsReview = true; continue; }
    const funds = readWalletSavings(data, id);
    needsReview ||= funds.needsReview;
    const balance = Math.round(funds.available * 100);
    if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(cents + balance)) { needsReview = true; continue; }
    cents += balance;
  }
  return { available: Math.max(0, cents / 100), needsReview,
    wallets: wallets.filter(wallet => validateActiveWalletAssignment(wallet.id, data.settings, data.wallets).ok) };
}

export function calculateCashGuidance(cash: number, days: number, dailyEssentials: number, commitments: number, savings: number, cushion: number) {
  const values = [cash, dailyEssentials, commitments, savings, cushion].map(expenseCents);
  if (values.some(value => value === null) || !Number.isSafeInteger(days) || days < 1 || days > 366) return null;
  const [available, daily, bills, target, buffer] = values as number[];
  const essentials = daily * days;
  const required = essentials + bills + target + buffer;
  if (!Number.isSafeInteger(required)) return null;
  const spendable = Math.max(0, available - target - buffer);
  return { affordableSavings: Math.max(0, available - essentials - bills - buffer) / 100,
    shortfall: Math.max(0, required - available) / 100, spendingLimit: spendable / 100,
    dailyAllowance: Math.floor(Math.max(0, spendable - bills) / days) / 100 };
}

/** Inherited allowance is part of existing wallet cash; never a new credit or extra monthly grant. */
export function effectiveBudget(data: UnifiedFinanceData, month: string): { budget?: MonthlyBudget; carriedFrom?: string; needsReview?: boolean; projected?: boolean } {
  const raw = data.settings?.monthlyBudgets?.[month];
  if (raw !== undefined) return { budget: isMonthlyBudget(raw) ? raw : undefined };
  const start = budgetMonthRange(month).startDate;
  const candidates = Object.entries(data.settings?.monthlyBudgets ?? {}).filter(([key]) => isBudgetMonth(key) && budgetMonthRange(key).startDate < start)
    .sort(([a], [b]) => budgetMonthRange(b).startDate.localeCompare(budgetMonthRange(a).startDate));
  const previous = candidates[0];
  if (!previous || !isMonthlyBudget(previous[1]) || !previous[1].rollover) return {};
  const [priorMonth, plan] = previous;
  if ((plan.cashPlan?.endDate ?? budgetMonthRange(priorMonth).endDate) >= start) return {};
  const originalRange = plan.cashPlan ?? budgetMonthRange(priorMonth);
  const before = parseDateKey(start); before.setDate(before.getDate() - 1);
  const spending = readBudgetSpending(data, priorMonth, { startDate: originalRange.startDate, endDate: budgetDateKey(before), walletIds: plan.cashPlan?.walletIds });
  if (spending.excluded) return { needsReview: true };
  const remaining = Math.max(0, Math.round((plan.limit - spending.spent) * 100)) / 100;
  const limit = remaining;
  if (limit <= 0) return {};
  const categories = Object.entries(plan.categoryLimits ?? {}).map(([category, amount]) => [category, Math.max(0, Math.round((amount - spending.byCategory[category]) * 100))] as const);
  const categoryTotal = categories.reduce((sum, [, cents]) => sum + cents, 0);
  const carriedCategories = Object.fromEntries(categories.map(([category, cents]) => [category, (categoryTotal > Math.round(limit * 100) ? Number(BigInt(cents) * BigInt(Math.round(limit * 100)) / BigInt(categoryTotal)) : cents) / 100]));
  return { carriedFrom: priorMonth, projected: start > budgetDateKey(), budget: { limit, rollover: true,
    categoryLimits: carriedCategories,
    ...(plan.cashPlan ? { cashPlan: { ...plan.cashPlan, ...budgetMonthRange(month), pacingStartDate: budgetMonthRange(month).startDate, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {}, savingsTarget: 0, cushion: 0,
      commitmentsReserve: carriedCategories.Commitments ?? 0 } } : {}) } };
}

export function readDailyBudget(data: UnifiedFinanceData, month: string, plan: MonthlyBudget, today = budgetDateKey()) {
  const range = plan.cashPlan ?? budgetMonthRange(month);
  const spending = readBudgetSpending(data, month, { ...range, walletIds: plan.cashPlan?.walletIds });
  const pacingStart = plan.cashPlan?.pacingStartDate ?? range.startDate;
  const days = budgetDays(pacingStart, range.endDate);
  const elapsed = Math.max(0, Math.min(days, budgetDays(pacingStart, today)));
  const baseline = plan.cashPlan?.baselineSpent ?? 0;
  const reserve = plan.cashPlan?.commitmentsReserve ?? plan.categoryLimits?.Commitments ?? 0;
  const baselineCommitments = plan.cashPlan?.baselineCommitments ?? 0;
  const reserveLeft = Math.max(0, reserve - Math.max(0, spending.byCategory.Commitments - baselineCommitments));
  const pool = Math.max(0, Math.round((plan.limit - baseline - reserve) * 100));
  let before = 0;
  for (const [day, entry] of Object.entries(spending.byDay)) if (day < today) {
    before += Math.max(0, Math.round((entry.spent - entry.commitments - (plan.cashPlan?.baselineDailyFlexible[day] ?? 0)) * 100));
  }
  const todayEntry = spending.byDay[today];
  const todaySpent = Math.max(0, Math.round(((todayEntry ? todayEntry.spent - todayEntry.commitments : 0) - (plan.cashPlan?.baselineDailyFlexible[today] ?? 0)) * 100)) / 100;
  const ended = today > range.endDate, future = today < pacingStart;
  const accrued = ended || future ? 0 : Number(BigInt(pool) * BigInt(elapsed) / BigInt(days));
  const funding = budgetCash(data, plan.cashPlan?.walletIds);
  const availableCents = Math.max(0, Math.min(Math.round((plan.limit - spending.spent) * 100), Math.round(funding.available * 100)) - Math.round(reserveLeft * 100));
  const cap = ended || future ? 0 : Math.max(0, Math.min(accrued - before, availableCents + Math.round(todaySpent * 100))) / 100;
  const dailyTarget = Math.floor(pool / days) / 100;
  const nextIndex = Math.min(days, elapsed + 6);
  const sevenDayAccrued = Number(BigInt(pool) * BigInt(nextIndex) / BigInt(days));
  const nextSevenDays = ended || future ? 0 : Math.max(0, Math.min(sevenDayAccrued - before - Math.round(todaySpent * 100), availableCents)) / 100;
  const remainingToday = Math.max(0, Math.round((cap - todaySpent) * 100)) / 100;
  const reviews = Object.entries(plan.categoryLimits ?? {}).filter(([category, amount]) => category !== 'Commitments' && spending.byCategory[category] > amount)
    .sort(([a, av], [b, bv]) => (spending.byCategory[b] - bv) - (spending.byCategory[a] - av)).slice(0, 3);
  return { spending, funding, reserveLeft, dailyTarget, nextSevenDays, todayCap: cap, todaySpent, remainingToday, ended, future, reviews,
    daysLeft: ended ? 0 : future ? days : budgetDays(today, range.endDate),
    averageRemaining: ended ? 0 : Math.floor(availableCents / (future ? days : budgetDays(today, range.endDate))) / 100 };
}
