import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
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
      screen.getByText("Remaining amount needed to reach your target.")
    ).toBeInTheDocument();
    expect(screen.getByText("₱55,000.00")).toBeInTheDocument();
    expect(screen.getByText(/MariBank Savings Balance/i)).toBeInTheDocument();
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
  });
});
