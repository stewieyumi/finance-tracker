import type { EmergencyFundGoal, UnifiedFinanceData } from '../types/finance';
import { budgetCash, budgetDateKey, effectiveBudget, readBudgetSpending, readDailyBudget } from './budgeting';
import { expenseCents } from './expenseChanges';
import { validateActiveWalletAssignment } from './financeHelpers';
import { readInflowIncome } from './inflowIncome';
import { enabledSavingsWalletIds, readWalletSavings } from './walletSavings';

export function isEmergencyFundGoal(value: unknown): value is EmergencyFundGoal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const goal = value as Record<string, unknown>;
  const target = expenseCents(goal.target);
  return target !== null && target > 0 && Array.isArray(goal.walletIds) && goal.walletIds.length > 0 &&
    goal.walletIds.every(id => typeof id === 'string' && id.trim()) && new Set(goal.walletIds).size === goal.walletIds.length;
}

export function applyEmergencyFundGoal(data: UnifiedFinanceData, next: EmergencyFundGoal | null, expected: unknown) {
  const reject = (error: string) => ({ ok: false as const, data, error });
  if (JSON.stringify(data.settings?.emergencyFundGoal) !== JSON.stringify(expected)) return reject('This emergency-fund goal changed. Cancel and reopen its current details.');
  if (next !== null && !isEmergencyFundGoal(next)) return reject('Enter a positive target with at most two decimal places and choose a Savings wallet.');
  const enabled = enabledSavingsWalletIds(data.settings);
  if (next?.walletIds.some(id => !enabled.includes(id) || !validateActiveWalletAssignment(id, data.settings, data.wallets).ok || readWalletSavings(data, id).needsReview)) return reject('Review the selected Savings wallets before saving this goal.');
  return { ok: true as const, data: { ...data, settings: { ...data.settings, emergencyFundGoal: next && structuredClone(next) },
    updatedAt: Math.max(Date.now(), (Number.isFinite(data.updatedAt) ? data.updatedAt! : 0) + 1) } };
}

/** A goal labels existing Savings; it never adds cash or subtracts the same reserve again. */
export function readEmergencyFund(data: UnifiedFinanceData) {
  const raw = data.settings?.emergencyFundGoal;
  const goal = isEmergencyFundGoal(raw) ? raw : undefined;
  let savedCents = 0, needsReview = raw != null && !goal;
  const enabled = enabledSavingsWalletIds(data.settings);
  for (const id of goal?.walletIds ?? []) {
    if (!enabled.includes(id) || !validateActiveWalletAssignment(id, data.settings, data.wallets).ok) { needsReview = true; continue; }
    const funds = readWalletSavings(data, id);
    needsReview ||= funds.needsReview;
    if (funds.balance === null || funds.savings === null) continue;
    savedCents += Math.round(Math.min(Math.max(0, funds.balance), funds.savings) * 100);
  }
  if (!Number.isSafeInteger(savedCents)) { savedCents = 0; needsReview = true; }
  const targetCents = goal ? expenseCents(goal.target)! : 0;
  return { goal, saved: savedCents / 100, remaining: goal ? Math.max(0, targetCents - savedCents) / 100 : null,
    percent: goal ? Math.min(100, savedCents / targetCents * 100) : null,
    reached: !!goal && !needsReview && savedCents >= targetCents, needsReview };
}

/** Current active cash and the selected view's commitments; activity uses actual receipt/transaction dates. */
export function readFinancialCheckup(data: UnifiedFinanceData, month: string, unpaidCommitments: number, today = budgetDateKey()) {
  const cash = budgetCash(data);
  const unpaid = expenseCents(unpaidCommitments);
  const afterCommitments = unpaid === null ? null : (Math.round(cash.available * 100) - unpaid) / 100;
  const spending = readBudgetSpending(data, month);
  const income = readInflowIncome(data, month);
  const effective = effectiveBudget(data, month);
  const daily = effective.budget ? readDailyBudget(data, month, effective.budget, today) : undefined;
  const emergency = readEmergencyFund(data);
  const needsReview = cash.needsReview || unpaid === null || spending.excluded > 0 || income.needsReview || !!effective.needsReview || !!daily?.funding.needsReview || emergency.needsReview;
  let nextAction = 'Use your daily guide and review upcoming payments before choosing extra spending.';
  if (needsReview) nextAction = 'Review flagged wallets or payment history before relying on these totals.';
  else if (afterCommitments! < 0) nextAction = 'Available cash does not cover the selected view’s unpaid commitments. Review payment dates and the budget before planning extra spending.';
  else if (!daily) nextAction = 'Build a budget with the date this money must last and your usual daily essentials.';
  else if (daily.ended || daily.future) nextAction = 'Your budget period is not active today. Review its dates before using a daily spending guide.';
  else if (daily.todaySpent > daily.todayCap) nextAction = 'Today’s spending is above its guide. Review flexible spending and the remaining days; recorded expenses stay intact.';
  else if (daily.reviews.length) nextAction = `Review categories above their chosen limits: ${daily.reviews.map(([category]) => category).join(', ')}.`;
  return { cash, unpaid: unpaid === null ? null : unpaid / 100, afterCommitments, spending, income, daily, emergency, needsReview, nextAction, today };
}
