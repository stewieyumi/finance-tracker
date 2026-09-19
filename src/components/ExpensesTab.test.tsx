import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpensesTab } from "./ExpensesTab";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData } from "../types/finance";

const createTestData = (): UnifiedFinanceData => ({
  ...INITIAL_UNIFIED_DATA,
  wallets: {
    ...INITIAL_UNIFIED_DATA.wallets,
    maya: 5000
  },
  settings: {
    ...INITIAL_UNIFIED_DATA.settings,
    defaultWallet: "maya"
  },
  library: {
    ...INITIAL_UNIFIED_DATA.library,
    expenses: []
  }
});

describe("ExpensesTab - wallet balance protection", () => {
  it("rejects an expense when the selected wallet cannot cover the full amount", () => {
    const initialData = createTestData();
    initialData.wallets.maya = 500;

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    render(
      <ExpensesTab
        globalData={initialData}
        setGlobalData={mockSetGlobalData}
        showToast={mockShowToast}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manual/i }));

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Starbucks, Laundry..."),
      {
        target: { value: "Test Expense" }
      }
    );

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "1000" }
    });

    fireEvent.click(
      screen.getByRole("button", { name: /save & deduct/i })
    );

    expect(mockSetGlobalData).not.toHaveBeenCalled();
    expect(initialData.wallets.maya).toBe(500);
    expect(initialData.library.expenses).toHaveLength(0);

    expect(mockShowToast).toHaveBeenCalledWith(
      "Insufficient balance in maya. Need ₱1,000"
    );
  });

  it("refunds only the recorded deducted amount when deleting an expense", () => {
    const initialData = createTestData();
    initialData.wallets.maya = 500;
    initialData.library.expenses = [{
      id: "exp-refund-test",
      merchant: "Partial Deduction Expense",
      amount: 1000,
      deductedAmount: 600,
      category: "Food & Dining",
      wallet: "maya",
      date: "2026-09-19"
    }];

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(
      <ExpensesTab
        globalData={initialData}
        setGlobalData={mockSetGlobalData}
        showToast={mockShowToast}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete expense" })
    );

    expect(mockSetGlobalData).toHaveBeenCalledTimes(1);

    const updater = mockSetGlobalData.mock.calls[0][0];

    expect(typeof updater).toBe("function");

    const nextData = updater(initialData);

    expect(nextData.wallets.maya).toBe(1100);
    expect(nextData.library.expenses).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it("allows an expense when the selected wallet has exactly enough balance", () => {
    const initialData = createTestData();
    initialData.wallets.maya = 1000;

    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    render(
      <ExpensesTab
        globalData={initialData}
        setGlobalData={mockSetGlobalData}
        showToast={mockShowToast}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /manual/i }));

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Starbucks, Laundry..."),
      {
        target: { value: "Test Expense" }
      }
    );

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "1000" }
    });

    fireEvent.click(
      screen.getByRole("button", { name: /save & deduct/i })
    );

    expect(mockSetGlobalData).toHaveBeenCalledTimes(1);

    const updater = mockSetGlobalData.mock.calls[0][0];

    expect(typeof updater).toBe("function");

    const nextData = updater(initialData);

    expect(nextData.wallets.maya).toBe(0);
    expect(nextData.library.expenses).toHaveLength(1);
    expect(nextData.library.expenses?.[0]).toMatchObject({
      merchant: "Test Expense",
      amount: 1000,
      deductedAmount: 1000,
    wallet: "maya"
    });
  });
});
