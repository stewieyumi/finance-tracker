import { describe, expect, it } from "vitest";
import type { Expense, UnifiedFinanceData } from "../types/finance";
import { readFrequentExpenses } from "./frequentExpenses";

function seed(expenses: Expense[]): UnifiedFinanceData {
  return { wallets: { main: 1000, cash: 0, old: 100 }, settings: { customWallets: [{ id: "main", label: "Bank" }, { id: "cash", label: "Cash" }], archivedWallets: [{ id: "old", label: "Old Bank" }] }, library: { bills: [], receivables: [], shoots: [], expenses }, logs: {} };
}
const row = (id: string, overrides: Partial<Expense> = {}): Expense => ({ id, merchant: "Coffee", amount: 50, category: "Food & Dining", wallet: "main", date: "2026-11-20", ...overrides });

describe("frequent expense drafts", () => {
  it("groups merchant spelling variants, ranks by frequency, and uses the latest transaction's values without mutating history", () => {
    const data = seed([row("old", { merchant: "  COFFEE  ", date: "2026-11-19", loggedAt: "2026-12-01T12:00:00Z" }),
      row("latest", { merchant: "Coffee", date: "2026-11-27", amount: 60.25, wallet: "cash" }), row("middle", { date: "2026-11-25" }),
      row("tea-a", { merchant: "Milk   Tea", date: "2026-11-27" }), row("tea-b", { merchant: " milk tea ", date: "2026-11-28" }), row("one-off", { merchant: "New Shoes" })]);
    const before = structuredClone(data); const suggestions = readFrequentExpenses(data, "2026-11-28");
    expect(suggestions.map(({ merchant, amount, wallet }) => ({ merchant, amount, wallet }))).toEqual([
      { merchant: "Coffee", amount: 60.25, wallet: "cash" }, { merchant: "milk tea", amount: 50, wallet: "main" }]);
    expect(data).toEqual(before);
    expect(suggestions[0]).not.toHaveProperty("date"); expect(suggestions[0]).not.toHaveProperty("id");
  });

  it("uses an inclusive 90-day window, excludes future dates, and does not treat categories as the same purchase", () => {
    const data = seed([row("edge-a", { date: "2026-08-31" }), row("edge-b", { date: "2026-11-28" }),
      row("stale-a", { merchant: "Old", date: "2026-08-30" }), row("stale-b", { merchant: "Old", date: "2026-08-29" }),
      row("future-a", { merchant: "Future", date: "2026-11-29" }), row("future-b", { merchant: "Future", date: "2026-11-30" }),
      row("other-category", { category: "Other" })]);
    expect(readFrequentExpenses(data, "2026-11-28").map(item => item.merchant)).toEqual(["Coffee"]);
    expect(readFrequentExpenses(data, "2026-02-31")).toEqual([]);
  });

  it.each([
    { id: "duplicate" }, { amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: 1.234 }, { deductedAmount: 25 },
    { date: "2026-11-31" }, { wallet: "old" }, { wallet: "missing" }, { merchant: " " }, { category: "" },
  ])("excludes invalid or ambiguous history %j", invalid => {
    const data = seed([row("a", invalid), row("b", invalid)]);
    expect(readFrequentExpenses(data, "2026-11-28")).toEqual([]);
  });

  it("caps suggestions at four, breaks frequency ties by recency, and excludes invalid or duplicate active wallets", () => {
    const data = seed(Array.from({ length: 6 }, (_, index) => [row(`a-${index}`, { merchant: `Purchase ${index}`, date: `2026-11-${20 + index}` }), row(`b-${index}`, { merchant: `Purchase ${index}`, date: `2026-11-${20 + index}` })]).flat());
    expect(readFrequentExpenses(data, "2026-11-28").map(item => item.merchant)).toEqual(["Purchase 5", "Purchase 4", "Purchase 3", "Purchase 2"]);
    data.wallets.main = NaN; expect(readFrequentExpenses(data, "2026-11-28")).toEqual([]);
    data.wallets.main = 1000; data.settings!.customWallets!.push({ id: "main", label: "Duplicate" });
    expect(readFrequentExpenses(data, "2026-11-28")).toEqual([]);
  });
});
