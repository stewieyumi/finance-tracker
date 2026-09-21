import { describe, it, expect } from "vitest";
import { filterBills, sortBills, groupBillsByHalfMonth } from "./billListHelpers";
import { BillViewModel } from "../../types/finance";

// Helper to create dummy bills for testing
const createBill = (overrides: Partial<BillViewModel>): BillViewModel => ({
  id: "test-id",
  name: "Test Bill",
  amount: 100,
  baseAmount: 100,
  targetMonthForDue: "2024-01",
  isOverridden: false,
  type: "Bill",
  dueDay: "1",
  wallet: "main",
  paid: false,
  startMonth: "2024-01",
  endMonth: "2024-12",
  daysLeft: 10,
  ...overrides,
});

describe("billListHelpers", () => {
  describe("filterBills", () => {
    it("filters by type 'All'", () => {
      const bills = [
        createBill({ type: "Bill" }),
        createBill({ type: "Subscription" })
      ];
      expect(filterBills(bills, "All", "").length).toBe(2);
    });

    it("filters by specific type", () => {
      const bills = [
        createBill({ type: "Bill" }),
        createBill({ type: "Subscription" })
      ];
      expect(filterBills(bills, "Subscription", "").length).toBe(1);
      expect(filterBills(bills, "Subscription", "")[0].type).toBe("Subscription");
    });

    it("filters by search query case-insensitively", () => {
      const bills = [
        createBill({ name: "Netflix" }),
        createBill({ name: "Spotify" })
      ];
      expect(filterBills(bills, "All", "net").length).toBe(1);
      expect(filterBills(bills, "All", "net")[0].name).toBe("Netflix");
    });
  });

  describe("sortBills", () => {
    it("sorts by nameAsc", () => {
      const bills = [
        createBill({ name: "Zebra" }),
        createBill({ name: "Apple" })
      ];
      const sorted = sortBills(bills, "nameAsc");
      expect(sorted[0].name).toBe("Apple");
    });

    it("sorts by amountDesc", () => {
      const bills = [
        createBill({ name: "A", amount: 10 }),
        createBill({ name: "B", amount: 20 })
      ];
      const sorted = sortBills(bills, "amountDesc");
      expect(sorted[0].amount).toBe(20);
    });
  });

  describe("groupBillsByHalfMonth", () => {
    it("groups bills into first and second half", () => {
      const bills = [
        createBill({ dueDay: "1" }),
        createBill({ dueDay: "15" }),
        createBill({ dueDay: "16" }),
        createBill({ dueDay: "31" }),
      ];
      const { firstHalf, secondHalf } = groupBillsByHalfMonth(bills);
      expect(firstHalf.length).toBe(2);
      expect(secondHalf.length).toBe(2);
    });
  });
});
