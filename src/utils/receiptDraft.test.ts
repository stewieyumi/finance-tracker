import { describe, expect, it } from "vitest";
import { readReceiptDraft } from "./receiptDraft";

describe("receipt draft extraction", () => {
  it("reads a labeled peso total without treating the remaining balance as the charge", () => {
    expect(readReceiptDraft("Merchant: Sample Store\nTotal paid: ₱1,234.50\nBalance: ₱4,000\nDate: 2026-11-05")).toEqual({
      merchant: "Sample Store", amount: "1234.5", date: "2026-11-05",
    });
  });

  it("leaves ambiguous amounts, transfers, and invalid dates for review", () => {
    expect(readReceiptDraft("Total: PHP 120\nAmount paid: PHP 130\nDate: 2026-02-30").amount).toBeUndefined();
    expect(readReceiptDraft("Total: PHP 120\nAmount paid: PHP 130\nDate: 2026-02-30").date).toBeUndefined();
    expect(readReceiptDraft("You sent PHP 200. Balance: PHP 1,500").amount).toBeUndefined();
  });
});
