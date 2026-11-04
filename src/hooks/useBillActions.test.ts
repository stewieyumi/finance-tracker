import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBillActions } from "./useBillActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData, BillViewModel } from "../types/finance";

const createTestData = (): UnifiedFinanceData => ({
  ...INITIAL_UNIFIED_DATA,
  wallets: {
    ...INITIAL_UNIFIED_DATA.wallets,
    maya: 5000,
    gcash: 5000
  },
  logs: {}
});

const createBill = (
  overrides: Partial<BillViewModel> = {}
): BillViewModel => ({
  id: "bill-test-1",
  name: "Test Loan",
  amount: 1000,
  dueDay: "15",
  type: "Loan / Installment",
  wallet: "maya",
  startMonth: "August 2026",
  endMonth: "October 2026",
  paid: false,
  targetMonthForDue: "September 2026",
  daysLeft: 10,
  isOverridden: false,
  baseAmount: 1000,
  ...overrides
});

const getStateUpdaterResult = (
  setter: ReturnType<typeof vi.fn>,
  previous: UnifiedFinanceData
): UnifiedFinanceData => {
  const updater = setter.mock.calls[setter.mock.calls.length - 1][0];

  if (typeof updater !== "function") {
    throw new Error("Expected setGlobalData to receive a state updater.");
  }

  return updater(previous);
};

describe("useBillActions - payment mutations", () => {
  it("confirms only selected, elapsed installments without moving wallets", () => {
    const data = createTestData();
    const bill = createBill({ startMonth: "August 2020", endMonth: "December 2020" });
    data.library = { ...data.library, bills: [bill] };
    const setter = vi.fn();
    const { result } = renderHook(() => useBillActions({
      globalData: data, setGlobalData: setter, selectedMonth: "September 2020", showToast: vi.fn(),
    }));
    act(() => result.current.confirmPriorBillPayments(bill.id, ["August 2020", "October 2020", "October 2020", "January 2021"]));

    const confirmed = getStateUpdaterResult(setter, data);
    expect(confirmed.wallets).toBe(data.wallets);
    expect(Object.keys(confirmed.logs)).toEqual(["August 2020", "October 2020"]);
    expect(confirmed.logs["October 2020"].billSettlements?.[bill.id]).toEqual([
      expect.objectContaining({ priorConfirmation: true, wallet: null, walletDebit: 0 }),
    ]);
    expect(confirmed.logs["October 2020"].paymentDates).toBeUndefined();
    expect(getStateUpdaterResult(setter, confirmed)).toBe(confirmed);
  });

  it("marks an unpaid bill as paid and deducts its amount from the routed wallet", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();
    const bill = createBill();

    const { result } = renderHook(() =>
      useBillActions({
        globalData: createTestData(),
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    const nextData = getStateUpdaterResult(mockSetGlobalData, initialData);
    const monthLog = nextData.logs["September 2026"];

    expect(nextData.wallets.maya).toBe(4000);
    expect(monthLog.billsPaid).toContain("bill-test-1");
    expect(monthLog.paymentDates?.["bill-test-1"]).toBeDefined();
    expect(
      new Date(monthLog.paymentDates!["bill-test-1"]).toString()
    ).not.toBe("Invalid Date");
  });

  it("ignores repeated paid actions and rechecks the latest wallet balance", () => {
    const initialData = createTestData();
    const setGlobalData = vi.fn();
    const { result } = renderHook(() => useBillActions({
      globalData: initialData,
      setGlobalData,
      selectedMonth: "September 2026",
      showToast: vi.fn(),
    }));

    act(() => {
      result.current.toggleBillStatus(createBill());
    });

    const paid = getStateUpdaterResult(setGlobalData, initialData);
    expect(paid.wallets.maya).toBe(4000);
    expect(getStateUpdaterResult(setGlobalData, paid)).toBe(paid);

    const depleted = { ...initialData, wallets: { ...initialData.wallets, maya: 500 } };
    expect(getStateUpdaterResult(setGlobalData, depleted)).toBe(depleted);
  });

  it("redoes an undone payment only when its original wallet can cover the exact debit", () => {
    const bill = createBill();
    let state = createTestData();
    state.library = { ...state.library, bills: [bill] };
    const showToast = vi.fn();
    const { result } = renderHook(() => useBillActions({
      globalData: state,
      setGlobalData: updater => { state = typeof updater === "function" ? updater(state) : updater; },
      selectedMonth: "September 2026",
      showToast,
    }));

    act(() => result.current.toggleBillStatus(bill));
    const undo = showToast.mock.lastCall?.[1];
    act(() => undo.onClick());
    const redo = showToast.mock.lastCall?.[1];
    expect(redo.label).toBe("Redo");
    expect(redo.paymentId).toBe(undo.paymentId);

    state = { ...state, wallets: { ...state.wallets, maya: 500 } };
    const insufficientState = state;
    act(() => redo.onClick());
    expect(state).toBe(insufficientState);

    state = {
      ...state,
      wallets: { ...state.wallets, maya: 5000 },
      library: { ...state.library, bills: [{ ...bill, wallet: "gcash" }] },
    };
    act(() => redo.onClick());
    act(() => redo.onClick());
    expect(state.wallets.maya).toBe(4000);
    expect(state.wallets.gcash).toBe(5000);
    const month = state.logs["September 2026"];
    expect(month.billsPaid).toEqual([bill.id]);
    expect(month.billSettlements?.[bill.id]).toEqual([
      expect.objectContaining({ id: undo.paymentId, wallet: "maya", walletDebit: 1000, reversedAt: undefined }),
    ]);
  });

  it("Undoing a newly paid bill reverses both wallet and ledger state", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();
    const bill = createBill();
    let state = initialData;
    mockSetGlobalData.mockImplementation(updater => { state = updater(state); });

    const { result } = renderHook(() =>
      useBillActions({
        globalData: createTestData(),
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    const undoAction = mockShowToast.mock.calls[0][1] as {
      label: string;
      onClick: () => void;
    };

    expect(undoAction.label).toBe("Undo");

    const paidData = state;

    expect(paidData.wallets.maya).toBe(4000);
    expect(paidData.logs["September 2026"].billsPaid).toContain(
      "bill-test-1"
    );

    act(() => {
      undoAction.onClick();
    });

    const undoneData = getStateUpdaterResult(mockSetGlobalData, paidData);
    const monthLog = undoneData.logs["September 2026"];

    expect(undoneData.wallets.maya).toBe(5000);
    expect(monthLog.billsPaid).not.toContain("bill-test-1");
    expect(monthLog.paymentDates?.["bill-test-1"]).toBeUndefined();
  });

  it.each([false, true])("reverses only the recorded wallet debit (skip debit: %s)", skipDebit => {
    const initialData = createTestData();
    const setGlobalData = vi.fn();
    const { result } = renderHook(() => useBillActions({
      globalData: initialData, setGlobalData, selectedMonth: "September 2026", showToast: vi.fn(),
    }));

    act(() => { result.current.toggleBillStatus(createBill(), skipDebit); });
    const paid = getStateUpdaterResult(setGlobalData, initialData);
    expect(paid.wallets.maya).toBe(skipDebit ? 5000 : 4000);

    act(() => {
      result.current.toggleBillStatus(createBill({ paid: true, wallet: "gcash", amount: 2000 }));
    });
    const reversed = getStateUpdaterResult(setGlobalData, paid);
    expect(reversed.wallets).toEqual(initialData.wallets);
    expect(reversed.logs["September 2026"].billSettlements?.["bill-test-1"]).toEqual([
      expect.objectContaining({
        amount: 1000, wallet: skipDebit ? null : "maya", walletDebit: skipDebit ? 0 : 1000,
        reversedAt: expect.any(String),
      }),
    ]);
    expect(getStateUpdaterResult(setGlobalData, reversed)).toBe(reversed);
  });

  it("unmarks a legacy paid bill without inventing a wallet refund", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();

    initialData.wallets.maya = 4000;
    initialData.logs["September 2026"] = {
      billsPaid: ["bill-test-1"],
      recsCollected: {},
      paymentDates: {
        "bill-test-1": "2026-09-10T12:00:00.000Z"
      }
    };

    const bill = createBill({ paid: true });

    const { result } = renderHook(() =>
      useBillActions({
        globalData: createTestData(),
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    const nextData = getStateUpdaterResult(mockSetGlobalData, initialData);
    const monthLog = nextData.logs["September 2026"];

    expect(nextData.wallets.maya).toBe(4000);
    expect(monthLog.billsPaid).not.toContain("bill-test-1");
    expect(monthLog.paymentDates?.["bill-test-1"]).toBeUndefined();
  });

  it("changes payment state without changing the wallet when skipWalletMutation is true", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();
    const bill = createBill();

    const { result } = renderHook(() =>
      useBillActions({
        globalData: createTestData(),
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill, true);
    });

    const nextData = getStateUpdaterResult(mockSetGlobalData, initialData);
    const monthLog = nextData.logs["September 2026"];

    expect(nextData.wallets.maya).toBe(5000);
    expect(monthLog.billsPaid).toContain("bill-test-1");
    expect(monthLog.paymentDates?.["bill-test-1"]).toBeDefined();
  });

  it("uses targetMonthForDue instead of selectedMonth when recording payment", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();

    const bill = createBill({
      targetMonthForDue: "August 2026"
    });

    const { result } = renderHook(() =>
      useBillActions({
        globalData: createTestData(),
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    const nextData = getStateUpdaterResult(mockSetGlobalData, initialData);

    expect(nextData.logs["August 2026"].billsPaid).toContain("bill-test-1");
    expect(nextData.logs["September 2026"]).toBeUndefined();
    expect(nextData.wallets.maya).toBe(4000);
  });

  it("rejects a bill payment when the routed wallet cannot cover the full amount", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const initialData = createTestData();
    initialData.wallets.maya = 500;

    const hookData = createTestData();
    hookData.wallets.maya = 500;

    const bill = createBill({
      amount: 1000
    });

    const { result } = renderHook(() =>
      useBillActions({
        globalData: hookData,
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    expect(mockSetGlobalData).not.toHaveBeenCalled();
    expect(initialData.wallets.maya).toBe(500);
    expect(mockShowToast).toHaveBeenCalledWith(
      "Insufficient balance in maya. Need ₱1,000"
    );
  });

  it("allows a bill payment when the wallet has exactly enough balance", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();

    const initialData = createTestData();
    initialData.wallets.maya = 1000;

    const hookData = createTestData();
    hookData.wallets.maya = 1000;

    const bill = createBill({
      amount: 1000
    });

    const { result } = renderHook(() =>
      useBillActions({
        globalData: hookData,
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    const nextData = getStateUpdaterResult(mockSetGlobalData, initialData);
    const monthLog = nextData.logs["September 2026"];

    expect(nextData.wallets.maya).toBe(0);
    expect(monthLog.billsPaid).toContain("bill-test-1");
    expect(monthLog.paymentDates?.["bill-test-1"]).toBeDefined();
  });

  it("uses the legacy bill-name mapping when no wallet is explicitly set", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();
    const initialGcash = initialData.wallets.gcash || 0;

    const bill = createBill({
      id: "unobank-test",
      name: "Unobank",
      wallet: undefined
    });

    const { result } = renderHook(() =>
      useBillActions({
        globalData: createTestData(),
        setGlobalData: mockSetGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleBillStatus(bill);
    });

    const nextData = getStateUpdaterResult(mockSetGlobalData, initialData);

    expect(nextData.wallets.gcash).toBe(
      initialGcash - bill.amount
    );
    expect(nextData.wallets.maya).toBe(5000);
    expect(nextData.logs["September 2026"].billsPaid).toContain(
      "unobank-test"
    );
  });
});
