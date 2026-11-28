import type { AppNotification, UnifiedFinanceData } from '../types/finance';
import { expenseCents } from './expenseChanges';
import { validateActiveWalletAssignment } from './financeHelpers';
import { transactionTimestamp } from './transactionDates';
import { isValidDateKey } from './dateHelpers';
import { formatPHP } from './currency';

export const INCOME_REMINDER_DELAY = 2 * 60 * 1000;
const RECENT_INCOME_WINDOW = 7 * 24 * 60 * 60 * 1000;

/** Read-only reminders for recent, unreversed receipts actually credited to a wallet. */
export function readIncomeReminders(data: UnifiedFinanceData, now = new Date()): { notifications: AppNotification[]; nextUpdateAt?: number } {
  const notifications: AppNotification[] = [];
  const clock = now.getTime();
  if (!Number.isFinite(clock)) return { notifications };
  const rows = Object.entries(data.logs ?? {}).flatMap(([month, log]) =>
    Object.entries(log?.receivableSettlements ?? {}).flatMap(([inflowId, entries]) =>
      Array.isArray(entries) ? entries.map(receipt => ({ month, inflowId, receipt })) : []));
  const counts = new Map<string, number>();
  for (const { receipt } of rows) if (receipt?.id) counts.set(receipt.id, (counts.get(receipt.id) ?? 0) + 1);
  const inflows = [...(data.library?.receivables ?? []), ...(data.library?.archivedReceivables ?? [])];
  let nextUpdateAt = Infinity;
  for (const { month, inflowId, receipt } of rows) {
    if (typeof receipt?.id !== 'string' || !receipt.id || counts.get(receipt.id) !== 1 || receipt.reversedAt || !receipt.wallet) continue;
    if (inflowId.startsWith('budget-income-') && Array.isArray(data.budgetDistributionIds) && data.budgetDistributionIds.includes(inflowId.slice('budget-income-'.length))) continue;
    const id = `received_income_${receipt.id}`;
    if (data.settings?.dismissedNotifications?.[id]) continue;
    if (typeof receipt.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(receipt.receivedAt) || !isValidDateKey(receipt.receivedAt.slice(0, 10))) continue;
    const amount = expenseCents(receipt.amount);
    const received = transactionTimestamp(receipt.receivedAt);
    const inflow = inflows.find(row => row.id === inflowId);
    if (!inflow || inflows.filter(row => row.id === inflowId).length !== 1 || amount === null || amount <= 0 || receipt.walletCredit !== receipt.amount || received === undefined || received > clock || clock >= received + RECENT_INCOME_WINDOW) continue;
    if (!validateActiveWalletAssignment(receipt.wallet, data.settings, data.wallets).ok) continue;
    const readyAt = received + INCOME_REMINDER_DELAY;
    if (clock < readyAt) { nextUpdateAt = Math.min(nextUpdateAt, readyAt); continue; }
    nextUpdateAt = Math.min(nextUpdateAt, received + RECENT_INCOME_WINDOW);
    notifications.push({ id, type: 'received_income', title: `Inflow received: ${inflow.name}`,
      message: `${formatPHP(receipt.amount)} received for ${inflow.name}. This receipt was already added to your wallet. Distribute when you’re ready.`,
      amount: receipt.amount, date: receipt.receivedAt, actionRoute: 'budget/distribute', targetId: inflowId,
      incomeReceipt: { receiptId: receipt.id, inflowId, month, wallet: receipt.wallet, amount: receipt.amount, name: inflow.name } });
  }
  notifications.sort((a, b) => (transactionTimestamp(b.date) ?? 0) - (transactionTimestamp(a.date) ?? 0));
  return { notifications, ...(Number.isFinite(nextUpdateAt) ? { nextUpdateAt } : {}) };
}
