import type { Expense, UnifiedFinanceData } from "../types/finance";
import { isValidDateKey, parseDateKey } from "./dateHelpers";
import { expenseMoneyIsLocked } from "./expenseChanges";
import { validateActiveWalletAssignment } from "./financeHelpers";
import { compareTransactionsNewestFirst, transactionDay } from "./transactionDates";

export interface FrequentExpense {
  key: string;
  merchant: string;
  amount: number;
  category: string;
  wallet: string;
}

/** Draft suggestions only: recent repeated purchases, using the latest eligible amount and wallet. */
export function readFrequentExpenses(data: UnifiedFinanceData, today: string): FrequentExpense[] {
  if (!isValidDateKey(today)) return [];
  const start = parseDateKey(today); start.setDate(start.getDate() - 89);
  const firstDay = transactionDay(start.toISOString());
  const expenses = data.library.expenses ?? [];
  const ids = new Map<string, number>();
  for (const expense of expenses) ids.set(expense.id, (ids.get(expense.id) ?? 0) + 1);
  const groups = new Map<string, { count: number; latest: Expense }>();
  for (const expense of expenses) {
    if (!expense.id || ids.get(expense.id) !== 1 || typeof expense.merchant !== "string" || !expense.merchant.trim() ||
      typeof expense.category !== "string" || !expense.category.trim() || !isValidDateKey(expense.date) ||
      expense.date < firstDay || expense.date > today || expense.amount <= 0 || expenseMoneyIsLocked(expense) ||
      !validateActiveWalletAssignment(expense.wallet, data.settings, data.wallets).ok) continue;
    const key = JSON.stringify([expense.merchant.trim().replace(/\s+/g, " ").toLowerCase(), expense.category.trim()]);
    const group = groups.get(key);
    groups.set(key, { count: (group?.count ?? 0) + 1,
      latest: !group || compareTransactionsNewestFirst(expense, group.latest) < 0 ? expense : group.latest });
  }
  return [...groups].filter(([, group]) => group.count >= 2)
    .sort(([ak, a], [bk, b]) => b.count - a.count || compareTransactionsNewestFirst(a.latest, b.latest) || ak.localeCompare(bk))
    .slice(0, 4).map(([key, { latest }]) => ({ key, merchant: latest.merchant.trim().replace(/\s+/g, " "),
      amount: latest.amount, category: latest.category.trim(), wallet: latest.wallet }));
}
