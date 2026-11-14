import React from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaydayActions } from "./usePaydayActions";
import { UnifiedFinanceData } from "../types/finance";

const confirmMock = vi.fn();

vi.stubGlobal("confirm", confirmMock);

const baseData: UnifiedFinanceData = {
  wallets: {
    bills: 1000,
    savings: 500,
  },
  logs: {},
  paydaySplitExecutions: [],
  settings: {
    walletLabels: {
      bills: "Bills",
      savings: "Savings",
    },
    customWallets: [
      { id: "bills", label: "Bills", color: "text-blue-400" },
      { id: "savings", label: "Savings", color: "text-emerald-400" },
    ],
  },
  library: {
    bills: [],
    receivables: [],
    shoots: [],
  },
  updatedAt: 0,
} as UnifiedFinanceData;

const paydayAllocations = {
  bills: 300,
  savings: 200,
};

const billPaydayAllocations = [
  {
    id: "bill-1",
    month: "2026-09",
    wallet: "bills",
    amount: 300,
  },
];

function useTestPaydayActions(
  overrides: Partial<Parameters<typeof usePaydayActions>[0]> = {},
  initialData: UnifiedFinanceData = baseData
) {
  const [globalData, setGlobalData] =
    React.useState<UnifiedFinanceData>(structuredClone(initialData));

  const showToast = React.useMemo(() => vi.fn(), []);
  const paydaySplitInProgressRef = React.useRef(false);

  const actions = usePaydayActions({
    globalData,
    setGlobalData,
    paydayAllocations,
    billPaydayAllocations,
    remainingBuffer: 0,
    isViewingCurrentMonth: true,
    selectedMonth: "2026-09",
    showToast,
    paydaySplitInProgressRef,
    ...overrides,
  });

  return {
    ...actions,
    globalData,
    showToast,
  };
}

describe("usePaydayActions", () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockReturnValue(true);
  });

  it("executes payday allocation into wallets", () => {
    const { result } = renderHook(() => useTestPaydayActions());

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    expect(result.current.globalData.wallets.bills).toBe(1300);
    expect(result.current.globalData.wallets.savings).toBe(700);
  });

  it("records bill payday contributions", () => {
    const { result } = renderHook(() => useTestPaydayActions());

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    expect(
      result.current.globalData.logs["2026-09"]?.billPaydayContributions?.[
        "bill-1"
      ]
    ).toBe(300);
  });

  it("creates a payday execution record", () => {
    const { result } = renderHook(() => useTestPaydayActions());

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    expect(result.current.globalData.paydaySplitExecutions).toHaveLength(1);

    const execution = result.current.globalData.paydaySplitExecutions?.[0];

    expect(execution).toBeDefined();
    expect(typeof execution).not.toBe("string");

    if (!execution || typeof execution === "string") {
      throw new Error("Expected a payday execution.");
    }

    expect(execution.allocations).toEqual(paydayAllocations);
    expect(execution.billContributions).toEqual(billPaydayAllocations);
  });

  it("rejects a duplicate payday execution on the same date", () => {
    const { result } = renderHook(() => useTestPaydayActions());

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    confirmMock.mockClear();

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(result.current.showToast).toHaveBeenCalledWith(
      "⚠️ Payday split already executed today."
    );
    expect(result.current.globalData.paydaySplitExecutions).toHaveLength(1);
  });

  it("undoes wallet allocations and bill contributions", () => {
    const { result } = renderHook(() => useTestPaydayActions());

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    const execution = result.current.globalData.paydaySplitExecutions?.[0];

    expect(typeof execution).not.toBe("string");

    if (typeof execution === "string" || !execution) {
      throw new Error("Expected a payday execution.");
    }

    act(() => {
      result.current.handleUndoPaydaySplit(execution.id);
    });

    expect(result.current.globalData.wallets.bills).toBe(1000);
    expect(result.current.globalData.wallets.savings).toBe(500);
    expect(
      result.current.globalData.logs["2026-09"]?.billPaydayContributions?.[
        "bill-1"
      ]
    ).toBe(0);
    expect(result.current.globalData.paydaySplitExecutions).toHaveLength(0);
  });

  it("does not undo legacy string executions", () => {
    const { result } = renderHook(() =>
      useTestPaydayActions(
        {},
        {
          ...structuredClone(baseData),
          paydaySplitExecutions: ["2026-09-20"],
        }
      )
    );

    act(() => {
      result.current.handleUndoPaydaySplit("legacy-id");
    });

    expect(result.current.globalData.paydaySplitExecutions).toEqual([
      "2026-09-20",
    ]);
    expect(result.current.showToast).toHaveBeenCalledWith(
      "Cannot undo a legacy execution."
    );
  });

  it("rejects payday distribution when an allocation targets an archived wallet and commits nothing", () => {
    const dataWithArchived: UnifiedFinanceData = {
      ...structuredClone(baseData),
      settings: {
        ...baseData.settings,
        archivedWallets: [{ id: "bills", label: "Archived Bills", color: "text-gray-400" }],
        customWallets: [{ id: "savings", label: "Savings", color: "text-emerald-400" }],
      },
    };

    const mockCommitter = vi.fn(transition => transition(dataWithArchived));
    const showToast = vi.fn();
    const paydaySplitInProgressRef = { current: false };

    const { result } = renderHook(() =>
      usePaydayActions({
        globalData: dataWithArchived,
        commitPaydayTransition: mockCommitter,
        paydayAllocations: { bills: 500, savings: 200 },
        billPaydayAllocations: [],
        remainingBuffer: 0,
        isViewingCurrentMonth: true,
        selectedMonth: "2026-09",
        showToast,
        paydaySplitInProgressRef,
      })
    );

    act(() => {
      result.current.handleExecutePaydaySplit();
    });

    expect(mockCommitter).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("is archived")
    );
    expect(dataWithArchived.wallets.bills).toBe(1000);
    expect(dataWithArchived.wallets.savings).toBe(500);
  });

  it("reverses payday execution from an archived wallet using exact original wallet ID when balance is sufficient", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataWithArchivedExecution: UnifiedFinanceData = {
      ...structuredClone(baseData),
      wallets: { old_archived: 800, savings: 500 },
      settings: {
        ...baseData.settings,
        defaultWallet: "savings",
        archivedWallets: [{ id: "old_archived", label: "Old Wallet", color: "text-gray-400" }],
        customWallets: [{ id: "savings", label: "Savings", color: "text-emerald-400" }],
      },
      paydaySplitExecutions: [
        {
          id: "exec-archived",
          timestamp: 1757900000000,
          date: "2026-09-15",
          allocations: { old_archived: 500, savings: 200 },
          billContributions: [],
        },
      ],
    };

    let state = dataWithArchivedExecution;
    const commitPaydayTransition = vi.fn(transition => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      usePaydayActions({
        globalData: state,
        commitPaydayTransition,
        paydayAllocations: {},
        billPaydayAllocations: [],
        remainingBuffer: 0,
        isViewingCurrentMonth: true,
        selectedMonth: "2026-09",
        showToast,
        paydaySplitInProgressRef: { current: false },
      })
    );

    act(() => {
      result.current.handleUndoPaydaySplit("exec-archived");
    });

    expect(commitPaydayTransition).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("Payday distribution reversed.");
    expect(state.wallets.old_archived).toBe(300);
    expect(state.wallets.savings).toBe(300);
    expect(state.paydaySplitExecutions).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  it("rejects reversing payday when archived wallet balance is absent (treated as zero for positive debit)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataWithAbsentWallet: UnifiedFinanceData = {
      ...structuredClone(baseData),
      wallets: { savings: 500 }, // old_archived is absent
      logs: {
        "2026-09": {
          billPaydayContributions: { "bill-1": 300 },
        },
      },
      paydaySplitExecutions: [
        {
          id: "exec-absent",
          timestamp: 1757900000000,
          date: "2026-09-15",
          allocations: { old_archived: 300 },
          billContributions: [{ id: "bill-1", month: "2026-09", amount: 300 }],
        },
      ],
    };

    let state = dataWithAbsentWallet;
    const commitPaydayTransition = vi.fn(transition => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      usePaydayActions({
        globalData: state,
        commitPaydayTransition,
        paydayAllocations: {},
        billPaydayAllocations: [],
        remainingBuffer: 0,
        isViewingCurrentMonth: true,
        selectedMonth: "2026-09",
        showToast,
        paydaySplitInProgressRef: { current: false },
      })
    );

    act(() => {
      result.current.handleUndoPaydaySplit("exec-absent");
    });

    expect(commitPaydayTransition).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("insufficient balance in account \"old_archived\""));
    expect(state.paydaySplitExecutions).toHaveLength(1);
    expect(state.logs["2026-09"].billPaydayContributions?.["bill-1"]).toBe(300);
    expect(state.wallets.old_archived).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it("rejects reversing payday when a wallet balance is invalid (NaN or malformed)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataWithInvalidBalance: UnifiedFinanceData = {
      ...structuredClone(baseData),
      wallets: { bills: NaN as any, savings: 500 },
      paydaySplitExecutions: [
        {
          id: "exec-invalid",
          timestamp: 1757900000000,
          date: "2026-09-15",
          allocations: { bills: 100 },
          billContributions: [],
        },
      ],
    };

    let state = dataWithInvalidBalance;
    const commitPaydayTransition = vi.fn(transition => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      usePaydayActions({
        globalData: state,
        commitPaydayTransition,
        paydayAllocations: {},
        billPaydayAllocations: [],
        remainingBuffer: 0,
        isViewingCurrentMonth: true,
        selectedMonth: "2026-09",
        showToast,
        paydaySplitInProgressRef: { current: false },
      })
    );

    act(() => {
      result.current.handleUndoPaydaySplit("exec-invalid");
    });

    expect(commitPaydayTransition).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("has an invalid balance"));
    expect(state.paydaySplitExecutions).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it("rejects operation atomically if any one allocation cannot be reversed, leaving all wallets and execution unchanged", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataAtomic: UnifiedFinanceData = {
      ...structuredClone(baseData),
      wallets: { walletA: 200, walletB: 100 }, // walletA has enough for 100, walletB does NOT have enough for 500
      paydaySplitExecutions: [
        {
          id: "exec-atomic",
          timestamp: 1757900000000,
          date: "2026-09-15",
          allocations: { walletA: 100, walletB: 500 },
          billContributions: [],
        },
      ],
    };

    let state = dataAtomic;
    const commitPaydayTransition = vi.fn(transition => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      usePaydayActions({
        globalData: state,
        commitPaydayTransition,
        paydayAllocations: {},
        billPaydayAllocations: [],
        remainingBuffer: 0,
        isViewingCurrentMonth: true,
        selectedMonth: "2026-09",
        showToast,
        paydaySplitInProgressRef: { current: false },
      })
    );

    act(() => {
      result.current.handleUndoPaydaySplit("exec-atomic");
    });

    expect(commitPaydayTransition).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("insufficient balance in account \"walletB\""));
    expect(state.wallets.walletA).toBe(200); // Must NOT be decremented to 100
    expect(state.wallets.walletB).toBe(100);
    expect(state.paydaySplitExecutions).toHaveLength(1);
    confirmSpy.mockRestore();
  });
});
