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
