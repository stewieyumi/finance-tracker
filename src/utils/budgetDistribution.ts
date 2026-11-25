import type { UnifiedFinanceData, Receivable, ReceivableViewModel, ManualTransaction, ReceivedIncomeDraft } from '../types/finance';
import { validateActiveWalletAssignment, parseWalletBalance } from './financeHelpers';
import { expenseCents } from './expenseChanges';
import { applyAddPayment } from '../hooks/useReceivableActions';
import { budgetDateKey } from './budgeting';
import { getMonthKey } from './dateHelpers';

export interface BudgetDistributionInput {
  id: string;
  mode: 'received' | 'existing';
  sourceWallet: string;
  amount: number;
  allocations: Record<string, number>;
  name: string;
  receipt?: ReceivedIncomeDraft;
}

/** Commit income (if explicitly new) and all transfers atomically. Keeping money in its source is not another credit. */
export function applyBudgetDistribution(data: UnifiedFinanceData, input: BudgetDistributionInput, expectedWallets: UnifiedFinanceData['wallets']) {
  const reject = (error: string) => ({ ok: false as const, data, error });
  if (!input.id?.trim() || (input.mode !== 'received' && input.mode !== 'existing')) return reject('Invalid distribution. Reopen the planner.');
  const ids = data.budgetDistributionIds;
  if (ids !== undefined && (!Array.isArray(ids) || !ids.every(id => typeof id === 'string'))) return reject('Distribution history needs review.');
  if (ids?.includes(input.id)) return reject('This distribution was already recorded.');
  if (input.receipt) {
    const origin = input.receipt;
    const receipt = data.logs[origin.month]?.receivableSettlements?.[origin.inflowId]?.find(row => row.id === origin.receiptId);
    if (input.mode !== 'existing' || !receipt || receipt.reversedAt || receipt.wallet !== input.sourceWallet || receipt.amount !== origin.amount || input.amount > receipt.amount) return reject('The original receipt changed. Close this planner and review the inflow.');
  }
  const amount = expenseCents(input.amount);
  if (amount === null || amount <= 0 || !input.allocations || Array.isArray(input.allocations)) return reject('Enter a positive amount with at most two decimal places.');
  if (input.mode === 'received' && !input.name.trim()) return reject('Enter where this income came from.');
  const allocations: [string, number][] = [];
  let total = 0;
  for (const [wallet, value] of Object.entries(input.allocations)) {
    const cents = expenseCents(value);
    if (cents === null || !Number.isSafeInteger(total + cents)) return reject('Enter valid allocation amounts.');
    if (cents > 0) allocations.push([wallet, cents]);
    total += cents;
  }
  if (total !== amount) return reject(total > amount ? 'Allocations exceed the amount. Reduce them before distributing.' : 'Assign every peso first. Unassigned must be ₱0.00.');
  for (const wallet of new Set([input.sourceWallet, ...allocations.map(([wallet]) => wallet)])) {
    const validation = validateActiveWalletAssignment(wallet, data.settings, data.wallets);
    if (!validation.ok) return reject(validation.message);
    if (!Object.hasOwn(expectedWallets, wallet) || !Object.is(data.wallets[wallet], expectedWallets[wallet])) return reject('A wallet balance changed. Review the latest amounts before distributing.');
  }
  const source = parseWalletBalance(data.wallets[input.sourceWallet]);
  if (!source.isValid || (input.mode === 'existing' && Math.round(source.balance * 100) < amount)) return reject('The selected wallet cannot cover this amount.');
  let next = data;
  if (input.mode === 'received') {
    const inflowId = `budget-income-${input.id}`;
    if ([...data.library.receivables, ...(data.library.archivedReceivables ?? [])].some(inflow => inflow.id === inflowId)) return reject('This income was already recorded.');
    const receivable: Receivable = { id: inflowId, name: input.name.trim(), amount: input.amount, frequency: 'By Date',
      category: 'Other', wallet: input.sourceWallet, date: budgetDateKey() };
    const view: ReceivableViewModel = { ...receivable, amountReceived: 0, collected: false, targetMonthForDue: getMonthKey(new Date()) };
    const receipt = applyAddPayment({ ...data, library: { ...data.library, receivables: [...data.library.receivables, receivable] } }, view, input.amount, view.targetMonthForDue);
    if (!receipt.ok) return reject(receipt.error);
    next = receipt.data;
  }
  const wallets = { ...next.wallets };
  const keep = allocations.find(([wallet]) => wallet === input.sourceWallet)?.[1] ?? 0;
  const sourceCents = Math.round(wallets[input.sourceWallet] * 100);
  const debit = amount - keep;
  if (!Number.isSafeInteger(sourceCents) || sourceCents < debit) return reject('The source wallet cannot cover these transfers after receiving the income.');
  wallets[input.sourceWallet] = (sourceCents - debit) / 100;
  const transfers: ManualTransaction[] = [];
  for (const [wallet, cents] of allocations) {
    if (wallet === input.sourceWallet) continue;
    const current = Math.round(wallets[wallet] * 100);
    if (!Number.isSafeInteger(current + cents)) return reject('An allocated wallet balance would be out of range.');
    wallets[wallet] = (current + cents) / 100;
    const id = `budget-transfer-${input.id}-${wallet}`;
    if ((data.library.manualTransactions ?? []).some(entry => entry.id === id)) return reject('A transfer from this distribution already exists.');
    transfers.push({ id, title: 'Budget allocation', amount: cents / 100, type: 'transfer', wallet: input.sourceWallet,
      destinationWallet: wallet, date: budgetDateKey(), createdAt: Date.now(), postingMode: 'wallet', transferFee: 0 });
  }
  return { ok: true as const, data: { ...next, wallets, budgetDistributionIds: [...(ids ?? []), input.id],
    library: { ...next.library, manualTransactions: [...(next.library.manualTransactions ?? []), ...transfers] },
    updatedAt: Math.max(Date.now(), (Number.isFinite(data.updatedAt) ? data.updatedAt! : 0) + 1) } };
}
