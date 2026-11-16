import { MONTH_LIST } from "../constants/config";

// Transaction dates and logging times are separate: backdating never changes loggedAt.
export function transactionTimestamp(value?: string | number): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !value.includes("T"))) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function transactionDay(value: string): string {
  if (!value) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (!Number.isFinite(date.getTime())) return "";
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return dateOnly && day !== value ? "" : day;
}

interface DatedTransaction {
  id: string;
  date: string;
  loggedAt?: string;
  createdAt?: number;
  confirmedIncomeMonth?: string;
}

export function confirmedTransactionMonth(tx: DatedTransaction): string {
  const match = /^([A-Za-z]+) ([1-9]\d{3})$/.exec(tx.confirmedIncomeMonth ?? "");
  const index = match ? MONTH_LIST.indexOf(match[1]) : -1;
  return match && index >= 0 ? `${match[2]}-${String(index + 1).padStart(2, "0")}` : "";
}

export function transactionMonth(tx: DatedTransaction): string {
  return confirmedTransactionMonth(tx) || transactionDay(tx.date).slice(0, 7);
}

export function formatHistoryDate(tx: DatedTransaction, format = formatTransactionDateTime): string {
  return confirmedTransactionMonth(tx)
    ? `${tx.confirmedIncomeMonth} · Exact day unknown · Original date: ${format(tx.date, tx.loggedAt)}`
    : format(tx.date, tx.loggedAt);
}

export function compareTransactionsNewestFirst(a: DatedTransaction, b: DatedTransaction): number {
  const monthOrder = transactionMonth(b).localeCompare(transactionMonth(a));
  if (monthOrder) return monthOrder;
  const aConfirmed = !!confirmedTransactionMonth(a), bConfirmed = !!confirmedTransactionMonth(b);
  // Month-only receipts follow dated entries in that month; never assign them a day.
  if (aConfirmed !== bConfirmed) return aConfirmed ? 1 : -1;
  const dayOrder = transactionDay(b.date).localeCompare(transactionDay(a.date));
  if (dayOrder) return dayOrder;
  const aTime = transactionTimestamp(a.loggedAt) ?? transactionTimestamp(a.createdAt) ?? transactionTimestamp(a.date);
  const bTime = transactionTimestamp(b.loggedAt) ?? transactionTimestamp(b.createdAt) ?? transactionTimestamp(b.date);
  if (aTime !== bTime) {
    if (aTime === undefined) return 1;
    if (bTime === undefined) return -1;
    return bTime - aTime;
  }
  return b.id.localeCompare(a.id);
}

export function formatTransactionDateTime(dateStr: string, loggedAt?: string | number): string {
  const day = transactionDay(dateStr);
  if (!day) return dateStr || "";
  const date = new Date(`${day}T12:00:00`);
  const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timestamp = transactionTimestamp(loggedAt) ?? transactionTimestamp(dateStr);
  if (timestamp === undefined) return dateLabel;
  const logged = new Date(timestamp);
  const timeLabel = logged.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (transactionDay(logged.toISOString()) === day) return `${dateLabel} · ${timeLabel}`;
  const loggedDay = logged.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${dateLabel} · Logged ${loggedDay}, ${timeLabel}`;
}
