import type { Expense, UnifiedFinanceData } from '../types/finance';
import { isValidDateKey } from './dateHelpers';
import { parseWalletBalance, validateActiveWalletAssignment } from './financeHelpers';
import { generateId } from './idHelpers';

export interface ExpenseForm {
  merchant: string;
  amount: string;
  category: string;
  wallet: string;
  date: string;
}
export interface ExpenseChange {
  id: string;
  before?: Expense;
  after?: Expense;
  index: number;
  beforeRevision?: string;
}
export type ExpenseTransitionResult =
  | { ok: true; data: UnifiedFinanceData; expense?: Expense; refundAmount?: number; change?: ExpenseChange }
  | { ok: false; data: UnifiedFinanceData; error: string };

export function expenseCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(cents - value * 100) <= 1e-6 ? cents : null;
}
export function sameExpense(a: Expense, b: Expense): boolean {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key =>
    Object.is(a[key as keyof Expense], b[key as keyof Expense]));
}
export function expenseMoneyIsLocked(expense: Expense): boolean {
  const amount = expenseCents(expense.amount);
  const debit = expenseCents(expense.deductedAmount ?? expense.amount);
  return amount === null || debit === null || amount !== debit;
}
export function validExpenseRevisions(data: UnifiedFinanceData): boolean {
  const revisions = data.expenseRevisions;
  return revisions === undefined || (revisions !== null && typeof revisions === 'object' && !Array.isArray(revisions)
    && Object.entries(revisions).every(([id, value]) => id.trim() !== '' && typeof value === 'string' && value.trim() !== ''));
}
export function makeExpenseChange(data: UnifiedFinanceData, before: Expense | undefined, after: Expense | undefined, index: number): ExpenseChange {
  const id = (after ?? before)!.id;
  return { id: generateId('expense_change'), before: before && { ...before }, after: after && { ...after }, index,
    beforeRevision: data.expenseRevisions?.[id] };
}

/** Apply only the net recorded debit difference. Replays retain original wallets, including archived ones. */
export function applyExpenseReplay(prev: UnifiedFinanceData, change: ExpenseChange, direction: 'Undo' | 'Redo'): ExpenseTransitionResult {
  const expected = direction === 'Undo' ? change.after : change.before;
  const replacement = direction === 'Undo' ? change.before : change.after;
  const id = expected?.id ?? replacement?.id;
  const reject = (error: string): ExpenseTransitionResult => ({ ok: false, data: prev, error });
  if (!id || (expected && replacement && expected.id !== replacement.id)) return reject('Invalid expense history.');
  const expectedRevision = direction === 'Undo' ? change.id : change.beforeRevision;
  if (!validExpenseRevisions(prev) || prev.expenseRevisions?.[id] !== expectedRevision) {
    return reject('This expense has newer history. Review its current details before trying again.');
  }
  const expenses = prev.library.expenses ?? [];
  const matches = expenses.filter(expense => expense.id === id);
  if (expected ? matches.length !== 1 || !sameExpense(matches[0], expected) : matches.length !== 0) {
    return reject('This expense changed. Review its current details before trying again.');
  }
  const deltas = new Map<string, number>();
  for (const [record, sign] of [[expected, 1], [replacement, -1]] as const) {
    if (!record) continue;
    const amount = expenseCents(record.amount), debit = expenseCents(record.deductedAmount ?? record.amount);
    if (amount === null || debit === null) return reject('The recorded expense amount or deduction needs review.');
    if (!debit) continue;
    if (!record.wallet) return reject('The original expense wallet is unavailable.');
    deltas.set(record.wallet, (deltas.get(record.wallet) ?? 0) + sign * debit);
  }
  const wallets = { ...prev.wallets };
  for (const [wallet, delta] of deltas) {
    if (!delta) continue;
    const parsed = parseWalletBalance(wallets[wallet]);
    if (!parsed.isValid || !parsed.isPresent) return reject('An original expense wallet is missing or has an invalid balance.');
    const current = Math.round(parsed.balance * 100), next = current + delta;
    if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(next)) return reject('The adjusted wallet balance would be out of range.');
    if (delta < 0 && current < -delta) return reject('Insufficient balance to apply this expense change.');
    wallets[wallet] = next / 100;
  }
  const nextExpenses = [...expenses];
  if (expected) {
    const index = nextExpenses.findIndex(expense => expense.id === id);
    if (replacement) nextExpenses[index] = { ...replacement };
    else nextExpenses.splice(index, 1);
  } else if (replacement) {
    nextExpenses.splice(Math.max(0, Math.min(change.index, nextExpenses.length)), 0, { ...replacement });
  }
  const expenseRevisions = { ...prev.expenseRevisions };
  const nextRevision = direction === 'Undo' ? change.beforeRevision : change.id;
  if (nextRevision === undefined) delete expenseRevisions[id];
  else expenseRevisions[id] = nextRevision;
  return { ok: true, data: { ...prev, expenseRevisions, wallets, library: { ...prev.library, expenses: nextExpenses },
    updatedAt: Math.max(Date.now(), (Number.isFinite(prev.updatedAt) ? prev.updatedAt! : 0) + 1) }, expense: replacement };
}

export function applyExpenseEdit(prev: UnifiedFinanceData, expected: Expense, form: ExpenseForm,
  expectedRevision: string | null = prev.expenseRevisions?.[expected.id] ?? null): ExpenseTransitionResult {
  const reject = (error: string): ExpenseTransitionResult => ({ ok: false, data: prev, error });
  if (!validExpenseRevisions(prev) || (prev.expenseRevisions?.[expected.id] ?? null) !== expectedRevision) {
    return reject('This expense has newer history. Close the editor and reopen its current details.');
  }
  const matches = (prev.library.expenses ?? []).filter(expense => expense.id === expected.id);
  if (matches.length !== 1 || !sameExpense(matches[0], expected)) return reject('This expense changed. Close the editor and reopen its current details.');
  const current = matches[0];
  const amount = Number(form.amount), cents = expenseCents(amount);
  if (!form.merchant.trim() || cents === null || cents <= 0) return reject('Enter a name and a valid amount with at most two decimal places.');
  if (!isValidDateKey(form.date) && form.date !== current.date) return reject('Choose a valid transaction date.');
  const moneyChanged = amount !== current.amount || form.wallet !== current.wallet;
  if (moneyChanged && expenseMoneyIsLocked(current)) return reject('This entry has a separate wallet deduction. Amount and wallet changes need review.');
  // A refund can return to its original archived wallet. A new/increased debit requires an active wallet.
  if (moneyChanged && (form.wallet !== current.wallet || amount > current.amount)) {
    const route = validateActiveWalletAssignment(form.wallet, prev.settings, prev.wallets);
    if (!route.ok) return reject(route.message);
  }
  const after: Expense = { ...current, merchant: form.merchant.trim(), amount, category: form.category, wallet: form.wallet, date: form.date,
    ...(moneyChanged ? { deductedAmount: amount } : {}) };
  if (sameExpense(current, after)) return { ok: true, data: prev, expense: current };
  const change = makeExpenseChange(prev, current, after, prev.library.expenses!.findIndex(expense => expense.id === current.id));
  const result = applyExpenseReplay(prev, change, 'Redo');
  return result.ok ? { ...result, change } : result;
}
