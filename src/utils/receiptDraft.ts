import type { Expense } from "../types/finance";

const money = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const currency = String.raw`(?:₱|PHP\s*|PhP\s*)`;
const amountLine = new RegExp(String.raw`^\s*(?:amount paid|amount charged|total paid|total amount|grand total|total)\s*[:=]\s*(?:${currency})?\s*${money}\s*(?:PHP)?\s*$`, "gim");
const paidMessage = new RegExp(String.raw`^\s*(?:you\s+)?paid\s+${currency}\s*${money}\s+to\s+([^\r\n]+?)\s*$`, "im");

export function readReceiptDraft(text: string) {
  const payment = text.match(paidMessage);
  const merchant = (
    text.match(/^\s*(?:merchant|billed by|paid to)\s*[:=]\s*([^\r\n]+?)\s*$/im)?.[1] ??
    payment?.[2]
  )?.trim().slice(0, 120);

  const amounts = [...text.matchAll(amountLine)].map(match => match[1]);
  if (payment) amounts.push(payment[1]);
  const values = new Set(amounts.map(amount => Number(amount.replaceAll(",", ""))));
  const value = values.size === 1 ? values.values().next().value : undefined;
  const amount = value !== undefined && value > 0 && value <= 10_000_000 ? String(value) : undefined;

  const dateCandidate = text.match(/^\s*(?:date|transaction date|payment date)\s*[:=]\s*(\d{4}-\d{2}-\d{2})(?:[T ]\d.*)?\s*$/im)?.[1];
  const dateValue = dateCandidate ? new Date(dateCandidate + "T00:00:00Z") : null;
  const date = dateValue && Number.isFinite(dateValue.getTime()) &&
    dateValue.toISOString().slice(0, 10) === dateCandidate ? dateCandidate : undefined;
  return { merchant, amount, date };
}

export function findPossibleDuplicateExpense(
  expenses: Expense[],
  draft: { merchant: string; amount: string; date: string }
) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const merchant = normalize(draft.merchant);
  const amount = Number(draft.amount);
  if (!merchant || !Number.isFinite(amount) || amount <= 0 || !draft.date) return undefined;

  return expenses.find(expense =>
    expense.date === draft.date &&
    Math.round(expense.amount * 100) === Math.round(amount * 100) &&
    normalize(expense.merchant) === merchant
  );
}
