import { describe, expect, it } from "vitest";
import { ReceivableViewModel } from "../types/finance";
import { filterReceivables } from "./receivablesHelpers";

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
