import type { ReceivableFrequency, UnifiedFinanceData } from "../types/finance";
import { MONTH_LIST } from "../constants/config";
import { getMonthKey, isValidDateKey, parseDateKey } from "./dateHelpers";
import { roundMoney } from "./currency";

export interface InflowIncomeReport {
  actual: number;
  historicalDateUnverified: number;
  needsReview: boolean;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const frequencies = new Set(["By Date", "Monthly", "Bi-monthly", "No Specific Date"]);

export function isInflowMonth(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^([A-Za-z]+) ([1-9]\d{3})$/.exec(value);
  return !!match && MONTH_LIST.includes(match[1]);
}

export const isInflowMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  Number.isSafeInteger(Math.round(value * 100)) && value === roundMoney(value);

// A legacy occurrence can use a full month name or its unambiguous 3-letter alias.
// This is only a reference bucket for undated history, never an invented receipt date.
const occurrenceMonth = (value: string): string | null => {
  const match = /^([A-Za-z]+) ([1-9]\d{3})$/.exec(value);
  if (!match) return null;
  const month = MONTH_LIST.find(name => name === match[1] || name.slice(0, 3) === match[1]);
  return month ? `${month} ${match[2]}` : null;
};

const receiptDate = (value: unknown, dateOnlyAllowed: boolean): Date | null => {
  if (typeof value !== "string") return null;
  if (dateOnlyAllowed && isValidDateKey(value)) return parseDateKey(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !isValidDateKey(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** Current, unreversed Inflows receipts only. Reading never updates caches, logs or wallets. */
export function readInflowIncome(
  data: UnifiedFinanceData,
  period: string,
  frequency?: ReceivableFrequency
): InflowIncomeReport {
  const report: InflowIncomeReport = { actual: 0, historicalDateUnverified: 0, needsReview: false };
  const year = /^[1-9]\d{3}$/.test(period);
  if (!year && !isInflowMonth(period)) return { ...report, needsReview: true };
  const matches = (month: string | null) => !!month && (year ? month.endsWith(` ${period}`) : month === period);
  const datedMatch = (date: Date | null) => !!date && matches(getMonthKey(date));
  let actualCents = 0, historicalCents = 0;
  const byId = new Map<string, string>();
  const conflictingInflows = new Set<string>();
  for (const list of [data.library?.receivables, data.library?.archivedReceivables]) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) { report.needsReview = true; continue; }
    for (const item of list) {
      if (!record(item) || typeof item.id !== "string" || !item.id.trim() || !frequencies.has(String(item.frequency))) {
        report.needsReview = true; continue;
      }
      if (byId.has(item.id) && byId.get(item.id) !== item.frequency) conflictingInflows.add(item.id);
      byId.set(item.id, String(item.frequency));
    }
  }

  // An ID must identify exactly one stored receipt, including reversed history.
  // ID-less legacy rows retain their individual positions; equal payments are not duplicates.
  const idCounts = new Map<string, number>();
  const logs = record(data.logs) ? Object.entries(data.logs) : [];
  if (!record(data.logs)) report.needsReview = true;
  for (const [, log] of logs) {
    if (!record(log) || !record(log.receivableSettlements)) continue;
    for (const rows of Object.values(log.receivableSettlements)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (record(row) && typeof row.id === "string" && row.id.trim()) idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
      }
    }
  }

  for (const [bucket, log] of logs) {
    if (!record(log)) { report.needsReview = true; continue; }
    const month = occurrenceMonth(bucket);
    const bucketMatches = matches(month);
    const flag = (rows: unknown[] = []) => {
      if (!month || bucketMatches || rows.some(row => record(row) && datedMatch(receiptDate(row.receivedAt, true)))) report.needsReview = true;
    };
    if ((log.recsCollected !== undefined && !record(log.recsCollected)) ||
        (log.receivableSettlements !== undefined && !record(log.receivableSettlements))) { report.needsReview = true; continue; }
    const caches = record(log.recsCollected) ? log.recsCollected : {};
    const settlements = record(log.receivableSettlements) ? log.receivableSettlements : {};
    const ids = new Set([...Object.keys(caches), ...Object.keys(settlements)]);
    for (const id of ids) {
      const kind = byId.get(id);
      if (frequency && kind && kind !== frequency) continue;
      const rawRows = settlements[id];
      const rows: unknown[] = Array.isArray(rawRows) ? rawRows : [];
      const cache = caches[id];
      if (!kind && record(cache) && cache.amountReceived === 0 && (rawRows === undefined || rows.length === 0 && Array.isArray(rawRows))) continue;
      if (!kind || conflictingInflows.has(id) || (rawRows !== undefined && !Array.isArray(rawRows)) ||
          !record(cache) || !isInflowMoney(cache.amountReceived)) { flag(rows); continue; }
      let recordedCents = 0, datedCents = 0, undatedCents = 0;
      let invalid = false;
      for (const row of rows) {
        if (!record(row) || !isInflowMoney(row.amount) ||
            (row.id !== undefined && (typeof row.id !== "string" || !row.id.trim())) ||
            (typeof row.id === "string" && idCounts.get(row.id)! > 1) ||
            (kind === "No Specific Date" && !row.id) ||
            (row.reversedAt !== undefined && row.reversedAt !== "" && !receiptDate(row.reversedAt, true))) { invalid = true; break; }
        if (row.reversedAt) continue;
        const cents = Math.round(row.amount * 100);
        recordedCents += cents;
        const date = receiptDate(row.receivedAt, kind !== "No Specific Date");
        if (date) { if (datedMatch(date)) datedCents += cents; }
        else undatedCents += cents;
      }
      const cachedCents = Math.round(cache.amountReceived * 100);
      if (invalid || !Number.isSafeInteger(recordedCents) || recordedCents > cachedCents) { flag(rows); continue; }
      actualCents += datedCents;
      const unverified = (cachedCents - recordedCents) + undatedCents;
      if (bucketMatches) historicalCents += unverified;
      else if (!month && unverified > 0) flag(rows);
    }
  }
  if (!Number.isSafeInteger(actualCents) || !Number.isSafeInteger(historicalCents)) return { actual: 0, historicalDateUnverified: 0, needsReview: true };
  return { actual: actualCents / 100, historicalDateUnverified: historicalCents / 100, needsReview: report.needsReview };
}
