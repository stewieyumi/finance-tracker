import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmergencyFundGoal, UnifiedFinanceData } from '../types/finance';
import { applyEmergencyFundGoal, isEmergencyFundGoal, readEmergencyFund, readFinancialCheckup } from './financialCheckup';
import { readDailyBudget } from './budgeting';
import { isValidFinanceBackup } from './validationHelpers';

const month = 'November 2026';
const goal: EmergencyFundGoal = { target: 1000, walletIds: ['main'] };
function seed(): UnifiedFinanceData {
  return { wallets: { main: 1000, cash: 500 }, settings: {
    customWallets: [{ id: 'main', label: 'MariBank' }, { id: 'cash', label: 'Cash' }], savingsWalletIds: ['main', 'cash'], walletSavings: { main: 400, cash: 200 },
    monthlyBudgets: { [month]: { limit: 1200, cashPlan: { walletIds: ['main'], startDate: '2026-11-25', endDate: '2026-11-30', dailyEssentials: 20, savingsTarget: 0, commitmentsReserve: 200, cushion: 0, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {} } } }
  }, library: { bills: [], receivables: [{ id: 'r', name: 'Client', amount: 500, frequency: 'Monthly' }], shoots: [],
    expenses: [{ id: 'lunch', merchant: 'Lunch', amount: 100, category: 'Food & Dining', date: '2026-11-25', wallet: 'main' }],
    manualTransactions: [{ id: 'transfer', title: 'Move', amount: 500, transferFee: 10, date: '2026-11-25', type: 'transfer', wallet: 'main', destinationWallet: 'cash', createdAt: 1 }]
  }, logs: { [month]: { recsCollected: { r: { amountReceived: 500, collected: true } }, receivableSettlements: { r: [{ id: 'receipt', receivedAt: '2026-11-25T04:00:00Z', amount: 500, wallet: 'main', walletCredit: 500 }] } } } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 25, 12)); });
afterEach(() => vi.useRealTimers());

describe('financial checkup uses recorded facts', () => {
  it('combines active available cash, selected-view commitments and actual dated activity without changing data', () => {
    const data = seed(); const before = structuredClone(data); const report = readFinancialCheckup(data, month, 700);
    expect(report.cash.available).toBe(900); expect(report.afterCommitments).toBe(200);
    expect(report.spending.spent).toBe(110); expect(report.income.actual).toBe(500);
    expect(report.daily).toEqual(readDailyBudget(data, month, data.settings!.monthlyBudgets![month]!, '2026-11-25'));
    expect(data).toEqual(before);
  });
  it('prioritizes data review, cash shortfall, missing/inactive plans and actual overspending', () => {
    const data = seed(); expect(readFinancialCheckup(data, month, 901).nextAction).toContain('does not cover');
    delete data.settings!.monthlyBudgets; expect(readFinancialCheckup(data, month, 0).nextAction).toContain('Build a budget');
    data.wallets.main = NaN; expect(readFinancialCheckup(data, month, 0).nextAction).toContain('Review flagged');
    expect(readFinancialCheckup(seed(), month, 0, '2026-12-01').nextAction).toContain('not active');
    const overspent = seed(); overspent.library.expenses![0].amount = 500;
    expect(readFinancialCheckup(overspent, month, 0).nextAction).toContain('above its guide');
    expect(readFinancialCheckup(seed(), month, NaN).unpaid).toBeNull();
  });
});

describe('adjustable emergency goal labels existing Savings', () => {
  it('saves, updates and removes only the goal with a stale-state guard', () => {
    const data = seed(); const saved = applyEmergencyFundGoal(data, goal, undefined);
    expect(saved.ok).toBe(true); expect(saved.data.wallets).toBe(data.wallets); expect(saved.data.library).toBe(data.library); expect(saved.data.logs).toBe(data.logs);
    expect(saved.data.settings!.walletSavings).toBe(data.settings!.walletSavings);
    expect(applyEmergencyFundGoal(saved.data, { ...goal, target: 2000 }, undefined).ok).toBe(false);
    const removed = applyEmergencyFundGoal(saved.data, null, goal);
    expect(removed.ok).toBe(true); expect(removed.data.settings!.emergencyFundGoal).toBeNull();
    expect(removed.data.wallets).toBe(data.wallets); expect(removed.data.settings!.walletSavings).toBe(data.settings!.walletSavings);
  });
  it('counts only selected actual Savings, keeps the target distinct from assets, and tracks subsequent balance changes', () => {
    const data = applyEmergencyFundGoal(seed(), goal, undefined).data;
    expect(readEmergencyFund(data)).toMatchObject({ saved: 400, remaining: 600, percent: 40, reached: false, needsReview: false });
    const combined = applyEmergencyFundGoal(data, { target: 600, walletIds: ['main', 'cash'] }, goal).data;
    expect(readEmergencyFund(combined)).toMatchObject({ saved: 600, remaining: 0, percent: 100, reached: true });
    data.wallets.main = 100;
    expect(readEmergencyFund(data)).toMatchObject({ saved: 100, remaining: 900, needsReview: true, reached: false });
  });
  it.each([0, -1, 1.001, NaN, Infinity])('rejects an invalid goal target %s', target => {
    const data = seed(); const result = applyEmergencyFundGoal(data, { ...goal, target }, undefined);
    expect(result.ok).toBe(false); expect(result.data).toBe(data);
  });
  it('rejects duplicate, disabled, archived or unconfigured goal wallets and flags invalid existing history', () => {
    expect(isEmergencyFundGoal({ target: 100, walletIds: ['main', 'main'] })).toBe(false);
    const data = seed(); data.settings!.savingsWalletIds = ['main']; data.settings!.walletSavings = { main: 400 };
    expect(applyEmergencyFundGoal(data, { ...goal, walletIds: ['cash'] }, undefined).ok).toBe(false);
    expect(applyEmergencyFundGoal(data, { ...goal, walletIds: ['missing'] }, undefined).ok).toBe(false);
    data.settings!.archivedWallets = [{ id: 'main', label: 'Old' }];
    expect(applyEmergencyFundGoal(data, goal, undefined).ok).toBe(false);
    data.settings!.emergencyFundGoal = goal; expect(readEmergencyFund(data).needsReview).toBe(true);
  });
  it('survives backups while old files remain valid and malformed new settings are rejected', () => {
    const data = seed(); expect(isValidFinanceBackup(data)).toBe(true);
    const saved = applyEmergencyFundGoal(data, goal, undefined).data;
    expect(isValidFinanceBackup(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(isValidFinanceBackup({ ...data, settings: { ...data.settings, emergencyFundGoal: { target: -1, walletIds: ['main'] } } })).toBe(false);
    expect(isValidFinanceBackup({ ...data, settings: { ...data.settings, savingsWalletIds: ['main', 'main'] } })).toBe(false);
  });
});
