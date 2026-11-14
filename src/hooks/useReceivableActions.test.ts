import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReceivableActions } from "./useReceivableActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { UnifiedFinanceData, ReceivableViewModel } from "../types/finance";

const createTestData = (): UnifiedFinanceData => ({
  ...INITIAL_UNIFIED_DATA,
  settings: {
    ...INITIAL_UNIFIED_DATA.settings,
    customWallets: [
      ...(INITIAL_UNIFIED_DATA.settings?.customWallets || []),
      { id: "maya", label: "maya", color: "text-emerald-400" },
      { id: "gcash", label: "gcash", color: "text-blue-400" },
    ],
  },
  wallets: {
    ...INITIAL_UNIFIED_DATA.wallets,
    maya: 5000,
    gcash: 5000
  },
  library: { ...INITIAL_UNIFIED_DATA.library, receivables: [createReceivable()] },
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
  startMonth: "September 2026",
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
  it("undoes and redoes only the latest payday receipt in its original wallet", () => {
    const initial = createTestData();
    const rec = createReceivable({ frequency: "Bi-monthly", biMonthlyDays: [5, 20] });
    initial.library = { ...initial.library, receivables: [rec] };
    const harness = createStateHarness(initial);
    const showToast = vi.fn<(message: string, action?: { label: string; onClick: () => void }) => void>();
    const { result } = renderHook(() => useReceivableActions({
      globalData: harness.state, setGlobalData: harness.setGlobalData,
      selectedMonth: "September 2026", showToast,
    }));

    act(() => result.current.addPayment(rec, 1000, 5));
    const firstUndo = showToast.mock.lastCall?.[1];
    const partial = { ...rec, amountReceived: 500 };
    act(() => result.current.addPayment(partial, 1000, 5));
    expect(harness.state.wallets.maya).toBe(5500);
    act(() => result.current.addPayment(partial, 1000, 20));
    const latestUndo = showToast.mock.lastCall?.[1];
    const month = () => harness.state.logs["September 2026"];
    const receipts = () => month().receivableSettlements?.[rec.id] ?? [];
    expect(month().recsCollected?.[rec.id]).toEqual({ amountReceived: 1000, collected: true });
    expect(receipts().map(entry => [entry.paydayDay, entry.amount])).toEqual([[5, 500], [20, 500]]);
    expect(receipts()[0].id).not.toBe(receipts()[1].id);

    act(() => firstUndo?.onClick());
    expect(harness.state.wallets.maya).toBe(6000);

    act(() => harness.setGlobalData(prev => ({
      ...prev,
      library: { ...prev.library, receivables: [{ ...rec, wallet: "gcash" }] },
      wallets: { ...prev.wallets, maya: 100 },
    })));
    expect(latestUndo?.label).toBe("Undo");
    act(() => latestUndo?.onClick());
    expect(harness.state.wallets.maya).toBe(100);
    expect(receipts()[1].reversedAt).toBeUndefined();

    act(() => harness.setGlobalData(prev => ({
      ...prev, wallets: { ...prev.wallets, maya: 6000 },
    })));
    act(() => latestUndo?.onClick());
    expect(month().recsCollected?.[rec.id]).toEqual({ amountReceived: 500, collected: false });
    expect(receipts()[0].reversedAt).toBeUndefined();
    expect(receipts()[1].reversedAt).toBeDefined();
    expect(harness.state.wallets.maya).toBe(5500);
    expect(harness.state.wallets.gcash).toBe(5000);

    const redo = showToast.mock.lastCall?.[1];
    expect(redo?.label).toBe("Redo");
    act(() => redo?.onClick());
    act(() => redo?.onClick());
    expect(month().recsCollected?.[rec.id]).toEqual({ amountReceived: 1000, collected: true });
    expect(receipts().filter(entry => !entry.reversedAt)).toHaveLength(2);
    expect(harness.state.wallets.maya).toBe(6000);
    expect(harness.state.wallets.gcash).toBe(5000);
  });

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
      result.current.addPayment({ ...receivable, amountReceived: 800 }, 500);
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets.maya).toBe(6000);
    expect(record?.amountReceived).toBe(1000);
    expect(record?.collected).toBe(true);
  });

  it("ignores repeated partial payments and status toggles from the same rendered occurrence", () => {
    const harness = createStateHarness(createTestData());
    const receivable = createReceivable();
    const { result } = renderHook(() => useReceivableActions({
      globalData: harness.state, setGlobalData: harness.setGlobalData,
      selectedMonth: "September 2026", showToast: vi.fn(),
    }));

    act(() => {
      result.current.addPayment(receivable, 400);
      result.current.addPayment(receivable, 400);
      result.current.toggleReceivableStatus(receivable);
    });
    expect(harness.state.wallets.maya).toBe(5400);
    expect(harness.state.logs["September 2026"].receivableSettlements?.[receivable.id]).toHaveLength(1);

    const partial = { ...receivable, amountReceived: 400 };
    act(() => {
      result.current.toggleReceivableStatus(partial);
      result.current.toggleReceivableStatus(partial);
    });
    expect(harness.state.wallets.maya).toBe(5000);
    expect(harness.state.logs["September 2026"].recsCollected?.[receivable.id]?.amountReceived).toBe(0);
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
      result.current.toggleReceivableStatus({ ...receivable, amountReceived: 1000, collected: true });
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
      harness.setGlobalData(prev => ({
        ...prev, library: { ...prev.library, receivables: [{ ...receivable, wallet: "gcash" }] },
      }));
      result.current.addPayment({ ...receivable, wallet: "gcash", amountReceived: 400 }, 100);
    });

    expect(harness.state.wallets.maya).toBe(5400);

    act(() => {
      result.current.toggleReceivableStatus({ ...receivable, wallet: "gcash", amount: 2000, amountReceived: 500 });
    });

    const record =
      harness.state.logs["September 2026"].recsCollected?.["rec-test-1"];

    expect(harness.state.wallets).toEqual(createTestData().wallets);
    expect(harness.state.logs["September 2026"].receivableSettlements?.["rec-test-1"]).toEqual([
      expect.objectContaining({ wallet: "maya", walletCredit: 400, reversedAt: expect.any(String) }),
      expect.objectContaining({ wallet: "gcash", walletCredit: 100, reversedAt: expect.any(String) }),
    ]);
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
          },
          receivableSettlements: {
            "rec-test-1": [{
              receivedAt: "2026-09-15T00:00:00.000Z", wallet: "maya", amount: 1000, walletCredit: 1000
            }]
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

    expect(mockShowToast).toHaveBeenCalledWith("Reversal blocked: an original wallet is unavailable or has insufficient funds.");
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
          },
          receivableSettlements: {
            "rec-test-1": [{
              receivedAt: "2026-09-15T00:00:00.000Z", wallet: "maya", amount: 1000, walletCredit: 1000
            }]
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
          },
          receivableSettlements: {
            "rec-test-1": [{
              receivedAt: "2026-09-15T00:00:00.000Z", wallet: "maya", amount: 400, walletCredit: 400
            }]
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

    expect(mockShowToast).toHaveBeenCalledWith("Receipt reversed.");
    expect(harness.state.wallets.maya).toBe(0);
    expect(record?.collected).toBe(false);
    expect(record?.amountReceived).toBe(0);
  });

  it("rejects adding a By Date inflow when date is missing or invalid", () => {
    const harness = createStateHarness(createTestData());
    const mockShowToast = vi.fn();

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: harness.state,
        setGlobalData: harness.setGlobalData,
        selectedMonth: "September 2026",
        showToast: mockShowToast,
      })
    );

    act(() => {
      result.current.addReceivable({
        name: "Missing Date Inflow",
        amount: 5000,
        category: "Shoot",
        frequency: "By Date",
        date: "",
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      "Please enter a valid date for this inflow."
    );
    expect(
      harness.state.library.receivables.find(r => r.name === "Missing Date Inflow")
    ).toBeUndefined();
  });

  it("rejects collecting a receivable when target wallet is archived and commits nothing", () => {
    const data = createTestData();
    data.settings = {
      ...data.settings,
      archivedWallets: [{ id: "archived_maya", label: "Archived Maya", color: "text-gray-400" }],
    };
    const rec = createReceivable({ wallet: "archived_maya" });
    data.library = { ...data.library, receivables: [rec] };
    const mockCommitter = vi.fn((transition) => {
      const res = transition(data);
      return res;
    });
    const mockShowToast = vi.fn();

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: data,
        commitReceivableTransition: mockCommitter,
        selectedMonth: "September 2026",
        showToast: mockShowToast,
      })
    );

    act(() => {
      result.current.toggleReceivableStatus(rec);
    });

    expect(mockCommitter).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining("is archived")
    );
    expect(data.wallets.archived_maya).toBeUndefined();
  });

  it("reverses a receipt originally credited to an archived wallet as long as funds are sufficient", () => {
    let state = createTestData();
    state.settings = {
      ...state.settings,
      archivedWallets: [{ id: "old_wallet", label: "Old Wallet", color: "text-gray-400" }],
    };
    state.wallets.old_wallet = 1500;

    const rec = createReceivable({
      id: "rec-archived-rev",
      wallet: "old_wallet",
      amountReceived: 1000,
      collected: true,
    });
    state.logs["September 2026"] = {
      recsCollected: {
        "rec-archived-rev": { amountReceived: 1000, collected: true },
      },
      receivableSettlements: {
        "rec-archived-rev": [
          {
            id: "settle-rec-1",
            receivedAt: "2026-09-01T00:00:00.000Z",
            amount: 1000,
            wallet: "old_wallet",
            walletCredit: 1000,
          },
        ],
      },
    };

    const commitReceivableTransition = vi.fn((transition) => {
      const res = transition(state);
      if (res.ok) state = res.data;
      return res;
    });

    const { result } = renderHook(() =>
      useReceivableActions({
        globalData: state,
        commitReceivableTransition,
        selectedMonth: "September 2026",
        showToast: vi.fn(),
      })
    );

    act(() => {
      result.current.toggleReceivableStatus(rec);
    });

    expect(commitReceivableTransition).toHaveBeenCalledTimes(1);
    expect(state.wallets.old_wallet).toBe(500);
    expect(state.logs["September 2026"].recsCollected?.["rec-archived-rev"]?.amountReceived).toBe(0);
    expect(state.logs["September 2026"].recsCollected?.["rec-archived-rev"]?.collected).toBe(false);
  });
});
