import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinancialAnalyticsModal } from "./FinancialAnalyticsModal";
import { UnifiedFinanceData } from "../types/finance";

const createMockData = (): UnifiedFinanceData => ({
  wallets: {
    maribank: 45000,
    main: 10000,
  },
  library: {
    bills: [
      {
        id: "loan-1",
        name: "MacBook Pro",
        amount: 5000,
        dueDay: "15",
        type: "Loan / Installment",
        startMonth: "January 2026",
        endMonth: "June 2026",
      },
    ],
    receivables: [
      {
        id: "rec-1",
        name: "Client Project",
        amount: 25000,
        frequency: "Monthly",
        startMonth: "January 2026",
      },
    ],
    shoots: [],
    manualTransactions: [],
  },
  logs: {
    "March 2026": {
      billsPaid: ["loan-1"],
    },
  },
  settings: {
    milestoneWallet: "maribank",
    targetFund: 100000,
    goalName: "Savings Milestone",
    walletLabels: {
      maribank: "MariBank Savings",
    },
  },
});

describe("FinancialAnalyticsModal", () => {
  it("renders Overview tab by default when opened", () => {
    const mockData = createMockData();
    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Safe to Spend")).toBeInTheDocument();
    expect(screen.getByText("₱50,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/Daily Discretionary Pace/i)).not.toBeInTheDocument();
  });

  it("switches to Cashflow tab and displays cashflow momentum section", () => {
    const mockData = createMockData();
    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cashflow" }));
    expect(
      screen.getByText(/6-Month Cashflow Momentum/i)
    ).toBeInTheDocument();
  });

  it("switches to Debt tab and displays active debt runway section", () => {
    const mockData = createMockData();
    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Debt" }));
    expect(
      screen.getByText(/Active Debt Freedom Runway/i)
    ).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Active debt breakdown" })).getByText("MacBook Pro")).toBeInTheDocument();
  });

  it("switches to Goals tab and displays goal info and Monthly Deposit Needed", () => {
    const mockData = createMockData();
    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Goals" }));
    expect(screen.getByText("Monthly Deposit Needed")).toBeInTheDocument();
    expect(
      screen.getByText("Estimated monthly deposit to reach your target.")
    ).toBeInTheDocument();
    expect(screen.getByText("₱55,000.00")).toBeInTheDocument();
    expect(screen.getByText(/MariBank Savings Balance/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Save over" }), { target: { value: "6" } });
    expect(screen.getByText("₱9,166.67")).toBeInTheDocument();
  });

  it("does not render any Japan or Yen display in any tab", () => {
    const mockData = createMockData();
    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    // Overview tab
    expect(screen.queryByText(/japan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/yen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/jpy/i)).not.toBeInTheDocument();

    // Goals tab
    fireEvent.click(screen.getByRole("button", { name: "Goals" }));
    expect(screen.queryByText(/japan visa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/yen balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/yen equivalent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/daily deposit pace/i)).not.toBeInTheDocument();
  });

  it("tab switching does not mutate global financial data", () => {
    const mockData = createMockData();
    const originalSnapshot = JSON.stringify(mockData);

    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cashflow" }));
    fireEvent.click(screen.getByRole("button", { name: "Debt" }));
    fireEvent.click(screen.getByRole("button", { name: "Goals" }));
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));

    expect(JSON.stringify(mockData)).toBe(originalSnapshot);
  });

  it("calls onClose when Escape key is pressed or Close button clicked", () => {
    const onClose = vi.fn();
    const mockData = createMockData();

    render(
      <FinancialAnalyticsModal
        isOpen={true}
        onClose={onClose}
        globalData={mockData}
        selectedMonth="March 2026"
        totalLiquid={55000}
        totalUnpaidCommitments={5000}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /close analytics modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});


it("retains completed archived loans in cumulative paid totals but excludes them from active debt", () => {
  const data = createMockData();
  const loan = { ...data.library.bills[0], endMonth: "January 2026" };
  data.library.bills = []; data.library.archivedBills = [loan];
  data.logs = { "January 2026": { billsPaid: [loan.id] } };
  render(<FinancialAnalyticsModal isOpen={true} onClose={vi.fn()} globalData={data} selectedMonth="March 2026" totalLiquid={0} totalUnpaidCommitments={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Debt" }));
  expect(screen.getByText("0 Active Installments")).toBeInTheDocument();
  expect(screen.getByText("Completed loans (1)")).toBeInTheDocument();
  expect(screen.getByText(/Includes legacy timing estimates/)).toBeInTheDocument();
  const completed = screen.getByText("Completed loans (1)").closest("details")!;
  expect(within(completed).getByText(/MacBook Pro · Archived/)).toBeInTheDocument();
});

it("shows review-needed debt rather than claiming debt-free for a corrupt schedule", () => {
  const data = createMockData(); data.library.bills[0].startMonth = "broken";
  render(<FinancialAnalyticsModal isOpen={true} onClose={vi.fn()} globalData={data} selectedMonth="March 2026" totalLiquid={0} totalUnpaidCommitments={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Debt" }));
  expect(screen.getByText("Review loan history")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Debt overview" })).getAllByText("Review needed")).toHaveLength(3);
});

it("does not display an invalid scheduled amount as a zero-price installment", () => {
  const data = createMockData(); data.library.bills[0].amount = NaN;
  render(<FinancialAnalyticsModal isOpen={true} onClose={vi.fn()} globalData={data} selectedMonth="March 2026" totalLiquid={0} totalUnpaidCommitments={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Debt" }));
  expect(screen.getByText(/Scheduled amount needs review/)).toBeInTheDocument();
  expect(screen.queryByText(/₱0.00\/mo/)).not.toBeInTheDocument();
});


it("renders a review state for an unreadable month log even when no loans are listed", () => {
  const data = createMockData(); data.library.bills = [];
  data.logs["January 2026"] = null as unknown as UnifiedFinanceData["logs"][string];
  render(<FinancialAnalyticsModal isOpen={true} onClose={vi.fn()} globalData={data} selectedMonth="March 2026" totalLiquid={0} totalUnpaidCommitments={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Debt" }));
  expect(screen.getByText("Debt history needs review before confirming the balance.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Debt overview" })).toHaveTextContent("Review needed");
  expect(screen.queryByText("No active loans or installments for this period.")).not.toBeInTheDocument();
});

it("excludes wallet Savings from Runway's current Safe to Spend without reducing goal balances", () => {
  const data = createMockData(); data.settings!.walletSavings = { maribank: 40000 };
  render(<FinancialAnalyticsModal isOpen onClose={vi.fn()} globalData={data} selectedMonth="March 2026" totalLiquid={55000} totalUnpaidCommitments={5000} />);
  expect(screen.getByText("₱10,000.00")).toBeInTheDocument();
  expect(data.wallets.maribank).toBe(45000);
});


it("opens Debt directly and shows the saved schedule outlook and breakdown", () => {
  const d = createMockData();
  d.library.bills[0].endMonth = 'December 2027';
  render(<FinancialAnalyticsModal isOpen initialTab="debt" onClose={vi.fn()} globalData={d} selectedMonth="March 2026" totalLiquid={55000} totalUnpaidCommitments={5000} />);
  const overview = screen.getByRole('region', { name: 'Debt overview' });
  expect(overview).toHaveTextContent('Scheduled in March 2026₱5,000.00');
  expect(overview).toHaveTextContent('Last planned paymentDecember 2027');
  expect(screen.getByRole('region', { name: 'Active debt breakdown' })).toHaveTextContent('MacBook Pro100.0%');
  expect(screen.getByText(/not a lender payoff quote/)).toBeInTheDocument();
});

it("resolves an unset milestoneWallet to the active default wallet on the Goals tab", () => {
  const data = createMockData();
  data.wallets = { cw_goal: 20000 };
  data.settings = {
    ...data.settings,
    milestoneWallet: undefined,
    defaultWallet: "cw_goal",
    targetFund: 100000,
    customWallets: [{ id: "cw_goal", label: "Goal Vault" }],
  };
  render(<FinancialAnalyticsModal isOpen onClose={vi.fn()} globalData={data} selectedMonth="March 2026" totalLiquid={20000} totalUnpaidCommitments={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Goals" }));
  expect(screen.getByText(/Goal Vault Balance/i)).toBeInTheDocument();
  expect(screen.getByText("₱80,000.00")).toBeInTheDocument();
});


it("shows exact history reasons separately for estimated and conflicting plans without modifying records", () => {
  const data = createMockData();
  data.library.bills = [
    { id: "old", name: "Older plan", amount: 100, dueDay: "15", type: "Loan / Installment", startMonth: "January 2026", endMonth: "March 2026" },
    { id: "broken", name: "Check schedule", amount: 100, dueDay: "15", type: "Loan / Installment" },
  ];
  data.logs = { "January 2026": { billsPaid: ["old"] } };
  const before = structuredClone(data);
  render(<FinancialAnalyticsModal isOpen initialTab="debt" onClose={vi.fn()} globalData={data} selectedMonth="November 2026" totalLiquid={1000} totalUnpaidCommitments={0} />);
  const summary = screen.getByText("Payment history details (2)");
  fireEvent.click(summary);
  const details = within(summary.closest("details")!);
  expect(details.getByText("Estimated history", { exact: true })).toBeVisible();
  expect(details.getByText("History needs review", { exact: true })).toBeVisible();
  expect(details.getByText(/January 2026: Marked paid without a detailed payment record/)).toBeVisible();
  expect(details.getByText(/Review: The loan schedule needs review/)).toBeVisible();
  expect(details.getByText(/does not establish the original payment date/)).toBeVisible();
  expect(data).toEqual(before);
});
