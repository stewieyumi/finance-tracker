import { UnifiedFinanceData } from "../types/finance";

/**
 * Validates the core structural schema of UnifiedFinanceData.
 *
 * This performs structural validation only:
 * - Does NOT require updatedAt to exist or be valid (preserving legacy data compatibility).
 * - Checks top-level objects and essential library arrays.
 */
export function isValidFinanceData(data: unknown): data is UnifiedFinanceData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const candidate = data as Record<string, unknown>;

  if (!candidate.wallets || typeof candidate.wallets !== "object") {
    return false;
  }

  if (!candidate.library || typeof candidate.library !== "object") {
    return false;
  }

  const library = candidate.library as Record<string, unknown>;

  if (!Array.isArray(library.bills)) {
    return false;
  }

  if (!Array.isArray(library.receivables)) {
    return false;
  }

  if (!Array.isArray(library.shoots)) {
    return false;
  }

  if (!candidate.logs || typeof candidate.logs !== "object") {
    return false;
  }

  if (!candidate.settings || typeof candidate.settings !== "object") {
    return false;
  }

  return true;
}

/** Check backup input independently of the legacy sync reader. */
export function isValidFinanceBackup(data: unknown): data is UnifiedFinanceData {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isIdentifiedRecord = (value: unknown) =>
    isRecord(value) && typeof value.id === "string" && value.id.trim() !== "";
  const isMoney = (value: unknown) => typeof value === "number" && Number.isFinite(value);

  if (!isRecord(data) || !isValidFinanceData(data) ||
    !isRecord(data.wallets) || !isRecord(data.library) ||
    !isRecord(data.logs) || !isRecord(data.settings)) return false;

  return Object.values(data.wallets).every(isMoney) &&
    Object.values(data.logs).every(isRecord) &&
    data.library.bills.every(bill => isIdentifiedRecord(bill) && isMoney(bill.amount)) &&
    data.library.receivables.every(receivable => isIdentifiedRecord(receivable) && isMoney(receivable.amount)) &&
    data.library.shoots.every(isIdentifiedRecord) &&
    (data.library.expenses === undefined || (Array.isArray(data.library.expenses) &&
      data.library.expenses.every(expense => isIdentifiedRecord(expense) && isMoney(expense.amount)))) &&
    (data.library.manualTransactions === undefined || (Array.isArray(data.library.manualTransactions) &&
      data.library.manualTransactions.every(entry => isIdentifiedRecord(entry) && isMoney(entry.amount))));
}
