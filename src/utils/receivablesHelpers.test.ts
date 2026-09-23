import { describe, expect, it } from "vitest";
import { ReceivableViewModel } from "../types/finance";
import { filterReceivables, groupReceivablesByHalf } from "./receivablesHelpers";

const receivables: ReceivableViewModel[] = [
  {
    id: "1",
    name: "Shoot A",
    amount: 5000,
    category: "Shoot",
    frequency: "By Date",
    amountReceived: 0,
    collected: false,
    targetMonthForDue: "2026-09",
  },
  {
    id: "2",
    name: "Salary",
    amount: 15000,
    category: "Salary",
    frequency: "Monthly",
    amountReceived: 0,
    collected: false,
    targetMonthForDue: "2026-09",
  },
  {
    id: "3",
    name: "Edit A",
    amount: 3000,
    category: "Edit",
    frequency: "By Date",
    amountReceived: 0,
    collected: false,
    targetMonthForDue: "2026-09",
  },
];

describe("filterReceivables", () => {
  it("returns all receivables for the All filter", () => {
    expect(filterReceivables(receivables, "All")).toEqual(receivables);
  });

  it("returns only receivables matching the selected category", () => {
    expect(filterReceivables(receivables, "Shoot")).toEqual([receivables[0]]);
    expect(filterReceivables(receivables, "Salary")).toEqual([receivables[1]]);
  });

  it("returns an empty array when no receivables match", () => {
    expect(filterReceivables(receivables, "Payment")).toEqual([]);
  });

  it("handles an empty receivables list", () => {
    expect(filterReceivables([], "All")).toEqual([]);
    expect(filterReceivables([], "Shoot")).toEqual([]);
  });
});

describe("groupReceivablesByHalf", () => {
  it("groups monthly receivables based on monthlyDay", () => {
    const recFirstHalf: ReceivableViewModel = {
      id: "m-1",
      name: "Mid-month salary",
      amount: 1000,
      frequency: "Monthly",
      monthlyDay: 15,
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };
    const recSecondHalf: ReceivableViewModel = {
      id: "m-2",
      name: "End-month salary",
      amount: 1000,
      frequency: "Monthly",
      monthlyDay: 20,
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recFirstHalf, recSecondHalf]);
    expect(result.firstHalf).toEqual([recFirstHalf]);
    expect(result.secondHalf).toEqual([recSecondHalf]);
  });

  it("defaults monthly receivable without monthlyDay to firstHalf", () => {
    const recDefault: ReceivableViewModel = {
      id: "m-default",
      name: "Default salary",
      amount: 1000,
      frequency: "Monthly",
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recDefault]);
    expect(result.firstHalf).toEqual([recDefault]);
    expect(result.secondHalf).toEqual([]);
  });

  it("groups by date receivables based on parsed day", () => {
    const recFirstHalf: ReceivableViewModel = {
      id: "d-1",
      name: "Early Shoot",
      amount: 2000,
      frequency: "By Date",
      date: "2026-09-05",
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };
    const recSecondHalf: ReceivableViewModel = {
      id: "d-2",
      name: "Late Shoot",
      amount: 2500,
      frequency: "By Date",
      date: "2026-09-25",
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recFirstHalf, recSecondHalf]);
    expect(result.firstHalf).toEqual([recFirstHalf]);
    expect(result.secondHalf).toEqual([recSecondHalf]);
  });

  it("places bi-monthly receivables in both groups if days span both halves", () => {
    const recBoth: ReceivableViewModel = {
      id: "bm-1",
      name: "Bi-monthly client retainer",
      amount: 3000,
      frequency: "Bi-monthly",
      biMonthlyDays: [15, 30],
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recBoth]);
    expect(result.firstHalf).toEqual([recBoth]);
    expect(result.secondHalf).toEqual([recBoth]);
  });

  it("places bi-monthly receivables only in firstHalf if all days are <= 15", () => {
    const recFirstOnly: ReceivableViewModel = {
      id: "bm-first",
      name: "Early bi-monthly",
      amount: 3000,
      frequency: "Bi-monthly",
      biMonthlyDays: [5, 12],
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recFirstOnly]);
    expect(result.firstHalf).toEqual([recFirstOnly]);
    expect(result.secondHalf).toEqual([]);
  });

  it("places bi-monthly receivables only in secondHalf if all days are > 15", () => {
    const recSecondOnly: ReceivableViewModel = {
      id: "bm-second",
      name: "Late bi-monthly",
      amount: 3000,
      frequency: "Bi-monthly",
      biMonthlyDays: [20, 30],
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recSecondOnly]);
    expect(result.firstHalf).toEqual([]);
    expect(result.secondHalf).toEqual([recSecondOnly]);
  });

  it("leaves receivables with missing or invalid By Date out of both groups", () => {
    const recMissingDate: ReceivableViewModel = {
      id: "d-missing",
      name: "Missing date",
      amount: 1000,
      frequency: "By Date",
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };
    const recMalformedDate: ReceivableViewModel = {
      id: "d-malformed",
      name: "Malformed date",
      amount: 1000,
      frequency: "By Date",
      date: "invalid-date",
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recMissingDate, recMalformedDate]);
    expect(result.firstHalf).toEqual([]);
    expect(result.secondHalf).toEqual([]);
  });

  it("leaves receivables with unhandled frequency out of both groups", () => {
    const recUnknown: ReceivableViewModel = {
      id: "unknown-1",
      name: "Unknown freq",
      amount: 1000,
      frequency: "Quarterly" as any,
      amountReceived: 0,
      collected: false,
      targetMonthForDue: "2026-09",
    };

    const result = groupReceivablesByHalf([recUnknown]);
    expect(result.firstHalf).toEqual([]);
    expect(result.secondHalf).toEqual([]);
  });

  it("handles empty list correctly", () => {
    expect(groupReceivablesByHalf([])).toEqual({
      firstHalf: [],
      secondHalf: [],
    });
  });
});
