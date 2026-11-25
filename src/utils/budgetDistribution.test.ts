import { describe, expect, it, vi, afterEach } from 'vitest';
import { INITIAL_UNIFIED_DATA } from '../constants/initialData';
import type { UnifiedFinanceData } from '../types/finance';
import { applyBudgetDistribution, type BudgetDistributionInput } from './budgetDistribution';
import { getMonthKey } from './dateHelpers';
import { readInflowIncome } from './inflowIncome';
import { buildTransactionHistory } from './transactionHistory';
import { isValidFinanceBackup } from './validationHelpers';

function seed(): UnifiedFinanceData {
  const data = structuredClone(INITIAL_UNIFIED_DATA);
  data.wallets = { main: 1000, cash: 100, savings: 500 };
  data.settings = { ...data.settings, customWallets: [{ id: 'main', label: 'Bank' }, { id: 'cash', label: 'Cash' }, { id: 'savings', label: 'Savings' }] };
  return data;
}
const input = (overrides: Partial<BudgetDistributionInput> = {}): BudgetDistributionInput => ({
  id: 'one', mode: 'existing', sourceWallet: 'main', amount: 1000, allocations: { main: 200, cash: 300, savings: 500 }, name: 'Client payment', ...overrides,
});
const total = (data: UnifiedFinanceData) => Object.values(data.wallets).reduce((sum, value) => sum + Math.round(value * 100), 0);
afterEach(() => vi.useRealTimers());

describe('atomic budget distribution', () => {
  it('moves existing cash, keeps the source allocation without recrediting it, and adds only transfer history', () => {
    const data = seed(); const snapshot = structuredClone(data);
    const result = applyBudgetDistribution(data, input(), data.wallets);
    expect(result.ok).toBe(true); expect(result.data.wallets).toEqual({ main: 200, cash: 400, savings: 1000 });
    expect(total(result.data)).toBe(total(data)); expect(data).toEqual(snapshot);
    expect(result.data.library.manualTransactions).toHaveLength(2);
    expect(result.data.library.receivables).toHaveLength(0);
    expect(buildTransactionHistory(result.data).filter(tx => !tx.isTransfer)).toHaveLength(0);
    expect(isValidFinanceBackup(result.data)).toBe(true);
  });
  it('records new irregular income exactly once and then transfers it without changing its total value', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T08:00:00Z'));
    const data = seed();
    const result = applyBudgetDistribution(data, input({ mode: 'received' }), data.wallets);
    expect(result.ok).toBe(true); expect(total(result.data) - total(data)).toBe(100000);
    expect(result.data.wallets).toEqual({ main: 1200, cash: 400, savings: 1000 });
    expect(result.data.library.receivables).toHaveLength(1);
    expect(readInflowIncome(result.data, 'November 2026').actual).toBe(1000);
    expect(buildTransactionHistory(result.data).filter(tx => tx.type === 'inflow' && !tx.isTransfer).reduce((sum, tx) => sum + tx.amount, 0)).toBe(1000);
    expect(applyBudgetDistribution(result.data, input({ mode: 'received' }), result.data.wallets).ok).toBe(false);
  });
  it('can keep all cash in its source without moving or adding money, and still prevents replay', () => {
    const data = seed(); const result = applyBudgetDistribution(data, input({ allocations: { main: 1000 } }), data.wallets);
    expect(result.ok).toBe(true); expect(result.data.wallets).toEqual(data.wallets);
    expect(result.data.library.manualTransactions).toEqual([]);
    expect(applyBudgetDistribution(result.data, input({ allocations: { main: 1000 } }), result.data.wallets).ok).toBe(false);
  });
  it.each([
    { allocations: { cash: 999 } }, { allocations: { cash: 1001 } },
    { amount: 1000.001 }, { amount: NaN }, { amount: Infinity }, { amount: -1 },
    { sourceWallet: 'missing' }, { allocations: { missing: 1000 } }, { allocations: { cash: -1, savings: 1001 } },
    { allocations: { cash: 1000.001 } }, { amount: 2000, allocations: { cash: 2000 } },
  ] as Partial<BudgetDistributionInput>[])('rejects invalid or unfunded allocations atomically: %j', overrides => {
    const data = seed(); const snapshot = structuredClone(data); const result = applyBudgetDistribution(data, input(overrides), data.wallets);
    expect(result.ok).toBe(false); expect(result.data).toBe(data); expect(data).toEqual(snapshot);
  });
  it('rejects stale balances, archived destinations, and duplicate wallet metadata before recording income', () => {
    const data = seed(); const expected = { ...data.wallets }; data.wallets.cash = 99;
    expect(applyBudgetDistribution(data, input({ mode: 'received' }), expected).ok).toBe(false);
    data.settings!.customWallets = data.settings!.customWallets!.filter(wallet => wallet.id !== 'savings');
    data.settings!.archivedWallets = [{ id: 'savings', label: 'Old savings' }];
    expect(applyBudgetDistribution(data, input({ mode: 'received' }), data.wallets).ok).toBe(false);
    expect(data.library.receivables).toHaveLength(0);
  });
  it('rolls the whole operation back when a later destination overflows after the staged receipt', () => {
    const data = seed(); data.wallets.savings = Number.MAX_SAFE_INTEGER / 100;
    const result = applyBudgetDistribution(data, input({ mode: 'received' }), data.wallets);
    expect(result.ok).toBe(false); expect(result.data).toBe(data); expect(data.library.receivables).toHaveLength(0); expect(data.wallets.main).toBe(1000);
  });
  it('validates a receipt-prompt provenance without adding that receipt again; rejects reversed receipts', () => {
    const data = seed(); const month = getMonthKey(new Date());
    data.logs[month] = { receivableSettlements: { inflow: [{ id: 'receipt', receivedAt: new Date().toISOString(), amount: 1000, wallet: 'main', walletCredit: 1000 }] } };
    const request = input({ receipt: { receiptId: 'receipt', inflowId: 'inflow', month, wallet: 'main', amount: 1000, name: 'Client' } });
    const result = applyBudgetDistribution(data, request, data.wallets); expect(result.ok).toBe(true); expect(total(result.data)).toBe(total(data));
    data.logs[month].receivableSettlements!.inflow[0].reversedAt = new Date().toISOString();
    expect(applyBudgetDistribution(data, request, data.wallets).ok).toBe(false);
    expect(applyBudgetDistribution(data, { ...request, mode: 'received' }, data.wallets).ok).toBe(false);
  });
  it('distributes fractions exactly and rejects a missing income name', () => {
    const data = seed(); const result = applyBudgetDistribution(data, input({ amount: 0.3, allocations: { main: 0.1, cash: 0.2 } }), data.wallets);
    expect(result.ok).toBe(true); expect(total(result.data)).toBe(total(data)); expect(result.data.wallets.main).toBe(999.8);
    expect(applyBudgetDistribution(data, input({ mode: 'received', name: ' ' }), data.wallets).ok).toBe(false);
  });
});
