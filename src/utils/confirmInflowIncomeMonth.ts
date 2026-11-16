import type { ReceivableIncomeMonths, UnifiedFinanceData } from "../types/finance";
import { countIncomeReceiptIds, isInflowMonth, isInflowMoney, resolveIncomeMonths } from "./inflowIncome";

/** Pure preparation only. The caller owns review, persistence and account/conflict checks. */
export function confirmInflowIncomeMonth(
  data: UnifiedFinanceData,
  bucket: string,
  id: string,
  confirmation: ReceivableIncomeMonths
): { ok: true; data: UnifiedFinanceData } | { ok: false; data: UnifiedFinanceData; error: string } {
  const record = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v);
  const reject = () => ({ ok: false as const, data, error: "This receipt changed or its month confirmation is invalid. Review the current history." });
  const identities = [...(data.library.receivables ?? []), ...(data.library.archivedReceivables ?? [])].filter(r => r.id === id);
  const log = data.logs?.[bucket];
  const cache = log?.recsCollected?.[id];
  if (!isInflowMonth(bucket) || identities.length !== 1 || !["By Date", "Monthly", "Bi-monthly", "No Specific Date"].includes(identities[0]?.frequency) || !log || !cache ||
      !isInflowMoney(cache.amountReceived) || !confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) return reject();
  const rows = log.receivableSettlements?.[id] ?? [];
  if (!Array.isArray(rows) || rows.some(row => !row || !isInflowMoney(row.amount))) return reject();
  const recordedCents = rows.reduce((sum, row) => sum + (row.reversedAt ? 0 : Math.round(row.amount * 100)), 0);
  if (!Number.isSafeInteger(recordedCents) || recordedCents > Math.round(cache.amountReceived * 100)) return reject();
  if (log.receivableIncomeMonths !== undefined && !record(log.receivableIncomeMonths)) return reject();
  const existing = log.receivableIncomeMonths?.[id];
  if (existing !== undefined && !record(existing)) return reject();
  if (existing?.receipts !== undefined && !record(existing.receipts)) return reject();
  if (confirmation.receipts !== undefined && !record(confirmation.receipts)) return reject();
  const receiptIds = Object.keys(confirmation.receipts ?? {});
  if ((!receiptIds.length && !confirmation.legacy) ||
      (confirmation.legacy && existing?.legacy) || receiptIds.some(key => existing?.receipts?.[key] !== undefined)) return reject();
  const next = {
    ...log,
    receivableIncomeMonths: {
      ...log.receivableIncomeMonths,
      [id]: { ...existing, ...confirmation, receipts: { ...existing?.receipts, ...confirmation.receipts } }
    }
  };
  if (resolveIncomeMonths(next, id, countIncomeReceiptIds(data.logs)).needsReview) return reject();
  return { ok: true, data: { ...data, logs: { ...data.logs, [bucket]: next },
    updatedAt: Math.max(Date.now(), (Number.isFinite(data.updatedAt) ? data.updatedAt! : 0) + 1) } };
}
