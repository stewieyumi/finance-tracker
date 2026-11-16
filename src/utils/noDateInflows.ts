import type { Receivable, UnifiedFinanceData } from "../types/finance";
import { MONTH_LIST } from "../constants/config";
import { isValidDateKey } from "./dateHelpers";
import { isInflowMonth, isInflowMoney, readInflowIncome } from "./inflowIncome";
export { isInflowMonth, isInflowMoney } from "./inflowIncome";

const receiptDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !isValidDateKey(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const monthNumber = (month: string) => {
  const [name, year] = month.split(" ");
  return Number(year) * 12 + MONTH_LIST.indexOf(name);
};

/** A no-date inflow has one stored occurrence, never a monthly recurrence. */
export function noDateInflowState(data: UnifiedFinanceData, rec: Receivable, selectedMonth: string) {
  const month = rec.startMonth || "";
  const validAnchor = isInflowMonth(month) && isInflowMonth(selectedMonth);
  const record = data.logs?.[month]?.recsCollected?.[rec.id];
  const received = record?.amountReceived ?? 0;
  const validAmount = isInflowMoney(rec.amount) && rec.amount > 0;
  const validReceived = isInflowMoney(received);
  const rows = data.logs?.[month]?.receivableSettlements?.[rec.id];
  const receipts = Array.isArray(rows) ? rows : [];
  const receiptIds = new Set<string>();
  const validReceipts = (rows === undefined || Array.isArray(rows)) && receipts.every(row => {
    if (!row || typeof row.id !== "string" || !row.id || receiptIds.has(row.id) ||
      !isInflowMoney(row.amount) || !receiptDate(row.receivedAt)) return false;
    receiptIds.add(row.id);
    return true;
  });
  const receiptCents = receipts.reduce((sum, row) => sum + (row && !row.reversedAt && isInflowMoney(row.amount) ? Math.round(row.amount * 100) : 0), 0);
  const matchesReceipts = validReceived && Number.isSafeInteger(receiptCents) && receiptCents === Math.round(received * 100);
  const otherOccurrence = Object.entries(data.logs || {}).some(([key, log]) => key !== month &&
    (!!log?.recsCollected?.[rec.id] || !!log?.receivableSettlements?.[rec.id]?.length));
  const valid = validAnchor && validAmount && validReceived && validReceipts && matchesReceipts && !otherOccurrence;
  const collected = valid && received >= rec.amount;
  return {
    month, valid, collected,
    amountReceived: validReceived ? received : 0,
    visible: !valid || (monthNumber(selectedMonth) >= monthNumber(month) &&
      (!collected || selectedMonth === month))
  };
}

/** Compatibility entry point for the shipped no-date reader. */
export function noDateIncomeReceived(data: UnifiedFinanceData, period: string): number {
  return readInflowIncome(data, period, "No Specific Date").actual;
}
