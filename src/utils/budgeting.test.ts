import { describe, expect, it } from 'vitest';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';
import type { MonthlyBudget, UnifiedFinanceData } from '../types/finance';
import { applyMonthlyBudget, budgetCash, budgetDays, calculateCashGuidance, effectiveBudget, isMonthlyBudget, readBudgetSpending, readDailyBudget } from './budgeting';
import { applyExpenseEdit } from './expenseChanges';
import { isValidFinanceBackup } from './validationHelpers';

function seed(): UnifiedFinanceData {
  const data = structuredClone(INITIAL_UNIFIED_DATA);
  data.wallets = { main: 1000, cash: 100 };
  data.settings = { ...data.settings, customWallets: [{ id: 'main', label: 'Bank' }, { id: 'cash', label: 'Cash' }] };
  return data;
}
const expense = (id: string, amount: number, date: string, category = 'Food & Dining', wallet = 'main') => ({ id, merchant: id, amount, date, category, wallet });

describe('budget validation and guarded plans', () => {
  it.each([NaN, Infinity, -1, 1.001, Number.MAX_SAFE_INTEGER])('rejects invalid limits %s', limit => {
    expect(isMonthlyBudget({ limit })).toBe(false);
  });
  it('validates category totals, zero category caps, money precision and maps without requiring budgets on old backups', () => {
    expect(isMonthlyBudget({ limit: 100, categoryLimits: { Shopping: 0, Transport: 100 } })).toBe(true);
    expect(isMonthlyBudget({ limit: 100, categoryLimits: { Shopping: 60, Transport: 41 } })).toBe(false);
    expect(isMonthlyBudget({ limit: 100, categoryLimits: { fake: 50 } })).toBe(false);
    expect(isMonthlyBudget({ limit: 100, rollover: 'yes' })).toBe(false);
    const data = seed(); expect(isValidFinanceBackup(data)).toBe(true);
    data.settings!.monthlyBudgets = { 'November 2026': { limit: 100 } };
    expect(isValidFinanceBackup(JSON.parse(JSON.stringify(data)))).toBe(true);
    data.settings!.monthlyBudgets = { 'bad month': { limit: 100 } };
    expect(isValidFinanceBackup(data)).toBe(false);
  });
  it('changes only the selected plan and rejects stale saves; removing a plan never removes transactions', () => {
    const data = seed(); data.settings!.monthlyBudgets = { 'October 2026': { limit: 200 } };
    const result = applyMonthlyBudget(data, 'November 2026', { limit: 100, rollover: true }, undefined);
    expect(result.ok).toBe(true);
    expect(result.data.wallets).toBe(data.wallets); expect(result.data.library).toBe(data.library); expect(result.data.logs).toBe(data.logs);
    expect(result.data.settings!.monthlyBudgets!['October 2026']).toEqual({ limit: 200 });
    expect(applyMonthlyBudget(result.data, 'November 2026', { limit: 150 }, undefined).ok).toBe(false);
    const removed = applyMonthlyBudget(result.data, 'November 2026', undefined, { limit: 100, rollover: true });
    expect(removed.ok).toBe(true); expect(removed.data.settings!.monthlyBudgets!['November 2026']).toBeNull();
    expect(removed.data.library).toBe(data.library);
  });
});

describe('cash-based guidance', () => {
  it('supports irregular cash and calculates savings potential, daily allowance and shortfalls in cents', () => {
    expect(calculateCashGuidance(10000, 10, 300, 2000, 2000, 500)).toEqual({ affordableSavings: 4500, shortfall: 0, spendingLimit: 7500, dailyAllowance: 550 });
    expect(calculateCashGuidance(1000, 10, 100, 100, 200, 0)?.shortfall).toBe(300);
    expect(calculateCashGuidance(1, 3, 0, 0, 0, 0)?.dailyAllowance).toBe(0.33);
    expect(calculateCashGuidance(100, 0, 0, 0, 0, 0)).toBeNull();
    expect(calculateCashGuidance(100, 5, -1, 0, 0, 0)).toBeNull();
    expect(budgetDays('2026-12-31', '2027-01-01')).toBe(2);
    expect(budgetDays('2028-02-28', '2028-03-01')).toBe(3);
  });
  it('uses selected valid active cash only and flags missing or ambiguous wallets', () => {
    const data = seed(); data.wallets.archived = 5000; data.settings!.archivedWallets = [{ id: 'archived', label: 'Old bank' }];
    expect(budgetCash(data).available).toBe(1100);
    expect(budgetCash(data, ['cash']).available).toBe(100);
    expect(budgetCash(data, ['missing']).needsReview).toBe(true);
    data.settings!.customWallets!.push({ id: 'cash', label: 'Duplicate' });
    expect(budgetCash(data, ['cash']).needsReview).toBe(true);
  });
});

describe('recorded spending', () => {
  it('uses transaction days, excludes transfers/income, and counts fees, manual expenses and actual paid commitments once', () => {
    const data = seed();
    data.library.expenses = [expense('a', 0.1, '2026-11-01'), { ...expense('b', 0.2, '2026-11-01'), loggedAt: '2026-12-01T01:00:00Z' }, expense('old', 500, '2026-10-31')];
    data.library.manualTransactions = [
      { id: 'tx', title: 'Move', amount: 1000, transferFee: 10, type: 'transfer', date: '2026-11-02', wallet: 'main', destinationWallet: 'cash', createdAt: 1 },
      { id: 'historical', title: 'Old receipt', amount: 50, type: 'expense', date: '2026-11-02', category: 'Shopping', wallet: 'main', createdAt: 1 },
      { id: 'income', title: 'Income', amount: 9000, type: 'income', date: '2026-11-02', wallet: 'main', createdAt: 1 },
    ];
    data.logs['October 2026'] = { billsPaid: ['bill'], billSettlements: { bill: [{ id: 'payment', paidAt: '2026-11-03', amount: 100, wallet: 'main', walletDebit: 100 }] } };
    expect(readBudgetSpending(data, 'November 2026').spent).toBe(160.3);
    expect(readBudgetSpending(data, 'November 2026').byDay['2026-11-01'].spent).toBe(0.3);
    expect(readBudgetSpending(data, 'October 2026').spent).toBe(500);
    expect(readBudgetSpending(data, 'November 2026', { startDate: '2026-11-01', endDate: '2026-11-30', walletIds: ['cash'] }).spent).toBe(0);
  });
  it('does not invent dates for older confirmations or count reversed/pending commitments', () => {
    const data = seed();
    data.logs['November 2026'] = { billsPaid: ['legacy', 'prior'], billSettlements: { prior: [{ id: 'prior', paidAt: '2026-11-01', amount: 500, wallet: null, walletDebit: 0, priorConfirmation: true }], reversed: [{ id: 'reversed', paidAt: '2026-11-01', amount: 500, wallet: 'main', walletDebit: 500, reversedAt: '2026-11-02' }] } };
    const report = readBudgetSpending(data, 'November 2026');
    expect(report.spent).toBe(0); expect(report.excluded).toBe(2);
  });
  it('flags duplicate record identities rather than counting the same history twice', () => {
    const data = seed(); data.library.expenses = [expense('duplicate', 50, '2026-11-01'), expense('duplicate', 50, '2026-11-01')];
    data.logs['November 2026'] = { billsPaid: ['a', 'b'], billSettlements: { a: [{ id: 'shared', amount: 50, paidAt: '2026-11-01', wallet: 'main', walletDebit: 50 }], b: [{ id: 'shared', amount: 50, paidAt: '2026-11-01', wallet: 'main', walletDebit: 50 }] } };
    const report = readBudgetSpending(data, 'November 2026'); expect(report.spent).toBe(0); expect(report.excluded).toBe(4);
  });
  it('responds to the real expense edit transition without keeping a second spending ledger', () => {
    const data = seed(); const old = expense('edited', 100, '2026-11-03'); data.library.expenses = [old];
    const result = applyExpenseEdit(data, old, { merchant: 'edited', amount: '150', date: '2026-12-03', category: 'Shopping', wallet: 'main' });
    expect(result.ok).toBe(true); expect(readBudgetSpending(result.data, 'November 2026').spent).toBe(0); expect(readBudgetSpending(result.data, 'December 2026').spent).toBe(150);
  });
});

describe('daily and monthly rollover', () => {
  it('carries unused daily allowance, reduces future allowance after overspending and keeps wallet money unchanged', () => {
    const data = seed(); const snapshot = structuredClone(data);
    const plan: MonthlyBudget = { limit: 300, cashPlan: { walletIds: ['main'], startDate: '2026-11-01', endDate: '2026-11-03', dailyEssentials: 0, savingsTarget: 0, commitmentsReserve: 0, cushion: 0, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {} } };
    data.library.expenses = [expense('day-one', 40, '2026-11-01')];
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-02').todayCap).toBe(160);
    data.library.expenses[0].amount = 140;
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-02').todayCap).toBe(60);
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-04').todayCap).toBe(0);
    expect(data.wallets).toEqual(snapshot.wallets);
  });
  it('keeps a one-day 29-cent allowance at 29 cents and starts pacing from the review day', () => {
    const data = seed(); const plan: MonthlyBudget = { limit: 0.29, cashPlan: { walletIds: ['main'], startDate: '2026-11-01', endDate: '2026-11-30', pacingStartDate: '2026-11-30', dailyEssentials: 0, savingsTarget: 0, commitmentsReserve: 0, cushion: 0, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {} } };
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-30').todayCap).toBe(0.29);
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-30').averageRemaining).toBe(0.29);
  });
  it('protects a commitment reserve even when current wallet cash drops below the plan', () => {
    const data = seed(); data.wallets.main = 100;
    const plan: MonthlyBudget = { limit: 1000, categoryLimits: { Commitments: 500 } };
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-30').remainingToday).toBe(0);
  });
  it('rolls unspent allowance across a skipped month once, excludes new income, and respects an explicit next plan', () => {
    const data = seed(); data.settings!.monthlyBudgets = { 'October 2026': { limit: 300, rollover: true, categoryLimits: { Shopping: 100 } } };
    data.library.expenses = [expense('oct', 40, '2026-10-20'), expense('nov', 60, '2026-11-10')];
    const first = effectiveBudget(data, 'December 2026'); const again = effectiveBudget(data, 'December 2026');
    expect(first.budget?.limit).toBe(200); expect(again).toEqual(first);
    expect(data.wallets.main).toBe(1000);
    data.settings!.monthlyBudgets['December 2026'] = { limit: 50 };
    expect(effectiveBudget(data, 'December 2026').budget?.limit).toBe(50);
  });
  it('does not subtract current-month spending twice when cash already reflects that spending', () => {
    const data = seed(); data.wallets = { main: 80, cash: 0 };
    data.settings!.monthlyBudgets = { 'October 2026': { limit: 100, rollover: true } };
    data.library.expenses = [expense('nov-spent', 20, '2026-11-02')];
    const plan = effectiveBudget(data, 'November 2026').budget!;
    expect(plan.limit).toBe(100);
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-30').remainingToday).toBe(80);
  });
  it('allows a zero spending cap and preserves explicit removal as a rollover barrier', () => {
    expect(isMonthlyBudget({ limit: 0, rollover: false })).toBe(true);
    const data = seed(); data.settings!.monthlyBudgets = { 'October 2026': { limit: 100, rollover: true } };
    const removed = applyMonthlyBudget(data, 'November 2026', undefined, undefined);
    expect(removed.ok).toBe(true);
    expect(effectiveBudget(removed.data, 'November 2026').budget).toBeUndefined();
    expect(effectiveBudget(removed.data, 'December 2026').budget).toBeUndefined();
    expect(isValidFinanceBackup(removed.data)).toBe(true);
  });
  it('preserves carried allowance but caps daily guidance to actual cash and respects disabled rollover', () => {
    const data = seed(); data.wallets.main = 10; data.wallets.cash = 0;
    data.settings!.monthlyBudgets = { 'October 2026': { limit: 100, rollover: true, categoryLimits: { Shopping: 50, Transport: 50 } } };
    const plan = effectiveBudget(data, 'November 2026').budget!;
    expect(plan.limit).toBe(100); expect(isMonthlyBudget(plan)).toBe(true);
    expect(readDailyBudget(data, 'November 2026', plan, '2026-11-30').remainingToday).toBe(10);
    data.settings!.monthlyBudgets['October 2026']!.rollover = false;
    expect(effectiveBudget(data, 'November 2026').budget).toBeUndefined();
  });
});
