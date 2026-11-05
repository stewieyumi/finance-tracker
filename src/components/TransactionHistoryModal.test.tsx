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
      loggedAt: new Date(Date.UTC(2026, 8, 1, 12, 0, 65 - i)).toISOString(),
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

  it("shows same-day records newest first without mutating input and includes known local times", () => {
    const records: TransactionHistoryItem[] = [
      { ...mockTransactions[1], id: "z-early", title: "Early purchase", loggedAt: new Date(2026, 8, 10, 9, 15).toISOString() },
      { ...mockTransactions[1], id: "a-late", title: "Late purchase", loggedAt: new Date(2026, 8, 10, 19, 30).toISOString() },
    ];
    Object.freeze(records);
    render(<TransactionHistoryModal {...defaultProps} transactions={records} formatDateTime={undefined} />);
    const titles = screen.getAllByText(/purchase/).map(el => el.textContent);
    expect(titles).toEqual(["Late purchase", "Early purchase"]);
    expect(screen.getByText("Sep 10, 2026 · 7:30 PM")).toBeInTheDocument();
    expect(records[0].title).toBe("Early purchase");
  });

  it("filters inclusive calendar dates together with type and search, then clears the range", () => {
    render(<TransactionHistoryModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Date range"));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-15" } });
    expect(screen.getByText("Client Payment")).toBeInTheDocument();
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    expect(screen.queryByText("Internet Bill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Expenses/ }));
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "gcash" } });
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    expect(screen.queryByText("Client Payment")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All dates" }));
    expect(screen.getByLabelText("From date")).toHaveValue("");
    expect(screen.getByText("Grocery Store")).toBeInTheDocument();
  });

  it("uses local transaction days at midnight, rather than the logging day or UTC prefix", () => {
    const records: TransactionHistoryItem[] = [
      { ...mockTransactions[0], title: "Local midnight", date: new Date(2026, 10, 6, 0, 5).toISOString() },
      { ...mockTransactions[1], title: "Backdated expense", date: "2026-11-05", loggedAt: new Date(2026, 10, 6, 12).toISOString() },
    ];
    render(<TransactionHistoryModal {...defaultProps} transactions={records} />);
    fireEvent.click(screen.getByText("Date range"));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-11-06" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-11-06" } });
    expect(screen.getByText("Local midnight")).toBeInTheDocument();
    expect(screen.queryByText("Backdated expense")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter by month"), { target: { value: "2026-11" } });
    expect(screen.getByLabelText("From date")).toHaveValue("");
    expect(screen.getByText("Backdated expense")).toBeInTheDocument();
  });

  it("explains a reversed range and lets Clear all filters recover", () => {
    render(<TransactionHistoryModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Date range"));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-10" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a To date on or after the From date.");
    expect(screen.queryByText("Client Payment")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Client Payment")).toBeInTheDocument();
  });

  it("offers Today and This Month shortcuts without retaining a conflicting month selection", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 8, 15, 10));
      render(<TransactionHistoryModal {...defaultProps} />);
      fireEvent.change(screen.getByLabelText("Filter by month"), { target: { value: "2026-08" } });
      fireEvent.click(screen.getByText("Date range"));
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      expect(screen.getByLabelText("Filter by month")).toHaveValue("ALL");
      expect(screen.getByLabelText("From date")).toHaveValue("2026-09-15");
      expect(screen.getByLabelText("To date")).toHaveValue("2026-09-15");
      expect(screen.getByText("Client Payment")).toBeInTheDocument();
      expect(screen.queryByText("Grocery Store")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "This Month" }));
      expect(screen.getByLabelText("From date")).toHaveValue("2026-09-01");
      expect(screen.getByLabelText("To date")).toHaveValue("2026-09-30");
      expect(screen.getByText("Grocery Store")).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("resets Load More when calendar dates change, including open-ended ranges", () => {
    const records: TransactionHistoryItem[] = Array.from({ length: 65 }, (_, i) => ({ ...mockTransactions[1], id: `item-${i}`, title: `Purchase ${i}` }));
    render(<TransactionHistoryModal {...defaultProps} transactions={records} />);
    fireEvent.click(screen.getByRole("button", { name: /Load More/ }));
    expect(screen.getByText("Showing all 65 transactions")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Date range"));
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
    expect(screen.getByRole("button", { name: "Load More (15 remaining)" })).toBeInTheDocument();
    expect(screen.queryByText("Showing all 65 transactions")).not.toBeInTheDocument();
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

  it("calls onClose when Escape key or backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<TransactionHistoryModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
