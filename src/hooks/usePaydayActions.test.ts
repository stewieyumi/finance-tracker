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
});
