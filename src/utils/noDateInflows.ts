import type { Receivable, UnifiedFinanceData } from "../types/finance";
import { MONTH_LIST } from "../constants/config";
import { getMonthKey, isValidDateKey } from "./dateHelpers";
import { roundMoney } from "./currency";

export function isInflowMonth(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^([A-Za-z]+) ([1-9]\d{3})$/.exec(value);
  return !!match && MONTH_LIST.includes(match[1]);
}

export const isInflowMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  Number.isSafeInteger(Math.round(value * 100)) && value === roundMoney(value);

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

/** Actual receipts for this new type use their timestamps, not the occurrence bucket. */
export function noDateIncomeReceived(data: UnifiedFinanceData, period: string): number {
  const ids = new Set([
    ...(data.library?.receivables || []), ...(data.library?.archivedReceivables || [])
  ].filter(rec => rec.frequency === "No Specific Date").map(rec => rec.id));
  const seen = new Set<string>();
  let cents = 0;
  for (const log of Object.values(data.logs || {})) {
    for (const id of ids) {
      const rows = log?.receivableSettlements?.[id];
      if (!Array.isArray(rows)) continue;
      for (const receipt of rows) {
        if (!receipt || receipt.reversedAt || !receipt.id || seen.has(receipt.id)) continue;
        seen.add(receipt.id);
        const date = receiptDate(receipt.receivedAt);
        if (!date || !isInflowMoney(receipt.amount)) continue;
        if ((isInflowMonth(period) && getMonthKey(date) === period) ||
          (/^[1-9]\d{3}$/.test(period) && String(date.getFullYear()) === period)) {
          cents += Math.round(receipt.amount * 100);
        }
      }
    }
  }
  return Number.isSafeInteger(cents) ? cents / 100 : 0;
}
