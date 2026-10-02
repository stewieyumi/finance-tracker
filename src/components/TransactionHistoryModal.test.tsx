import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TransactionHistoryModal } from "./TransactionHistoryModal";
import { TransactionHistoryItem } from "../types/finance";

const mockTransactions: TransactionHistoryItem[] = [
  {
    id: "tx-1",
    title: "Client Payment",
    amount: 15000,
    date: "2026-09-15",
    type: "inflow",
    wallet: "main",
    category: "Salary"
  },
  {
    id: "tx-2",
    title: "Grocery Store",
    amount: -2500,
    date: "2026-09-10",
    type: "expense",
    wallet: "gcash",
    category: "Food & Dining"
  },
  {
    id: "tx-3",
    title: "Internet Bill",
    amount: -1800,
    date: "2026-08-20",
    type: "bill",
    wallet: "bpi",
    category: "Utilities"
  }
];

describe("TransactionHistoryModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    transactions: mockTransactions,
    walletLabels: { main: "Main Account", gcash: "GCash Wallet", bpi: "BPI Savings" },
    formatDateTime: (d: string) => `Date: ${d}`,
    onOpenManualLedger: vi.fn()
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <TransactionHistoryModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders transactions and summary when isOpen is true", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    expect(screen.getByText("Transaction History")).toBeInTheDocument();
    expect(screen.getByText("Client Payment")).toBeInTheDocument();
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    expect(screen.getByText("Internet Bill")).toBeInTheDocument();
    expect(screen.getByText("Main Account")).toBeInTheDocument();
    expect(screen.getByText("GCash Wallet")).toBeInTheDocument();
    expect(screen.getByText("Date: 2026-09-15")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    const closeBtn = screen.getByLabelText("Close transaction history");
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onOpenManualLedger when Manage Ledger is clicked", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    const manageBtn = screen.getByLabelText("Manage Ledger");
    fireEvent.click(manageBtn);
    expect(defaultProps.onOpenManualLedger).toHaveBeenCalled();
  });

  it("filters transactions by month", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    const monthSelect = screen.getByLabelText("Filter by month");
    // Select August 2026 ("2026-08")
    fireEvent.change(monthSelect, { target: { value: "2026-08" } });

    expect(screen.getByText("Internet Bill")).toBeInTheDocument();
    expect(screen.queryByText("Client Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Grocery Store")).not.toBeInTheDocument();
  });

  it("filters transactions by type", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    // Click "Inflows"
    fireEvent.click(screen.getByRole("button", { name: /Inflows/i }));
    expect(screen.getByText("Client Payment")).toBeInTheDocument();
    expect(screen.queryByText("Grocery Store")).not.toBeInTheDocument();
    expect(screen.queryByText("Internet Bill")).not.toBeInTheDocument();

    // Click "Expenses"
    fireEvent.click(screen.getByRole("button", { name: /Expenses/i }));
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    expect(screen.queryByText("Client Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Internet Bill")).not.toBeInTheDocument();

    // Click "Bills"
    fireEvent.click(screen.getByRole("button", { name: /Bills/i }));
    expect(screen.getByText("Internet Bill")).toBeInTheDocument();
    expect(screen.queryByText("Client Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Grocery Store")).not.toBeInTheDocument();
  });

  it("filters transactions by search query", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText("Search description, category, wallet...");
    fireEvent.change(searchInput, { target: { value: "grocery" } });

    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    expect(screen.queryByText("Client Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Internet Bill")).not.toBeInTheDocument();
  });

  it("displays empty state and resets filters when clear button is clicked", () => {
    render(<TransactionHistoryModal {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText("Search description, category, wallet...");
    fireEvent.change(searchInput, { target: { value: "nonexistent query" } });

    expect(screen.getByText("No transactions match your current filters.")).toBeInTheDocument();

    const clearBtn = screen.getByText("Clear all filters");
    fireEvent.click(clearBtn);

    expect(screen.getByText("Client Payment")).toBeInTheDocument();
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
  });

  it("supports bounded rendering and Load More for large transaction lists", () => {
    // Generate 65 mock transactions
    const largeList: TransactionHistoryItem[] = Array.from({ length: 65 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `Bulk Item ${i}`,
      amount: -100,
      date: "2026-09-01",
      type: "expense",
      wallet: "main"
    }));

    render(<TransactionHistoryModal {...defaultProps} transactions={largeList} />);

    // First page contains Bulk Item 0 to Bulk Item 49 (50 items)
    expect(screen.getByText("Bulk Item 0")).toBeInTheDocument();
    expect(screen.getByText("Bulk Item 49")).toBeInTheDocument();
    expect(screen.queryByText("Bulk Item 50")).not.toBeInTheDocument();

    // Click Load More
    const loadMoreBtn = screen.getByText(/Load More \(15 remaining\)/);
    fireEvent.click(loadMoreBtn);

    // Bulk Item 50 is now rendered
    expect(screen.getByText("Bulk Item 50")).toBeInTheDocument();
    expect(screen.getByText("Bulk Item 64")).toBeInTheDocument();
    expect(screen.getByText("Showing all 65 transactions")).toBeInTheDocument();
  });

  it("characterizes fallback to raw wallet ID when key is not in walletLabels prop", () => {
    const unmappedTx: TransactionHistoryItem[] = [
      { id: "tx-unmapped", title: "Unmapped Item", amount: 500, date: "2026-09-01", type: "inflow", wallet: "unmapped_wallet_id" }
    ];
    render(<TransactionHistoryModal {...defaultProps} transactions={unmappedTx} />);
    expect(screen.getByText("unmapped_wallet_id")).toBeInTheDocument();
  });

  it("resolves active custom wallet IDs to custom labels through merged walletLabels map", () => {
    const customTx: TransactionHistoryItem[] = [
      { id: "tx-cw", title: "Payout Deposit", amount: 8000, date: "2026-09-01", type: "inflow", wallet: "cw_vault_999" }
    ];
    const props = {
      ...defaultProps,
      transactions: customTx,
      walletLabels: {
        main: "Main Account",
        cw_vault_999: "Vault Account"
      }
    };
    render(<TransactionHistoryModal {...props} />);
    expect(screen.getByText("Vault Account")).toBeInTheDocument();
  });
});
