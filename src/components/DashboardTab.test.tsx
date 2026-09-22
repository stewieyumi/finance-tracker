import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DashboardTab } from "./DashboardTab";
import { TransactionHistoryItem, BillViewModel, PaydayExecution } from "../types/finance";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { calculateSafeToSpend } from "../utils/financialAnalytics";
import React from "react";

const mockTransactions: TransactionHistoryItem[] = [
  { id: "tx1", title: "Test Inflow", amount: 100, type: "inflow", date: "2026-09-01T12:00:00", wallet: "main" },
];

describe("DashboardTab", () => {
  const defaultProps = {
    globalData: {
      ...INITIAL_UNIFIED_DATA,
      wallets: { main: 5000, savings: 2000 },
      library: {
        ...INITIAL_UNIFIED_DATA.library,
        bills: [
          {
            id: "loan-1",
            name: "MacBook",
            amount: 1500,
            dueDay: "15",
            type: "Loan / Installment" as const,
            startMonth: "January 2026",
            endMonth: "December 2026"
          }
        ]
      }
    },
    targetMilestoneFund: 10000,
    totalLiquid: 7000,
    fundProgressPercent: "50.0",
    totalPendingReceivables: 3200,
    monthIncomeCollected: 12500,
    selectedMonth: "Sep 2026",
    priorityUnpaidSum: 1500,
    totalUnpaidCommitments: 4000,
    overdueBills: [] as BillViewModel[],
    overdueSum: 0,
    paydayAllocations: { main: 2500, savings: 1000 },
    remainingBuffer: 500,
    isViewingCurrentMonth: true,
    hasExecutedToday: false,
    latestExecution: undefined as PaydayExecution | undefined,
    recentTransactions: mockTransactions,
    onOpenSettings: vi.fn(),
    onExecutePaydaySplit: vi.fn(),
    onUndoPaydaySplit: vi.fn(),
    onJumpToOverdue: vi.fn(),
    onCommitWallet: vi.fn(),
    onIncrementWallet: vi.fn(),
    onCopySummary: vi.fn(),
    formatDateTime: (d: string) => d,
    onNavigateToWallets: vi.fn(),
    onNavigateToOps: vi.fn(),
    onNavigateToExpenses: vi.fn(),
    onOpenAnalytics: vi.fn(),
    onOpenYearlyModal: vi.fn(),
    onOpenLedger: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders transaction history", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Test Inflow")).toBeInTheDocument();
  });

  it("calls onCopySummary when Copy Summary is clicked", () => {
    render(<DashboardTab {...defaultProps} />);
    fireEvent.click(screen.getByText("Copy Summary"));
    expect(defaultProps.onCopySummary).toHaveBeenCalled();
  });

  it("renders Slide 1 Financial Overview with Fund Progress, Pending Inflows, and Income", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Financial Overview")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("₱3,200.00")).toBeInTheDocument();
    expect(screen.getByText("₱12,500.00")).toBeInTheDocument();
  });

  it("renders Slide 2 Safe to Spend using authoritative calculation", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Safe to Spend")).toBeInTheDocument();
    const expected = calculateSafeToSpend(defaultProps.totalLiquid, defaultProps.totalUnpaidCommitments);
    expect(expected).toBe(3000);
    expect(screen.getByText("₱3,000.00")).toBeInTheDocument();
  });

  it("calls onOpenAnalytics when Safe to Spend card is active and clicked anywhere or via Runway & Details", () => {
    render(<DashboardTab {...defaultProps} />);
    // Advance to Slide 2
    fireEvent.click(screen.getByLabelText("Go to slide 2"));

    const safeToSpendCard = screen.getByRole("button", { name: /Safe to Spend/i });
    expect(safeToSpendCard).toBeInTheDocument();

    // Clicking anywhere on the card triggers onOpenAnalytics
    fireEvent.click(safeToSpendCard);
    expect(defaultProps.onOpenAnalytics).toHaveBeenCalledTimes(1);

    // Clicking specifically on Runway & Details cue triggers onOpenAnalytics
    fireEvent.click(screen.getByText(/Runway & Details/i));
    expect(defaultProps.onOpenAnalytics).toHaveBeenCalledTimes(2);

    // Keyboard activation (Enter key) also triggers onOpenAnalytics
    fireEvent.keyDown(safeToSpendCard, { key: "Enter" });
    expect(defaultProps.onOpenAnalytics).toHaveBeenCalledTimes(3);
  });

  it("ensures all four carousel slides use the shared uniform card dimensions and classes", () => {
    const { container } = render(<DashboardTab {...defaultProps} />);
    const cards = container.querySelectorAll(".snap-center > div");
    expect(cards.length).toBe(4);
    cards.forEach((card) => {
      expect(card.className).toContain("h-[156px]");
      expect(card.className).toContain("sm:h-[160px]");
      expect(card.className).toContain("rounded-2xl");
      expect(card.className).toContain("p-4");
      expect(card.className).toContain("sm:p-5");
      expect(card.className).toContain("bg-surface-elevated/90");
    });
  });

  it("renders Slide 3 Active Debt with loan count and runway action", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Active Debt")).toBeInTheDocument();
    expect(screen.getByText(/1 Active Loan/i)).toBeInTheDocument();
    expect(screen.getByText(/View Debt Runway/i)).toBeInTheDocument();
  });

  it("renders Slide 4 Yearly Overview with selected year and annual summary action", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Yearly Overview")).toBeInTheDocument();
    expect(screen.getByText("2026 Summary")).toBeInTheDocument();
    expect(screen.getByText(/Open Annual Summary/i)).toBeInTheDocument();
  });

  it("renders 4 pagination dots for the 4 carousel slides", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByLabelText("Go to slide 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to slide 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to slide 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to slide 4")).toBeInTheDocument();
  });

  it("renders compact Wallets card and handles onNavigateToWallets on click", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Across 2 wallets")).toBeInTheDocument();
    const walletCard = screen.getByText("Across 2 wallets").closest("div[class*='cursor-pointer']");
    expect(walletCard).toBeTruthy();
    fireEvent.click(walletCard!);
    expect(defaultProps.onNavigateToWallets).toHaveBeenCalled();
  });

  it("renders compact Upcoming card and opens UpcomingModal on click, then CTA navigates to Commitments", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("₱4,000.00")).toBeInTheDocument();
    const upcomingCard = screen.getByText(/payment(s)? remaining/i).closest("div[class*='cursor-pointer']");
    expect(upcomingCard).toBeTruthy();
    fireEvent.click(upcomingCard!);

    // Modal should now be visible
    expect(screen.getByRole("dialog", { name: "Upcoming Commitments Modal" })).toBeInTheDocument();
    expect(screen.getByText("Total Unpaid")).toBeInTheDocument();

    // Clicking CTA "View All Commitments" navigates to operations bills
    const viewAllBtn = screen.getByText("View All Commitments");
    fireEvent.click(viewAllBtn);
    expect(defaultProps.onNavigateToOps).toHaveBeenCalledWith("bills");
  });

  it("renders overdue indicator and opens UpcomingModal with overdue banner, allowing jump to overdue", () => {
    const overdueBill: BillViewModel = {
      id: "bill-overdue",
      name: "Electric Bill",
      amount: 2500,
      baseAmount: 2500,
      dueDay: "5",
      type: "Bill",
      paid: false,
      startMonth: "Sep 2026",
      endMonth: "Sep 2026",
      targetMonthForDue: "Sep 2026",
      daysLeft: -3,
      isOverridden: false
    };

    render(
      <DashboardTab
        {...defaultProps}
        overdueBills={[overdueBill]}
        overdueSum={2500}
      />
    );

    expect(screen.getByText("1 overdue")).toBeInTheDocument();
    const upcomingCard = screen.getByText("1 overdue").closest("div[class*='cursor-pointer']");
    expect(upcomingCard).toBeTruthy();
    fireEvent.click(upcomingCard!);

    // Modal should be open and display overdue warning banner
    expect(screen.getByRole("dialog", { name: "Upcoming Commitments Modal" })).toBeInTheDocument();
    expect(screen.getByText("1 Overdue Commitment")).toBeInTheDocument();

    // Clicking the overdue banner jumps to overdue
    const overdueBanner = screen.getByText("1 Overdue Commitment").closest("div[class*='cursor-pointer']");
    expect(overdueBanner).toBeTruthy();
    fireEvent.click(overdueBanner!);
    expect(defaultProps.onJumpToOverdue).toHaveBeenCalled();
  });

  it("renders Payday Plan card and opens PaydayModal when clicked", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Payday Plan")).toBeInTheDocument();
    expect(screen.getByText("₱3,500.00")).toBeInTheDocument(); // 2500 + 1000

    // Click to open modal
    const paydayCard = screen.getByText("Payday Plan").closest("div[class*='cursor-pointer']");
    expect(paydayCard).toBeTruthy();
    fireEvent.click(paydayCard!);

    // Payday modal should now be open
    expect(screen.getByRole("dialog", { name: "Payday Distribution Modal" })).toBeInTheDocument();
    expect(screen.getByText("Auto-Distribute to Wallets")).toBeInTheDocument();
  });

  it("invokes onExecutePaydaySplit from inside PaydayModal", () => {
    render(<DashboardTab {...defaultProps} />);
    const paydayCard = screen.getByText("Payday Plan").closest("div[class*='cursor-pointer']");
    fireEvent.click(paydayCard!);

    const distributeBtn = screen.getByText("Auto-Distribute to Wallets");
    fireEvent.click(distributeBtn);
    expect(defaultProps.onExecutePaydaySplit).toHaveBeenCalled();
  });

  it("invokes onUndoPaydaySplit from inside PaydayModal when previous execution exists", () => {
    const latestExecution: PaydayExecution = {
      id: "exec-1",
      date: "2026-09-15",
      timestamp: Date.now(),
      allocations: { main: 2500, savings: 1000 },
      billContributions: []
    };

    render(
      <DashboardTab
        {...defaultProps}
        latestExecution={latestExecution}
      />
    );

    const paydayCard = screen.getByText("Payday Plan").closest("div[class*='cursor-pointer']");
    fireEvent.click(paydayCard!);

    const undoBtn = screen.getByText("Undo");
    fireEvent.click(undoBtn);
    expect(defaultProps.onUndoPaydaySplit).toHaveBeenCalledWith("exec-1");
  });

  it("renders Quick Add floating button and opens QuickAddModal, correctly routing actions", () => {
    render(<DashboardTab {...defaultProps} />);
    const quickAddBtn = screen.getByLabelText("Quick Add");
    expect(quickAddBtn).toBeInTheDocument();

    fireEvent.click(quickAddBtn);
    expect(screen.getByRole("dialog", { name: "Quick Add Menu" })).toBeInTheDocument();

    // Click "Add Bill or Commitment"
    fireEvent.click(screen.getByText("Add Bill or Commitment"));
    expect(defaultProps.onNavigateToOps).toHaveBeenCalledWith("bills");

    // Reopen and click "Scan / Add Expense"
    fireEvent.click(quickAddBtn);
    fireEvent.click(screen.getByText("Scan / Add Expense"));
    expect(defaultProps.onNavigateToExpenses).toHaveBeenCalled();
  });

  it("calls onOpenLedger when View Ledger is clicked in Recent Activity", () => {
    render(<DashboardTab {...defaultProps} />);
    fireEvent.click(screen.getByText("View Ledger"));
    expect(defaultProps.onOpenLedger).toHaveBeenCalled();
  });

  it("renders desktop edge navigation: shows Next slide on slide 0 and clicking it navigates to slide 1", () => {
    render(<DashboardTab {...defaultProps} />);
    // On slide 0, Next slide button is rendered
    const nextBtn = screen.getByLabelText("Next slide");
    expect(nextBtn).toBeInTheDocument();
    // Previous slide button should not be present on slide 0
    expect(screen.queryByLabelText("Previous slide")).not.toBeInTheDocument();

    // Clicking Next slide advances to slide 1
    fireEvent.click(nextBtn);
    // Now on slide 1, Previous slide button should be present
    expect(screen.getByLabelText("Previous slide")).toBeInTheDocument();
  });

  it("navigates reliably through all slides forward and backward (Slide 1 -> 2 -> 3 -> 4 -> 3 -> 2 -> 1)", () => {
    render(<DashboardTab {...defaultProps} />);

    // Start on Slide 1 (index 0)
    expect(screen.getByLabelText("Next slide")).toBeInTheDocument();
    expect(screen.queryByLabelText("Previous slide")).not.toBeInTheDocument();

    // Slide 1 -> Next -> Slide 2
    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.getByLabelText("Previous slide")).toBeInTheDocument();
    expect(screen.getByLabelText("Next slide")).toBeInTheDocument();

    // Slide 2 -> Previous -> Slide 1 (Bug 1 verification)
    fireEvent.click(screen.getByLabelText("Previous slide"));
    expect(screen.queryByLabelText("Previous slide")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Next slide")).toBeInTheDocument();

    // Slide 1 -> Next -> Slide 2
    fireEvent.click(screen.getByLabelText("Next slide"));
    // Slide 2 -> Next -> Slide 3
    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.getByLabelText("Previous slide")).toBeInTheDocument();
    expect(screen.getByLabelText("Next slide")).toBeInTheDocument();

    // Slide 3 -> Next -> Slide 4 (last slide boundary)
    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(screen.getByLabelText("Previous slide")).toBeInTheDocument();
    // On Slide 4, Next slide button should not be present
    expect(screen.queryByLabelText("Next slide")).not.toBeInTheDocument();

    // Slide 4 -> Previous -> Slide 3
    fireEvent.click(screen.getByLabelText("Previous slide"));
    expect(screen.getByLabelText("Next slide")).toBeInTheDocument();

    // Slide 3 -> Previous -> Slide 2
    fireEvent.click(screen.getByLabelText("Previous slide"));

    // Slide 2 -> Previous -> Slide 1
    fireEvent.click(screen.getByLabelText("Previous slide"));
    expect(screen.queryByLabelText("Previous slide")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Next slide")).toBeInTheDocument();
  });
});
