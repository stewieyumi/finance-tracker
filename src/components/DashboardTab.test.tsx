import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardTab } from "./DashboardTab";
import { TransactionHistoryItem } from "../types/finance";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import React from "react";

const mockTransactions: TransactionHistoryItem[] = [
  { id: "tx1", title: "Test Inflow", amount: 100, type: "inflow", date: "2026-09-01T12:00:00", wallet: "main" },
];

describe("DashboardTab", () => {
  const defaultProps = {
    globalData: INITIAL_UNIFIED_DATA,
    targetMilestoneFund: 10000,
    totalLiquid: 5000,
    fundProgressPercent: "50.0",
    totalPendingReceivables: 0,
    monthIncomeCollected: 0,
    selectedMonth: "Sep 2026",
    priorityUnpaidSum: 0,
    totalUnpaidCommitments: 0,
    overdueBills: [],
    overdueSum: 0,
    paydayAllocations: {},
    remainingBuffer: 100,
    isViewingCurrentMonth: true,
    hasExecutedToday: false,
    latestExecution: undefined,
    recentTransactions: mockTransactions,
    onOpenSettings: vi.fn(),
    onExecutePaydaySplit: vi.fn(),
    onUndoPaydaySplit: vi.fn(),
    onJumpToOverdue: vi.fn(),
    onCommitWallet: vi.fn(),
    onIncrementWallet: vi.fn(),
    onCopySummary: vi.fn(),
    formatDateTime: (d: string) => d,
  };

  it("renders transaction history", () => {
    render(<DashboardTab {...defaultProps} />);
    expect(screen.getByText("Test Inflow")).toBeInTheDocument();
  });

  it("calls onCopySummary when Copy Summary is clicked", () => {
    render(<DashboardTab {...defaultProps} />);
    fireEvent.click(screen.getByText("Copy Summary"));
    expect(defaultProps.onCopySummary).toHaveBeenCalled();
  });
});
