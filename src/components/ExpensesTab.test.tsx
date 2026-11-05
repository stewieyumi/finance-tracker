import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
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
  it("opens a shortcut as an unsaved expense and preserves the draft when used again", () => {
    const initialData = createTestData();
    initialData.settings = { ...initialData.settings, customWallets: [{ id: "maya", label: "Maya", color: "text-blue-400" }] };
    const setGlobalData = vi.fn();
    window.history.replaceState(null, "", "/#quick-expense");
    try {
      render(<ExpensesTab globalData={initialData} setGlobalData={setGlobalData} showToast={vi.fn()} />);

      const form = screen.getByRole("form", { name: "Log Expense" });
      expect(screen.getByRole("dialog", { name: "Log Expense" })).toHaveFocus();
      expect(within(form).getByRole("option", { name: "Maya" })).toHaveProperty("selected", true);
      expect(window.location.hash).toBe("");
      const merchant = within(form).getByPlaceholderText("e.g. Starbucks, Laundry...");
      fireEvent.change(merchant, { target: { value: "Sample lunch" } });

      act(() => {
        window.history.replaceState(null, "", "/#quick-expense");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(merchant).toHaveValue("Sample lunch");
      expect(window.location.hash).toBe("");
      expect(setGlobalData).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("prefills a pasted receipt and asks before saving a possible duplicate", () => {
    const data = createTestData();
    data.settings = { ...data.settings, customWallets: [{ id: "maya", label: "Maya", color: "text-blue-400" }] };
    data.library.expenses = [{ id: "prior", merchant: "Move It", amount: 125, date: "2026-11-05", category: "Transport", wallet: "maya" }];
    const save = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<ExpensesTab globalData={data} setGlobalData={save} showToast={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /^Manual/ }));
      fireEvent.click(screen.getByRole("button", { name: "Paste receipt text" }));
      fireEvent.change(screen.getByLabelText("Receipt or payment message"), {
        target: { value: "You paid PHP 125.00 to Move It\nDate: 2026-11-05\nBalance: PHP 4,875.00" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Use in draft" }));

      const form = screen.getByRole("form", { name: "Log Expense" });
      expect(within(form).getByPlaceholderText("e.g. Starbucks, Laundry...")).toHaveValue("Move It");
      expect(within(form).getByRole("spinbutton")).toHaveValue(125);
      expect(within(form).getByText(/possible duplicate/i)).toBeVisible();
      expect(save).not.toHaveBeenCalled();

      fireEvent.submit(form);
      expect(confirm).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();

      confirm.mockReturnValue(true);
      fireEvent.submit(form);
      expect(save).toHaveBeenCalledOnce();
    } finally {
      confirm.mockRestore();
    }
  });

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

    const dialog = screen.getByRole("dialog", { name: "Log Expense" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
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
