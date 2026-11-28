import type { TransactionHistoryItem } from "../types/finance";
import { confirmedTransactionMonth, transactionDay } from "./transactionDates";

// Quote all text and neutralize spreadsheet formulas, including whitespace-prefixed payloads.
const cell = (text: string) => `"${(/^[\s\uFEFF]*[=+@-]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;

export function transactionCsv(rows: TransactionHistoryItem[], labels: Record<string, string> = {}): string {
  const header = ["Transaction date", "Confirmed receipt month", "Original saved date", "Logged at", "Type", "Description", "Category", "Wallet", "Amount (PHP)", "Record ID"];
  return [header.map(cell).join(","), ...rows.map(row => {
    const fields = [confirmedTransactionMonth(row) ? "" : transactionDay(row.date), row.confirmedIncomeMonth ?? "", row.date,
      row.loggedAt ?? "", row.isTransfer ? (row.amount < 0 ? "Transfer out" : "Transfer in") : row.type,
      row.title, row.category ?? "", labels[row.wallet ?? ""] || row.wallet || ""];
    const amount = Number.isFinite(row.amount) ? row.amount.toFixed(2) : cell("Amount needs review");
    return `${fields.map(cell).join(",")},${amount},${cell(row.id)}`;
  })].join("\r\n") + "\r\n";
}

export function downloadTransactionCsv(rows: TransactionHistoryItem[], labels?: Record<string, string>): void {
  const url = URL.createObjectURL(new Blob(["\uFEFF", transactionCsv(rows, labels)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `finance-tracker-transactions-${transactionDay(new Date().toISOString())}.csv`;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
