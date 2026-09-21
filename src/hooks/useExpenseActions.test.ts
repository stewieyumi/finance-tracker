import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpenseActions } from "./useExpenseActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData, Expense } from "../types/finance";

const createTestData = (): UnifiedFinanceData => ({
  ...INITIAL_UNIFIED_DATA,
  wallets: {
    ...INITIAL_UNIFIED_DATA.wallets,
    maya: 5000,
  },
  settings: {
    ...INITIAL_UNIFIED_DATA.settings,
    defaultWallet: "maya",
  },
  library: {
    ...INITIAL_UNIFIED_DATA.library,
    expenses: [],
  },
});

describe("useExpenseActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves an expense and deducts the selected wallet", () => {
    const initialData = createTestData();
    const setGlobalData = vi.fn();
    const showToast = vi.fn();
    const onSuccess = vi.fn();
    const resetForm = vi.fn();

    const { result } = renderHook(() =>
      useExpenseActions({
        globalData: initialData,
        setGlobalData,
        showToast,
      })
    );

    act(() => {
      result.current.handleSaveExpense(
        {
          merchant: "Test Expense",
          amount: "1000",
          category: "Food & Dining",
          wallet: "maya",
          date: "2026-09-20",
        },
        onSuccess,
        resetForm
      );
    });

    expect(setGlobalData).toHaveBeenCalledTimes(1);

    const updater = setGlobalData.mock.calls[0][0];
    const nextData = updater(initialData);

    expect(nextData.wallets.maya).toBe(4000);
    expect(nextData.library.expenses).toHaveLength(1);
    expect(nextData.library.expenses[0]).toMatchObject({
      merchant: "Test Expense",
      amount: 1000,
      deductedAmount: 1000,
      category: "Food & Dining",
      wallet: "maya",
      date: "2026-09-20",
    });

    expect(showToast).toHaveBeenCalledWith(
      "Logged ₱1000 & deducted from wallet"
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(resetForm).toHaveBeenCalledTimes(1);
  });

  it("rejects an expense when the wallet has insufficient balance", () => {
    const initialData = createTestData();
    initialData.wallets.maya = 500;

    const setGlobalData = vi.fn();
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useExpenseActions({
        globalData: initialData,
        setGlobalData,
        showToast,
      })
    );

    act(() => {
      result.current.handleSaveExpense(
        {
          merchant: "Too Expensive",
          amount: "1000",
          category: "Food & Dining",
          wallet: "maya",
          date: "2026-09-20",
        },
        vi.fn(),
        vi.fn()
      );
    });

    expect(setGlobalData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Insufficient balance in maya. Need ₱1,000"
    );
  });

  it("refunds the recorded deducted amount when deleting an expense", () => {
    const initialData = createTestData();
    initialData.wallets.maya = 500;

    const expense: Expense = {
      id: "exp-refund-test",
      merchant: "Partial Deduction Expense",
      amount: 1000,
      deductedAmount: 600,
      category: "Food & Dining",
      wallet: "maya",
      date: "2026-09-19",
    };

    initialData.library.expenses = [expense];

    const setGlobalData = vi.fn();
    const showToast = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => true));

    const { result } = renderHook(() =>
      useExpenseActions({
        globalData: initialData,
        setGlobalData,
        showToast,
      })
    );

    act(() => {
      result.current.handleDeleteExpense(expense);
    });

    expect(setGlobalData).toHaveBeenCalledTimes(1);

    const updater = setGlobalData.mock.calls[0][0];
    const nextData = updater(initialData);

    expect(nextData.wallets.maya).toBe(1100);
    expect(nextData.library.expenses).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(
      "Expense deleted and refunded."
    );
  });

  it("does not mutate state when deletion is cancelled", () => {
    const initialData = createTestData();

    const expense: Expense = {
      id: "exp-cancel-test",
      merchant: "Cancelled Expense",
      amount: 500,
      category: "Food & Dining",
      wallet: "maya",
      date: "2026-09-19",
    };

    initialData.library.expenses = [expense];

    const setGlobalData = vi.fn();
    const showToast = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => false));

    const { result } = renderHook(() =>
      useExpenseActions({
        globalData: initialData,
        setGlobalData,
        showToast,
      })
    );

    act(() => {
      result.current.handleDeleteExpense(expense);
    });

    expect(setGlobalData).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(initialData.library.expenses).toHaveLength(1);
  });
});
