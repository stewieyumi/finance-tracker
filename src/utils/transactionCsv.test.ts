import { describe, expect, it } from "vitest";
import { transactionCsv } from "./transactionCsv";
import type { TransactionHistoryItem } from "../types/finance";
const row: TransactionHistoryItem = { id: "record", title: 'Lunch, "takeaway"\nsecond line', amount: -50.25, date: "2026-11-28", type: "expense", wallet: "main" };
describe("transaction CSV", () => {
  it("quotes commas, quotes and newlines, retains Unicode and signed numeric amounts without modifying rows", () => {
    const rows = [row]; const before = structuredClone(rows);
    const text = transactionCsv(rows, { main: "Bank ₱" });
    expect(text).toContain('"Lunch, ""takeaway""\nsecond line"'); expect(text).toContain('"Bank ₱",-50.25,"record"\r\n');
    expect(rows).toEqual(before);
  });
  it.each(["=1+1", "+SUM(A1)", "-SUM(A1)", "@SUM(A1)", "\t=1+1", "\r\n+1", " \uFEFF@bad"])("neutralizes formula-like text %j", title => {
    expect(transactionCsv([{ ...row, title }])).toContain(`"'${title}"`);
  });
  it("leaves exact days unknown for month-confirmed receipts, preserves source dates, and labels transfers", () => {
    const text = transactionCsv([{ ...row, amount: 100, type: "inflow", confirmedIncomeMonth: "November 2026", isTransfer: true }]);
    expect(text).toContain('"","November 2026","2026-11-28"'); expect(text).toContain('"Transfer in"');
    expect(transactionCsv([{ ...row, isTransfer: true }])).toContain('"Transfer out"');
    expect(transactionCsv([{ ...row, amount: NaN }])).toContain('"Amount needs review"');
    expect(transactionCsv([]).split("\r\n")).toHaveLength(2);
  });
});
