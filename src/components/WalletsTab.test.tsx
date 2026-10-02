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

describe("WalletsTab - handleDelete characterization", () => {
  let confirmSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    confirmSpy = vi.spyOn(window, "confirm");
  });

  it("cancelling confirmation causes no mutation", () => {
    confirmSpy.mockReturnValue(false);
    const setGlobalData = vi.fn();
    const data = makeData();

    render(
      <WalletsTab
        globalData={data}
        setGlobalData={setGlobalData}
        onCommit={vi.fn()}
        onIncrement={vi.fn()}
      />
    );

    const deleteButtons = screen.getAllByLabelText("Delete account");
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("characterizes the existing handleDelete state cascade upon confirmation", () => {
    confirmSpy.mockReturnValue(true);
    const setGlobalData = vi.fn();
    const initialData = makeData();

    render(
      <WalletsTab
        globalData={initialData}
        setGlobalData={setGlobalData}
        onCommit={vi.fn()}
        onIncrement={vi.fn()}
      />
    );

    // Click delete on the first account ("Delete Me" / "w_del")
    const deleteButtons = screen.getAllByLabelText("Delete account");
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(setGlobalData).toHaveBeenCalledTimes(1);

    const updater = setGlobalData.mock.calls[0][0];
    expect(typeof updater).toBe("function");

    const updatedData = updater(initialData);

    // 1. deleted wallet balance is removed
    expect(updatedData.wallets.w_del).toBeUndefined();

    // 2. wallet balances unrelated to deleted wallet remain unchanged
    expect(updatedData.wallets.w_fallback).toBe(2500);
    expect(updatedData.wallets.w_other).toBe(500);

    // 3. deleted wallet is removed from settings.customWallets
    expect(updatedData.settings.customWallets).toHaveLength(2);
    expect(updatedData.settings.customWallets.map((w: any) => w.id)).toEqual(["w_fallback", "w_other"]);

    // 4. settings routing fields are reassigned to the fallback wallet ("w_fallback")
    expect(updatedData.settings.milestoneWallet).toBe("w_fallback");
    expect(updatedData.settings.livingWallet).toBe("w_fallback");
    expect(updatedData.settings.savingsWallet).toBe("w_fallback");
    expect(updatedData.settings.transitWallet).toBe("w_fallback");
    expect(updatedData.settings.defaultWallet).toBe("w_fallback");

    // 5. expenseWallets mappings: deleted mapped to fallback, unrelated left intact
    expect(updatedData.settings.expenseWallets["Food & Dining"]).toBe("w_fallback");
    expect(updatedData.settings.expenseWallets["Transport"]).toBe("w_other");

    // 6. bills referencing deleted wallet are reassigned to fallback; unrelated unchanged
    expect(updatedData.library.bills).toHaveLength(2);
    expect(updatedData.library.bills.find((b: any) => b.id === "b_del")?.wallet).toBe("w_fallback");
    expect(updatedData.library.bills.find((b: any) => b.id === "b_other")?.wallet).toBe("w_other");

    // 7. receivables referencing deleted wallet are reassigned to fallback; unrelated unchanged
    expect(updatedData.library.receivables).toHaveLength(2);
    expect(updatedData.library.receivables.find((r: any) => r.id === "r_del")?.wallet).toBe("w_fallback");
    expect(updatedData.library.receivables.find((r: any) => r.id === "r_other")?.wallet).toBe("w_other");

    // 8. expenses referencing deleted wallet are reassigned to fallback; unrelated unchanged
    expect(updatedData.library.expenses).toHaveLength(2);
    expect(updatedData.library.expenses.find((e: any) => e.id === "e_del")?.wallet).toBe("w_fallback");
    expect(updatedData.library.expenses.find((e: any) => e.id === "e_other")?.wallet).toBe("w_other");

    // 9. monetary amounts on library items remain unchanged
    expect(updatedData.library.bills.find((b: any) => b.id === "b_del")?.amount).toBe(300);
    expect(updatedData.library.receivables.find((r: any) => r.id === "r_del")?.amount).toBe(1000);
    expect(updatedData.library.expenses.find((e: any) => e.id === "e_del")?.amount).toBe(150);

    // 10. manualTransactions referencing deleted wallet are reassigned to fallback
    expect(updatedData.library.manualTransactions).toHaveLength(1);
    expect(updatedData.library.manualTransactions[0].wallet).toBe("w_fallback");
    expect(updatedData.library.manualTransactions[0].amount).toBe(500);

    // 11. paydaySplitExecutions remain unchanged under current code
    expect(updatedData.paydaySplitExecutions).toEqual(initialData.paydaySplitExecutions);

    // 12. updatedAt timestamp is refreshed
    expect(updatedData.updatedAt).toBeGreaterThan(0);
  });

  it("characterizes fallback to 'main' when all custom wallets are deleted", () => {
    confirmSpy.mockReturnValue(true);
    const setGlobalData = vi.fn();
    const soloData = makeData({
      settings: {
        customWallets: [{ id: "solo_wallet", label: "Solo Wallet", color: "text-rose-400" }],
        defaultWallet: "solo_wallet",
        expenseWallets: { "Food & Dining": "solo_wallet" },
      } as any,
      library: {
        bills: [{ id: "b1", name: "Solo Bill", amount: 100, dueDay: "1", type: "Bill", wallet: "solo_wallet" }],
        receivables: [{ id: "r1", name: "Solo Rec", amount: 200, frequency: "Monthly", wallet: "solo_wallet" }],
        expenses: [{ id: "e1", merchant: "Solo Exp", amount: 50, category: "Food & Dining", wallet: "solo_wallet", date: "2026-09-01" }],
        shoots: [],
        manualTransactions: [{ id: "m1", title: "Solo Manual", amount: 300, date: "2026-09-01", type: "expense", wallet: "solo_wallet", createdAt: 1 }],
      },
    });

    render(
      <WalletsTab
        globalData={soloData}
        setGlobalData={setGlobalData}
        onCommit={vi.fn()}
        onIncrement={vi.fn()}
      />
    );

    const deleteButtons = screen.getAllByLabelText("Delete account");
    fireEvent.click(deleteButtons[0]);

    const updater = setGlobalData.mock.calls[0][0];
    const updatedData = updater(soloData);

    expect(updatedData.settings.customWallets).toEqual([]);
    expect(updatedData.settings.defaultWallet).toBe("main");
    expect(updatedData.settings.expenseWallets["Food & Dining"]).toBe("main");
    expect(updatedData.library.bills[0].wallet).toBe("main");
    expect(updatedData.library.receivables[0].wallet).toBe("main");
    expect(updatedData.library.expenses[0].wallet).toBe("main");
    expect(updatedData.library.manualTransactions[0].wallet).toBe("main");
  });

  it("remaps manual transaction wallet and destinationWallet to fallback while leaving unrelated fields untouched", () => {
    confirmSpy.mockReturnValue(true);
    const setGlobalData = vi.fn();
    const testData = makeData({
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        expenses: [],
        manualTransactions: [
          // 1. wallet matches deleted wallet
          { id: "mt_wallet_match", title: "Expense on deleted", amount: 120, date: "2026-09-01", type: "expense", wallet: "w_del", createdAt: 1 },
          // 2. destinationWallet matches deleted wallet
          { id: "mt_dest_match", title: "Transfer into deleted", amount: 350, date: "2026-09-02", type: "transfer", wallet: "w_other", destinationWallet: "w_del", createdAt: 2 },
          // 3. both wallet and destinationWallet match deleted wallet
          { id: "mt_both_match", title: "Self transfer deleted", amount: 50, date: "2026-09-03", type: "transfer", wallet: "w_del", destinationWallet: "w_del", createdAt: 3 },
          // 4. unrelated manual transaction
          { id: "mt_unrelated", title: "Unrelated transfer", amount: 200, date: "2026-09-04", type: "transfer", wallet: "w_other", destinationWallet: "w_fallback", createdAt: 4 },
          // 5. manual transaction with undefined destinationWallet (key absent)
          { id: "mt_no_dest", title: "Income without dest", amount: 500, date: "2026-09-05", type: "income", wallet: "w_del", createdAt: 5 },
          // 6. manual transaction with undefined wallet
          { id: "mt_no_wallet", title: "No wallet", amount: 100, date: "2026-09-06", type: "expense", createdAt: 6 },
        ],
      },
    });

    render(
      <WalletsTab
        globalData={testData}
        setGlobalData={setGlobalData}
        onCommit={vi.fn()}
        onIncrement={vi.fn()}
      />
    );

    const deleteButtons = screen.getAllByLabelText("Delete account");
    fireEvent.click(deleteButtons[0]); // delete "w_del", fallback is "w_fallback"

    const updater = setGlobalData.mock.calls[0][0];
    const updated = updater(testData);

    const txs = updated.library.manualTransactions;
    expect(txs).toHaveLength(6);

    // 1. wallet remapped to fallback
    const t1 = txs.find((t: any) => t.id === "mt_wallet_match");
    expect(t1.wallet).toBe("w_fallback");
    expect(t1.amount).toBe(120);

    // 2. destinationWallet remapped to fallback
    const t2 = txs.find((t: any) => t.id === "mt_dest_match");
    expect(t2.wallet).toBe("w_other");
    expect(t2.destinationWallet).toBe("w_fallback");
    expect(t2.amount).toBe(350);

    // 3. both remapped to fallback
    const t3 = txs.find((t: any) => t.id === "mt_both_match");
    expect(t3.wallet).toBe("w_fallback");
    expect(t3.destinationWallet).toBe("w_fallback");

    // 4. unrelated unchanged
    const t4 = txs.find((t: any) => t.id === "mt_unrelated");
    expect(t4.wallet).toBe("w_other");
    expect(t4.destinationWallet).toBe("w_fallback");

    // 5. destinationWallet remains undefined / absent
    const t5 = txs.find((t: any) => t.id === "mt_no_dest");
    expect(t5.wallet).toBe("w_fallback");
    expect(t5.destinationWallet).toBeUndefined();
    expect("destinationWallet" in t5).toBe(false);

    // 6. wallet remains undefined / absent
    const t6 = txs.find((t: any) => t.id === "mt_no_wallet");
    expect(t6.wallet).toBeUndefined();
    expect("wallet" in t6).toBe(false);

    // Verify paydaySplitExecutions is strictly untouched
    expect(updated.paydaySplitExecutions).toEqual(testData.paydaySplitExecutions);
  });
});
