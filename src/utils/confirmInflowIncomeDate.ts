import type { UnifiedFinanceData, ReceivableIncomeMonths } from '../types/finance';
import { getMonthKey, isValidDateKey, parseDateKey } from './dateHelpers';
import { countIncomeReceiptIds, resolveIncomeMonths } from './inflowIncome';

/** Reporting metadata only: never recollect, change the source receipt, or move money. */
export function confirmInflowIncomeDate(data: UnifiedFinanceData, bucket: string, id: string, date: string, receiptId?: string) {
  const reject = () => ({ ok: false as const, data, error: 'The confirmed receipt changed or the payment date does not match its month.' });
  const identities = [...data.library.receivables, ...(data.library.archivedReceivables ?? [])].filter(row => row.id === id);
  const log = data.logs[bucket];
  if (identities.length !== 1 || !log || !isValidDateKey(date)) return reject();
  const resolved = resolveIncomeMonths(log, id, countIncomeReceiptIds(data.logs));
  const month = receiptId ? resolved.receipts.get(receiptId) : resolved.legacy;
  const existing = log.receivableIncomeMonths?.[id];
  const metadata = receiptId ? existing?.receipts?.[receiptId] : existing?.legacy;
  if (resolved.needsReview || !month || !metadata || metadata.date !== undefined || getMonthKey(parseDateKey(date)) !== month) return reject();
  const updated: ReceivableIncomeMonths = { ...existing };
  if (receiptId) {
    const row = existing?.receipts?.[receiptId];
    if (!row) return reject();
    updated.receipts = { ...existing?.receipts, [receiptId]: { ...row, date } };
  } else {
    if (!existing?.legacy) return reject();
    updated.legacy = { ...existing.legacy, date };
  }
  const next: UnifiedFinanceData = { ...data, logs: { ...data.logs, [bucket]: { ...log, receivableIncomeMonths: { ...log.receivableIncomeMonths, [id]: updated } } },
    updatedAt: Math.max(Date.now(), (Number.isFinite(data.updatedAt) ? data.updatedAt! : 0) + 1) };
  if (resolveIncomeMonths(next.logs[bucket], id, countIncomeReceiptIds(next.logs)).needsReview) return reject();
  return { ok: true as const, data: next };
}
