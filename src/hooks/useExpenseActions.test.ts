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
    customWallets: [
      ...(INITIAL_UNIFIED_DATA.settings?.customWallets || []),
      { id: "maya", label: "Maya", color: "text-emerald-400" },
    ],
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

  it("records the actual save time once while preserving a backdated date and legacy records", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-06T02:03:04.000Z"));
      const initialData = createTestData();
      initialData.library.expenses = [{ id: "legacy", merchant: "Old receipt", amount: 20, category: "Other", wallet: "maya", date: "2026-01-01" }];
      const setGlobalData = vi.fn();
      const { result } = renderHook(() => useExpenseActions({ globalData: initialData, setGlobalData, showToast: vi.fn() }));
      act(() => result.current.handleSaveExpense({ merchant: "Backdated", amount: "100", category: "Other", wallet: "maya", date: "2026-10-01" }, vi.fn(), vi.fn()));
      vi.advanceTimersByTime(5000);
      const next = setGlobalData.mock.calls[0][0](initialData);
      expect(next.library.expenses[0]).toMatchObject({ date: "2026-10-01", loggedAt: "2026-11-06T02:03:04.000Z" });
      expect(next.library.expenses[1]).toEqual(initialData.library.expenses[0]);
      expect(next.library.expenses[1]).not.toHaveProperty("loggedAt");
      expect(next.wallets.maya).toBe(4900);
    } finally {
      vi.useRealTimers();
    }
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

  it("rejects saving an expense when wallet is archived and commits nothing", () => {
    const data = createTestData();
    data.settings = {
      ...data.settings,
      archivedWallets: [{ id: "archived_maya", label: "Archived Maya", color: "text-gray-400" }],
    };
    data.wallets.archived_maya = 5000;

    const mockCommitter = vi.fn(transition => transition(data));
    const showToast = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useExpenseActions({
        globalData: data,
        commitExpenseTransition: mockCommitter,
        showToast,
      })
    );

    act(() => {
      result.current.handleSaveExpense(
        {
          merchant: "Test",
          amount: "100",
          category: "Other",
          wallet: "archived_maya",
          date: "2026-09-20",
        },
        vi.fn(),
        vi.fn(),
        onError
      );
    });

    expect(mockCommitter).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("is archived")
    );
    expect(data.wallets.archived_maya).toBe(5000);
  });

  it("refunds to archived wallet when deleting an expense", () => {
    let state = createTestData();
    state.settings = {
      ...state.settings,
      archivedWallets: [{ id: "old_wallet", label: "Old Wallet", color: "text-gray-400" }],
    };
    state.wallets.old_wallet = 200;

    const expense: Expense = {
      id: "exp-archived-refund",
      merchant: "Old Shop",
      amount: 300,
      deductedAmount: 300,
      category: "Shopping",
      wallet: "old_wallet",
      date: "2026-09-01",
    };
    state.library.expenses = [expense];

    vi.stubGlobal("confirm", vi.fn(() => true));

    const commitExpenseTransition = vi.fn(transition => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });

    const { result } = renderHook(() =>
      useExpenseActions({
        globalData: state,
        commitExpenseTransition,
        showToast: vi.fn(),
      })
    );

    act(() => {
      result.current.handleDeleteExpense(expense);
    });

    expect(commitExpenseTransition).toHaveBeenCalledTimes(1);
    expect(state.wallets.old_wallet).toBe(500);
    expect(state.library.expenses).toHaveLength(0);
  });
});
