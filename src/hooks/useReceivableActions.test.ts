import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReceivableActions } from "./useReceivableActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData, ReceivableViewModel } from "../types/finance";

const createTestData = (): UnifiedFinanceData => ({
  ...INITIAL_UNIFIED_DATA,
  wallets: {
    ...INITIAL_UNIFIED_DATA.wallets,
    maya: 5000,
    gcash: 5000
  },
  logs: {}
});

const createReceivable = (
  overrides: Partial<ReceivableViewModel> = {}
): ReceivableViewModel => ({
  id: "rec-test-1",
  name: "Test Receivable",
  amount: 1000,
  category: "Other",
  frequency: "Monthly",
  wallet: "maya",
  startMonth: "August 2026",
  amountReceived: 0,
  collected: false,
  targetMonthForDue: "September 2026",
  ...overrides
});

const createStateHarness = (initialData: UnifiedFinanceData) => {
  let state = initialData;

  const setGlobalData = vi.fn(
    (
      action:
        | UnifiedFinanceData
        | ((previous: UnifiedFinanceData) => UnifiedFinanceData)
    ) => {
      state =
        typeof action === "function"
          ? action(state)
          : action;
    }
  );

  return {
    setGlobalData,
    get state() {
      return state;
    }
  };
};

describe("useReceivableActions - payment mutations", () => {
  it("adds a partial payment to the routed wallet", () => {
    const harness = createStateHarness(createTestData());
    const mockShowToast = vi.fn();
    const receivable = createReceivable();

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.addPayment(receivable, 400);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(5400);
    expect(record?.amountReceived).toBe(400);
    expect(record?.collected).toBe(false);
  });

  it("caps a payment at the remaining receivable amount", () => {
    const harness = createStateHarness(createTestData());
    const mockShowToast = vi.fn();
    const receivable = createReceivable();

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.addPayment(receivable, 800);
    });

    act(() => {
      result.current.addPayment(receivable, 500);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(6000);
    expect(record?.amountReceived).toBe(1000);
    expect(record?.collected).toBe(true);
  });

  it("undoes a full receivable payment by refunding the wallet", () => {
    const harness = createStateHarness(createTestData());
    const mockShowToast = vi.fn();
    const receivable = createReceivable();

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.addPayment(receivable, 1000);
    });

    expect(harness.state.wallets.maya).toBe(6000);

    act(() => {
      result.current.toggleReceivableStatus(receivable);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(5000);
    expect(record?.amountReceived).toBe(0);
    expect(record?.collected).toBe(false);
  });

  it("undoes a partial receivable payment by refunding only the recorded amount", () => {
    const harness = createStateHarness(createTestData());
    const mockShowToast = vi.fn();
    const receivable = createReceivable();

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.addPayment(receivable, 400);
    });

    expect(harness.state.wallets.maya).toBe(5400);

    act(() => {
      result.current.toggleReceivableStatus(receivable);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(5000);
    expect(record?.amountReceived).toBe(0);
    expect(record?.collected).toBe(false);
  });

  it("rejects uncollecting a receivable when the wallet has insufficient funds", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      wallets: {
        ...createTestData().wallets,
        maya: 500
      },
      logs: {
        "September 2026": {
          billsPaid: [],
          recsCollected: {
            "rec-test-1": { amountReceived: 1000, collected: true }
          }
        }
      }
    };

    const harness = createStateHarness(initialData);
    const mockShowToast = vi.fn();
    const receivable = createReceivable({
      amountReceived: 1000,
      collected: true
    });

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleReceivableStatus(receivable);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(mockShowToast).toHaveBeenCalledWith(
      "Insufficient balance in maya. Need ₱1,000 to reverse."
    );
    expect(harness.state.wallets.maya).toBe(500);
    expect(record?.amountReceived).toBe(1000);
    expect(record?.collected).toBe(true);
  });

  it("allows uncollecting a receivable when the wallet has sufficient funds", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      wallets: {
        ...createTestData().wallets,
        maya: 1500
      },
      logs: {
        "September 2026": {
          billsPaid: [],
          recsCollected: {
            "rec-test-1": { amountReceived: 1000, collected: true }
          }
        }
      }
    };

    const harness = createStateHarness(initialData);
    const mockShowToast = vi.fn();
    const receivable = createReceivable({
      amountReceived: 1000,
      collected: true
    });

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleReceivableStatus(receivable);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(500);
    expect(record?.amountReceived).toBe(0);
    expect(record?.collected).toBe(false);
  });

  it("checks only the actual collected amount for partial payments", () => {
    // Receivable total is ₱1,000, but only ₱400 was collected.
    // Wallet has ₱500, which cannot cover ₱1,000 but CAN cover the ₱400 reversal.
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      wallets: {
        ...createTestData().wallets,
        maya: 500
      },
      logs: {
        "September 2026": {
          billsPaid: [],
          recsCollected: {
            "rec-test-1": { amountReceived: 400, collected: false }
          }
        }
      }
    };

    const harness = createStateHarness(initialData);
    const mockShowToast = vi.fn();
    const receivable = createReceivable({
      amount: 1000,
      amountReceived: 400,
      collected: false
    });

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleReceivableStatus(receivable);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(100);
    expect(record?.amountReceived).toBe(0);
    expect(record?.collected).toBe(false);
  });

  it("allows zero-amount receivables to toggle status regardless of wallet balance", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      wallets: {
        ...createTestData().wallets,
        maya: 0
      },
      logs: {
        "September 2026": {
          billsPaid: [],
          recsCollected: {
            "rec-test-zero": { amountReceived: 0, collected: true }
          }
        }
      }
    };

    const harness = createStateHarness(initialData);
    const mockShowToast = vi.fn();
    const receivable = createReceivable({
      id: "rec-test-zero",
      amount: 0,
      amountReceived: 0,
      collected: true
    });

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast
      })
    );

    act(() => {
      result.current.toggleReceivableStatus(receivable);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-zero"];

    expect(mockShowToast).not.toHaveBeenCalled();
    expect(harness.state.wallets.maya).toBe(0);
    expect(record?.collected).toBe(false);
    expect(record?.amountReceived).toBe(0);
  });
});
