import { describe, expect, it } from 'vitest';
import { confirmInflowIncomeDate } from './confirmInflowIncomeDate';
import { readInflowIncome } from './inflowIncome';
import { buildTransactionHistory } from './transactionHistory';
import type { UnifiedFinanceData } from '../types/finance';
const fixture = (): UnifiedFinanceData => ({ wallets: { cash: 200 }, settings: {}, library: { bills: [], shoots: [], expenses: [], receivables: [
  { id: 'r', name: 'Synthetic completed shoot', amount: 3000, category: 'Shoot', frequency: 'By Date', date: '' },
] }, logs: { 'November 2026': { recsCollected: { r: { amountReceived: 3000, collected: true } }, paymentDates: { r: '2026-11-02T04:00:00Z' },
  receivableIncomeMonths: { r: { legacy: { month: 'November 2026', amount: 3000, confirmedAt: '2026-11-17T04:00:00Z', paymentDate: '2026-11-02T04:00:00Z', sourceReceipts: [] } } } } } });
describe('confirmed receipt day metadata', () => {
  it('preserves balances, status, amount and original timestamps while replacing the month-only display', () => {
    const data = fixture(), before = structuredClone(data); expect(readInflowIncome(data, 'November 2026').confirmedMonthOnly).toBe(3000);
    const result = confirmInflowIncomeDate(data, 'November 2026', 'r', '2026-11-01'); expect(result.ok).toBe(true);
    expect(result.data.wallets).toEqual(before.wallets); expect(result.data.library).toEqual(before.library);
    expect(result.data.logs['November 2026'].paymentDates).toEqual(before.logs['November 2026'].paymentDates);
    expect(result.data.logs['November 2026'].recsCollected).toEqual(before.logs['November 2026'].recsCollected);
    expect(readInflowIncome(result.data, 'November 2026')).toEqual({ actual: 3000, historicalDateUnverified: 0, needsReview: false });
    expect(readInflowIncome(result.data, '2026').actual).toBe(3000);
    expect(buildTransactionHistory(result.data)[0]).toMatchObject({ date: '2026-11-01', amount: 3000 });
    expect(buildTransactionHistory(result.data)[0].confirmedIncomeMonth).toBeUndefined(); expect(data).toEqual(before);
    expect(confirmInflowIncomeDate(result.data, 'November 2026', 'r', '2026-11-01').ok).toBe(false);
  });
  it.each(['2026-10-01', '2026-11-31', '', '2026-11-01T00:00:00Z'])('rejects invalid or mismatched day %s', date => {
    const data = fixture(); const result = confirmInflowIncomeDate(data, 'November 2026', 'r', date); expect(result.ok).toBe(false); expect(result.data).toBe(data);
  });
  it('rejects stale metadata and fails closed on malformed stored dates', () => {
    const data = fixture(); data.logs['November 2026'].paymentDates!.r = '2026-11-03'; expect(confirmInflowIncomeDate(data, 'November 2026', 'r', '2026-11-01').ok).toBe(false);
    data.logs['November 2026'].receivableIncomeMonths!.r.legacy!.date = '2026-10-01'; expect(readInflowIncome(data, 'November 2026').needsReview).toBe(true);
  });
  it('confirms one recorded receipt without changing its recorded provenance', () => {
    const data = fixture(); const row = { id: 'receipt', amount: 3000, wallet: 'cash', walletCredit: 3000, receivedAt: '2026-11-02T04:00:00Z' };
    const log = data.logs['November 2026']; log.receivableSettlements = { r: [row] }; log.receivableIncomeMonths = { r: { receipts: { receipt: { month: 'November 2026', amount: 3000, confirmedAt: '2026-11-17T04:00:00Z', source: { ...row } } } } };
    const result = confirmInflowIncomeDate(data, 'November 2026', 'r', '2026-11-01', 'receipt'); expect(result.ok).toBe(true);
    expect(result.data.logs['November 2026'].receivableSettlements!.r[0]).toEqual(row);
    expect(readInflowIncome(result.data, 'November 2026').confirmedMonthOnly).toBeUndefined(); expect(buildTransactionHistory(result.data)[0].date).toBe('2026-11-01');
  });
});
