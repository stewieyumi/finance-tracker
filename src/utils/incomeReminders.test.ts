import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { UnifiedFinanceData } from '../types/finance';
import { INCOME_REMINDER_DELAY, readIncomeReminders } from './incomeReminders';
import { useNotifications } from '../hooks/useNotifications';
const receivedAt = '2026-11-28T04:00:00.000Z';
const instant = Date.parse(receivedAt);
const seed = (): UnifiedFinanceData => ({ wallets: { main: 1000 }, settings: { customWallets: [{ id: 'main', label: 'Bank' }] }, library: { bills: [], receivables: [{ id: 'client', name: 'Client', amount: 1000, frequency: 'Monthly' }], shoots: [] }, logs: { 'November 2026': { receivableSettlements: { client: [{ id: 'receipt', receivedAt, amount: 1000, wallet: 'main', walletCredit: 1000 }] } } } });

describe('received income reminders', () => {
  it('waits two minutes and reads the actual credited receipt without changing records', () => {
    const d = seed(); const before = structuredClone(d);
    expect(readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY - 1))).toEqual({ notifications: [], nextUpdateAt: instant + INCOME_REMINDER_DELAY });
    const result = readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY));
    expect(result.notifications[0]).toMatchObject({ id: 'received_income_receipt', type: 'received_income', actionRoute: 'budget/distribute', incomeReceipt: { receiptId: 'receipt', inflowId: 'client', month: 'November 2026', wallet: 'main', amount: 1000, name: 'Client' } });
    expect(d).toEqual(before);
  });
  it('does not suggest allocating reversed, history-only, duplicated or invalid receipts', () => {
    for (const patch of [{ reversedAt: receivedAt }, { walletCredit: 0 }, { walletCredit: 500 }, { amount: NaN }, { receivedAt: '2026-11-28' }, { receivedAt: '2026-02-30T04:00:00Z' }, { receivedAt: '2026-11-28T24:00:00Z' }]) {
      const d = seed(); Object.assign(d.logs['November 2026'].receivableSettlements!.client[0], patch);
      expect(readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY)).notifications).toEqual([]);
    }
    const d = seed(); const rows = d.logs['November 2026'].receivableSettlements!.client; rows.push({ ...rows[0] });
    expect(readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY)).notifications).toEqual([]);
  });
  it('honours dismissal and omits archived wallets, future receipts and receipts older than a week', () => {
    const d = seed(); d.settings!.dismissedNotifications = { received_income_receipt: instant };
    expect(readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY)).notifications).toEqual([]);
    delete d.settings!.dismissedNotifications; d.settings!.customWallets = [];
    expect(readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY)).notifications).toEqual([]);
    expect(readIncomeReminders(seed(), new Date(instant - 1)).notifications).toEqual([]);
    expect(readIncomeReminders(seed(), new Date(instant + 7 * 86400000)).notifications).toEqual([]);
  });
  it('does not remind about income recorded and allocated together by Budget Plan', () => {
    const d = seed(); d.library.receivables[0].id = 'budget-income-allocation'; d.budgetDistributionIds = ['allocation'];
    d.logs['November 2026'].receivableSettlements = { 'budget-income-allocation': d.logs['November 2026'].receivableSettlements!.client };
    expect(readIncomeReminders(d, new Date(instant + INCOME_REMINDER_DELAY)).notifications).toEqual([]);
  });
  it('refreshes the bell when the two-minute delay elapses without a data mutation', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
    try {
      const { result, unmount } = renderHook(() => useNotifications(seed()));
      expect(result.current.some(n => n.type === 'received_income')).toBe(false);
      act(() => vi.advanceTimersByTime(INCOME_REMINDER_DELAY + 1));
      expect(result.current.filter(n => n.type === 'received_income')).toHaveLength(1);
      unmount();
    } finally { vi.useRealTimers(); }
  });
});
