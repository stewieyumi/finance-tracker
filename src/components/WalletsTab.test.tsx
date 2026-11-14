import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { WalletsTab } from "./WalletsTab";
import type { UnifiedFinanceData } from "../types/finance";

const makeData = (overrides: Partial<UnifiedFinanceData> = {}): UnifiedFinanceData => ({
  wallets: {
    w_del: 1500,
    w_fallback: 2500,
    w_other: 500,
  },
  library: {
    bills: [
      { id: "b_del", name: "Electric", amount: 300, dueDay: "10", type: "Bill", wallet: "w_del" },
      { id: "b_other", name: "Gym", amount: 400, dueDay: "15", type: "Bill", wallet: "w_other" },
    ],
    receivables: [
      { id: "r_del", name: "Invoice A", amount: 1000, frequency: "Monthly", wallet: "w_del" },
      { id: "r_other", name: "Invoice B", amount: 2000, frequency: "Monthly", wallet: "w_other" },
    ],
    shoots: [],
    expenses: [
      { id: "e_del", merchant: "Groceries", amount: 150, category: "Food & Dining", wallet: "w_del", date: "2026-09-01" },
      { id: "e_other", merchant: "Gas", amount: 250, category: "Transport", wallet: "w_other", date: "2026-09-02" },
    ],
    manualTransactions: [
      { id: "mt_1", title: "Manual Entry", amount: 500, date: "2026-09-05", type: "expense", wallet: "w_del", createdAt: 1 },
    ],
  },
  logs: {},
  settings: {
    customWallets: [
      { id: "w_del", label: "Delete Me", color: "text-rose-400" },
      { id: "w_fallback", label: "Fallback Wallet", color: "text-emerald-400" },
      { id: "w_other", label: "Other Wallet", color: "text-blue-400" },
    ],
    milestoneWallet: "w_del",
    livingWallet: "w_del",
    savingsWallet: "w_del",
    transitWallet: "w_del",
    defaultWallet: "w_del",
    expenseWallets: {
      "Food & Dining": "w_del",
      Transport: "w_other",
    },
  } as any,
  paydaySplitExecutions: [
    {
      id: "pd_1",
      date: "2026-09-15",
      timestamp: 100,
      allocations: { w_del: 1000, w_fallback: 500 },
      billContributions: [],
    },
  ],
  updatedAt: 0,
  ...overrides,
});

it("opens Transfer from the wallet summary without changing balances", () => {
  const onTransfer = vi.fn();
  const setGlobalData = vi.fn();
  const onCommit = vi.fn();
  const onIncrement = vi.fn();
  render(<WalletsTab globalData={makeData()} setGlobalData={setGlobalData}
    onCommit={onCommit} onIncrement={onIncrement} onTransfer={onTransfer} />);
  fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
  expect(onTransfer).toHaveBeenCalledOnce();
  expect(setGlobalData).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  expect(onIncrement).not.toHaveBeenCalled();
});

it("explains why Transfer is unavailable with only one wallet", () => {
  const data = makeData();
  data.settings = { ...data.settings, customWallets: data.settings?.customWallets?.slice(0, 1) };
  const onTransfer = vi.fn();
  render(<WalletsTab globalData={data} setGlobalData={vi.fn()}
    onCommit={vi.fn()} onIncrement={vi.fn()} onTransfer={onTransfer} />);
  const button = screen.getByRole("button", { name: "Transfer" });
  expect(button).toBeDisabled();
  expect(screen.getByText("Add another wallet to enable transfers.")).toBeInTheDocument();
  fireEvent.click(button);
  expect(onTransfer).not.toHaveBeenCalled();
});

describe("WalletsTab archival", () => {
  beforeEach(() => vi.restoreAllMocks());

  const renderWallets = (globalData: UnifiedFinanceData, setGlobalData = vi.fn()) => {
    const view = render(<WalletsTab globalData={globalData} setGlobalData={setGlobalData}
      onCommit={vi.fn()} onIncrement={vi.fn()} />);
    return { ...view, setGlobalData };
  };

  it("blocks archiving a wallet with money or an active payment route", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { setGlobalData, unmount } = renderWallets(makeData());
    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(alert).toHaveBeenLastCalledWith("Bring this wallet to zero before archiving it.");
    expect(setGlobalData).not.toHaveBeenCalled();
    unmount();

    const data = makeData();
    data.wallets.w_del = 0;
    const next = renderWallets(data);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(alert).toHaveBeenLastCalledWith("Change the wallet used by settings, commitments, or inflows before archiving.");
    expect(next.setGlobalData).not.toHaveBeenCalled();
  });

  it.each(["transferFromWallet", "transferToWallet"] as const)("keeps a wallet used by %s active", preference => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const data = makeData();
    data.wallets.w_del = 0;
    data.library.bills = [];
    data.library.receivables = [];
    data.settings = { customWallets: data.settings?.customWallets, [preference]: "w_del" };
    const { setGlobalData } = renderWallets(data);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(alert).toHaveBeenCalledWith("Change the wallet used by settings, commitments, or inflows before archiving.");
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("archives and restores without rewriting historical records or changing total cash", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const data = makeData();
    data.wallets.w_del = 0;
    data.library.bills = data.library.bills.filter(bill => bill.wallet !== "w_del");
    data.library.receivables = data.library.receivables.filter(receivable => receivable.wallet !== "w_del");
    data.settings = { customWallets: data.settings?.customWallets };
    const { setGlobalData, rerender } = renderWallets(data);

    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(confirm).toHaveBeenCalled();
    const archive = setGlobalData.mock.calls[0][0];
    const archived = archive(data) as UnifiedFinanceData;
    expect(archive({ ...data, wallets: { ...data.wallets, w_del: 1 } }).wallets.w_del).toBe(1);
    expect(archived.wallets).toEqual({ w_del: 0, w_fallback: 2500, w_other: 500 });
    expect(archived.library).toBe(data.library);
    expect(archived.logs).toBe(data.logs);
    expect(archived.paydaySplitExecutions).toBe(data.paydaySplitExecutions);
    expect(archived.settings?.archivedWallets?.[0].id).toBe("w_del");

    rerender(<WalletsTab globalData={archived} setGlobalData={setGlobalData}
      onCommit={vi.fn()} onIncrement={vi.fn()} />);
    fireEvent.click(screen.getByText("Archived wallets"));
    fireEvent.click(screen.getByRole("button", { name: "Restore Delete Me" }));
    const restored = setGlobalData.mock.calls[1][0](archived) as UnifiedFinanceData;
    expect(restored.wallets).toEqual(data.wallets);
    expect(restored.settings?.customWallets).toContainEqual(data.settings.customWallets?.[0]);
    expect(restored.settings?.archivedWallets).toEqual([]);
  });

  it("rejects archiving a wallet with invalid balance (null, NaN, malformed string)", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const data = makeData();
    data.library.bills = [];
    data.library.receivables = [];
    data.settings = { customWallets: data.settings?.customWallets };

    // null balance
    (data.wallets as any).w_del = null;
    const { setGlobalData: set1, unmount: u1 } = renderWallets(data);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(alert).toHaveBeenCalledWith("Cannot archive wallet with an invalid or corrupted balance. Repair the balance first.");
    expect(set1).not.toHaveBeenCalled();
    u1();

    // NaN balance
    (data.wallets as any).w_del = NaN;
    const { setGlobalData: set2, unmount: u2 } = renderWallets(data);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(alert).toHaveBeenCalledWith("Cannot archive wallet with an invalid or corrupted balance. Repair the balance first.");
    expect(set2).not.toHaveBeenCalled();
    u2();

    // malformed string balance
    (data.wallets as any).w_del = "corrupted";
    const { setGlobalData: set3, unmount: u3 } = renderWallets(data);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(alert).toHaveBeenCalledWith("Cannot archive wallet with an invalid or corrupted balance. Repair the balance first.");
    expect(set3).not.toHaveBeenCalled();
    u3();
  });

  it("permits archiving a wallet with absent balance or valid numeric zero string", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const data = makeData();
    delete (data.wallets as any).w_del; // absent balance
    data.library.bills = [];
    data.library.receivables = [];
    data.settings = { customWallets: data.settings?.customWallets };
    const { setGlobalData } = renderWallets(data);

    fireEvent.click(screen.getAllByRole("button", { name: "Archive account" })[0]);
    expect(confirm).toHaveBeenCalled();
    const updater = setGlobalData.mock.calls[0][0];
    const archived = updater(data);
    expect(archived.settings?.archivedWallets?.[0]?.id).toBe("w_del");
    // Absent balance is not modified
    expect(archived.wallets.w_del).toBeUndefined();
  });
});
