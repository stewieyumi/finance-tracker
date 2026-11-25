import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillViewModel, UnifiedFinanceData } from '../types/finance';
import { applyWalletSavings, enabledSavingsWalletIds, isSavingsWalletIds, isWalletSavingsMap, readWalletSavings, walletSavingsTotals } from './walletSavings';
import { budgetCash, readDailyBudget } from './budgeting';
import { isValidFinanceBackup } from './validationHelpers';
import { applySettingsForm, createSettingsForm } from './settingsForm';
import { applyExpenseSave } from '../hooks/useExpenseActions';
import { applyBillStatusToggle } from '../hooks/useBillActions';
import { applyLedgerSave } from '../components/HistoricalLedgerModal';

const month = 'November 2026';
const seed = (): UnifiedFinanceData => ({ wallets: { main: 1000, cash: 100 }, settings: {
  customWallets: [{ id: 'main', label: 'MariBank' }, { id: 'cash', label: 'Cash' }], defaultWallet: 'main', savingsWallet: 'main'
}, library: { bills: [{ id: 'bill', name: 'Internet', amount: 50, dueDay: '25', type: 'Bill', startMonth: month, wallet: 'main' }], receivables: [], shoots: [], expenses: [] }, logs: {} });
const save = (data: UnifiedFinanceData, amount: number, id = 'main') => applyWalletSavings(data, id, amount, { balance: data.wallets[id], savings: data.settings?.walletSavings?.[id] });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 25, 12)); });
afterEach(() => vi.useRealTimers());

describe('wallet savings planning reserve', () => {
  it('does not automatically reserve an existing savings/goal wallet and supports old backups', () => {
    const data = seed();
    expect(readWalletSavings(data, 'main')).toEqual({ balance: 1000, savings: 0, available: 1000, needsReview: false });
    expect(budgetCash(data).available).toBe(1100);
    expect(isValidFinanceBackup(data)).toBe(true);
  });
  it('opts wallets into Savings controls and retains already-set-aside money until released', () => {
    const data = seed(); expect(enabledSavingsWalletIds(data.settings)).toEqual([]);
    data.settings!.savingsWalletIds = ['main']; expect(save(data, 100, 'cash').ok).toBe(false);
    expect(save(data, 100).ok).toBe(true);
    const reserved = save(data, 100).data;
    const form = createSettingsForm(reserved.settings, reserved.wallets); form.savingsWalletIds = [];
    const settings = applySettingsForm(reserved.settings, form);
    expect(enabledSavingsWalletIds(settings)).toEqual(['main']);
    expect(settings.walletSavings).toEqual({ main: 100 });
    expect(isSavingsWalletIds(['main', 'main'])).toBe(false); expect(isSavingsWalletIds([''])).toBe(false);
  });
  it('sets partial/all savings and releases them without changing wallets, income, expenses or logs', () => {
    const data = seed(); const snapshot = structuredClone(data);
    const partial = save(data, 800); expect(partial.ok).toBe(true);
    expect(readWalletSavings(partial.data, 'main').available).toBe(200);
    expect(walletSavingsTotals(partial.data)).toEqual({ savings: 800, available: 300, needsReview: false });
    const all = save(partial.data, 1000); expect(all.ok).toBe(true);
    expect(readWalletSavings(all.data, 'main').available).toBe(0);
    const released = save(all.data, 0); expect(released.ok).toBe(true);
    expect(budgetCash(released.data).available).toBe(1100);
    for (const result of [partial, all, released]) {
      expect(result.data.wallets).toBe(data.wallets); expect(result.data.library).toBe(data.library); expect(result.data.logs).toBe(data.logs);
    }
    expect(data).toEqual(snapshot);
  });
  it.each([-1, 1000.01, 1.001, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects an invalid or excessive reserve: %s', amount => {
    const data = seed(); const result = save(data, amount); expect(result.ok).toBe(false); expect(result.data).toBe(data);
  });
  it('rejects stale savings/balance edits and unavailable routes without partial changes', () => {
    const original = seed(); const saved = save(original, 500).data;
    const stale = applyWalletSavings(saved, 'main', 700, { balance: 1000, savings: undefined });
    expect(stale.ok).toBe(false); expect(stale.data).toBe(saved);
    const newerBalance = { ...original, wallets: { ...original.wallets, main: 1100 } };
    expect(applyWalletSavings(newerBalance, 'main', 700, { balance: 1000, savings: undefined }).ok).toBe(false);
    const archived = seed(); archived.settings!.archivedWallets = [{ id: 'main', label: 'Old' }];
    expect(save(archived, 100).ok).toBe(false);
    const duplicate = seed(); duplicate.settings!.customWallets!.push({ id: 'main', label: 'Duplicate' });
    expect(save(duplicate, 100).ok).toBe(false); expect(save(seed(), 100, 'missing').ok).toBe(false);
  });
  it('respects selected wallets and updates existing daily guidance from available cash', () => {
    const saved = save(seed(), 800).data;
    expect(budgetCash(saved, ['main']).available).toBe(200); expect(budgetCash(saved, ['cash']).available).toBe(100);
    const plan = { limit: 1000, cashPlan: { walletIds: ['main'], startDate: '2026-11-25', endDate: '2026-11-25', dailyEssentials: 0, savingsTarget: 0, commitmentsReserve: 0, cushion: 0, baselineSpent: 0, baselineCommitments: 0, baselineDailyFlexible: {} } };
    expect(readDailyBudget(saved, month, plan, '2026-11-25').remainingToday).toBe(200);
    expect(readDailyBudget(save(saved, 1000).data, month, plan, '2026-11-25').remainingToday).toBe(0);
  });
  it('continues recording real expenses, bill payments and transfers even when all funds are savings', () => {
    let data = save(seed(), 1000).data;
    const expense = applyExpenseSave(data, { merchant: 'Lunch', amount: '100', category: 'Food & Dining', wallet: 'main', date: '2026-11-25' }, '2026-11-25T04:00:00Z');
    expect(expense.ok).toBe(true); data = expense.data;
    const bill: BillViewModel = { ...data.library.bills[0], baseAmount: 50, paid: false, targetMonthForDue: month, daysLeft: 0, isOverridden: false };
    const paid = applyBillStatusToggle(data, bill, month); expect(paid.ok).toBe(true); data = paid.data;
    const transfer = applyLedgerSave(data, { id: 'transfer', editingId: null, title: 'Move', amount: '200', type: 'transfer', date: '2026-11-25', wallet: 'main', destinationWallet: 'cash', updateWallets: true });
    expect(transfer.ok).toBe(true); data = transfer.data;
    expect(data.wallets).toEqual({ main: 650, cash: 300 });
    expect(data.settings!.walletSavings!.main).toBe(1000);
    expect(readWalletSavings(data, 'main')).toEqual({ balance: 650, savings: 1000, available: 0, needsReview: true });
    expect(save(data, 500).ok).toBe(true);
  });
  it('preserves reserves through backup round-trips and ordinary settings saves; rejects invalid imports', () => {
    const data = save(seed(), 0.29).data; const restored = JSON.parse(JSON.stringify(data));
    expect(isValidFinanceBackup(restored)).toBe(true); expect(readWalletSavings(restored, 'main').available).toBe(999.71);
    expect(applySettingsForm(data.settings, createSettingsForm(data.settings, data.wallets)).walletSavings).toEqual({ main: 0.29 });
    for (const invalid of [null, [], { main: null }, { main: -1 }, { main: 1.001 }]) {
      const broken = { ...data, settings: { ...data.settings, walletSavings: invalid } } as unknown as UnifiedFinanceData;
      expect(isWalletSavingsMap(invalid)).toBe(false); expect(isValidFinanceBackup(broken)).toBe(false);
      expect(walletSavingsTotals(broken).needsReview).toBe(true);
    }
    expect(readWalletSavings({ ...data, settings: { walletSavings: { main: null } } } as unknown as UnifiedFinanceData, 'main').available).toBe(0);
  });
  it('retains overdrafts and missing/malformed balance warnings without adding fictitious cash', () => {
    const data = seed(); data.wallets.main = -50;
    expect(save(data, 1).ok).toBe(false); expect(save(data, 0).ok).toBe(true);
    expect(walletSavingsTotals(data).available).toBe(50); expect(budgetCash(data).available).toBe(50);
    data.wallets.main = NaN; expect(readWalletSavings(data, 'main').needsReview).toBe(true);
  });
});
