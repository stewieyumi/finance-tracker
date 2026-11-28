import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { PayBillsAheadModal } from "./PayBillsAheadModal";
import type { FinanceTransitionCommitter, UnifiedFinanceData } from "../types/finance";
import { readBudgetSpending } from "../utils/budgeting";

function seed(): UnifiedFinanceData {
  return { wallets: { main: 1000 }, settings: { defaultWallet: "main", customWallets: [{ id: "main", label: "Everyday Bank" }] },
    library: { receivables: [], shoots: [], expenses: [], bills: [
      { id: "ready", name: "Phone Loan", amount: 100, dueDay: "1", wallet: "main", type: "Loan / Installment", startMonth: "November 2026", endMonth: "December 2026" },
      { id: "blocked", name: "Earlier Internet", amount: 50, dueDay: "5", wallet: "main", type: "Bill", startMonth: "November 2026" },
      { id: "late", name: "Late Subscription", amount: 20, dueDay: "20", wallet: "main", type: "Subscription", startMonth: "November 2026" },
      { id: "ended", name: "Finished Loan", amount: 40, dueDay: "1", wallet: "main", type: "Loan / Installment", startMonth: "November 2026", endMonth: "November 2026" },
      { id: "future", name: "Future Bill", amount: 30, dueDay: "1", wallet: "main", type: "Bill", startMonth: "January 2027" },
    ] }, logs: { "November 2026": { billsPaid: ["ready", "late", "ended"], recsCollected: {} }, "December 2026": { billsPaid: [], recsCollected: {}, billOverrides: { ready: 150 } } } };
}
function mount(initial = seed()) {
  let current = initial;
  const showToast = vi.fn();
  const close = vi.fn();
  const externalChange = (data: UnifiedFinanceData) => { current = data; };
  function Harness() {
    const [data, setData] = useState(initial);
    const commit: FinanceTransitionCommitter = transition => { const result = transition(current); if (result.ok) { current = result.data; setData(current); } return result; };
    return <PayBillsAheadModal data={data} month="December 2026" commitBillTransition={commit} showToast={showToast} onPaymentsReversed={vi.fn()} onClose={close} />;
  }
  render(<Harness />);
  return { read: () => current, showToast, close, externalChange };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 30, 12)); });
afterEach(() => { vi.useRealTimers(); });

describe("Pay bills ahead", () => {
  it("defaults to next-month early dues, respects earlier unpaid months and loan boundaries, and browsing/cancelling does not mutate data", () => {
    const initial = seed(); const app = mount(initial);
    expect(screen.getByRole("button", { name: "1–15 dues" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pay Phone Loan for December 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay Earlier Internet for December 2026" })).not.toBeInTheDocument();
    expect(screen.getByText("Earlier Internet · November 2026")).toBeInTheDocument();
    expect(screen.queryByText("Finished Loan")).not.toBeInTheDocument();
    expect(screen.queryByText("Future Bill")).not.toBeInTheDocument();
    expect(screen.queryByText("Late Subscription")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Whole month" }));
    expect(screen.getByText("Late Subscription")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay Phone Loan for December 2026" }));
    expect(screen.getByText("Current balance: ₱1,000.00")).toBeInTheDocument();
    expect(screen.getByText("₱150.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close pay bills ahead" }));
    expect(app.close).toHaveBeenCalledOnce(); expect(app.read()).toBe(initial);
  });

  it("deducts once, settles December, reports November spending, and undoes/redoes the same payment safely", () => {
    const app = mount(); const november = structuredClone(app.read().logs["November 2026"]);
    fireEvent.click(screen.getByRole("button", { name: "Pay Phone Loan for December 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(app.read().wallets.main).toBe(850);
    expect(app.read().logs["December 2026"].billsPaid).toEqual(["ready"]);
    expect(app.read().logs["November 2026"]).toEqual(november);
    const receipt = app.read().logs["December 2026"].billSettlements!.ready[0];
    expect(receipt).toMatchObject({ amount: 150, wallet: "main", walletDebit: 150, paidAt: new Date().toISOString() });
    expect(readBudgetSpending(app.read(), "November 2026").byCategory.Commitments).toBe(150);
    expect(readBudgetSpending(app.read(), "December 2026").spent).toBe(0);
    expect(screen.queryByRole("button", { name: "Pay Phone Loan for December 2026" })).not.toBeInTheDocument();
    expect(screen.getByText("Paid", { exact: true })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Undo" }));
    expect(app.read().wallets.main).toBe(1000);
    expect(readBudgetSpending(app.read(), "November 2026").byCategory.Commitments).toBe(0);
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Redo" }));
    expect(app.read().wallets.main).toBe(850);
    expect(app.read().logs["December 2026"].billSettlements!.ready).toHaveLength(1);
    expect(app.read().logs["December 2026"].billSettlements!.ready[0].id).toBe(receipt.id);
  });

  it("rejects a changed monthly override after review without deducting or settling it", () => {
    const app = mount();
    fireEvent.click(screen.getByRole("button", { name: "Pay Phone Loan for December 2026" }));
    const changed = structuredClone(app.read()); changed.logs["December 2026"].billOverrides!.ready = 200;
    app.externalChange(changed);
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(app.read()).toBe(changed); expect(app.read().wallets.main).toBe(1000);
    expect(screen.getByRole("status")).toHaveTextContent("This bill changed");
  });

  it("keeps insufficient-funds protection on early payments", () => {
    const data = seed(); data.wallets.main = 10; const app = mount(data);
    fireEvent.click(screen.getByRole("button", { name: "Pay Phone Loan for December 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(app.read()).toBe(data); expect(screen.getByRole("status")).toHaveTextContent("Insufficient balance");
  });
});

it("disables confirmation when the assigned wallet has been archived", () => {
  const data = seed(); data.settings!.customWallets = []; data.settings!.archivedWallets = [{ id: "main", label: "Archived Bank" }];
  const app = mount(data);
  fireEvent.click(screen.getByRole("button", { name: "Pay Phone Loan for December 2026" }));
  expect(screen.getByRole("button", { name: "Confirm payment" })).toBeDisabled();
  expect(screen.getByRole("alert")).toBeInTheDocument(); expect(app.read()).toBe(data);
});
