import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReceivableSaveActions, ReceivableTransitionResult } from "./useReceivableSaveActions";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";
import { Deduction, EditFormData, UnifiedFinanceData } from "../types/finance";

const createTestData = (): UnifiedFinanceData => ({
  ...INITIAL_UNIFIED_DATA,
  library: {
    ...INITIAL_UNIFIED_DATA.library,
    receivables: [
      {
        id: "rec-test-1",
        name: "Test Receivable",
        amount: 10000,
        category: "Other",
        frequency: "Monthly",
        wallet: "maya",
        monthlyDay: 15,
        startMonth: "August 2026",
      },
    ],
  },
  logs: {
    "September 2026": {
      recsCollected: {
        "rec-test-1": {
          amountReceived: 8000,
          collected: false,
        },
      },
    },
  },
});

const createStateHarness = (initialData: UnifiedFinanceData) => {
  let state = initialData;

  const commitReceivableTransition = vi.fn(
    (transition: (prev: UnifiedFinanceData) => ReceivableTransitionResult) => {
      const result = transition(state);
      if (result.ok) {
        state = result.data;
      }
      return result;
    }
  );

  return {
    commitReceivableTransition,
    get state() {
      return state;
    },
  };
};

const createEditForm = (
  overrides: Partial<EditFormData> = {}
): EditFormData => ({
  name: "Test Receivable",
  amount: 7000,
  category: "Other",
  wallet: "maya",
  frequency: "Monthly",
  monthlyDay: 15,
  startMonth: "August 2026",
  ...overrides,
});

describe("useReceivableSaveActions - persistence and financial safety", () => {
  it("persists grossAmount, deductions, and calculated net amount while preserving existing collection records", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const deductions: Deduction[] = [
      { id: "d1", name: "Fixed Platform Fee", type: "fixed", value: 3000 },
    ];

    const editForm = createEditForm({
      grossAmount: 25000,
      deductions,
      // Note: amount does not even need to be pre-calculated by caller;
      // useReceivableSaveActions derives NET from grossAmount and deductions
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-test-1"
    );

    const collection =
      harness.state.logs["September 2026"]?.recsCollected?.["rec-test-1"];

    // 1. Persisted values match expected net and metadata
    expect(receivable?.grossAmount).toBe(25000);
    expect(receivable?.amount).toBe(22000);
    expect(receivable?.deductions).toEqual([
      { id: "d1", name: "Fixed Platform Fee", type: "fixed", value: 3000 },
    ]);

    // 2. Collection records remain strictly untouched
    expect(collection?.amountReceived).toBe(8000);
    expect(collection?.collected).toBe(false);

    // 3. Object / reference mutation safety: mutating editForm after save does not mutate state
    deductions[0].value = 99999;
    expect(receivable?.deductions?.[0]?.value).toBe(3000);

    // 4. Modal closing & toast
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(showToast).toHaveBeenCalledWith("Default saved in Library");
  });

  it("persists percentage deductions correctly calculating net amount", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      grossAmount: 25000,
      deductions: [
        { id: "d1", name: "Withholding Tax", type: "percentage", value: 10 },
      ],
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-test-1"
    );

    // 25000 - 10% (2500) = 22500
    expect(receivable?.grossAmount).toBe(25000);
    expect(receivable?.amount).toBe(22500);
    expect(receivable?.deductions).toEqual([
      { id: "d1", name: "Withholding Tax", type: "percentage", value: 10 },
    ]);
  });

  it("legacy receivable without gross/deductions continues to save with existing amount without reinterpretation", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      amount: 10000,
      grossAmount: undefined,
      deductions: undefined,
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-test-1"
    );

    expect(receivable?.amount).toBe(10000);
    expect(receivable?.grossAmount).toBeUndefined();
    expect(receivable?.deductions).toBeUndefined();
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(showToast).toHaveBeenCalledWith("Default saved in Library");
  });

  it("updates the receivable amount without changing the existing collection log", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm: createEditForm(),
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-test-1"
    );

    const collection =
      harness.state.logs["September 2026"]?.recsCollected?.["rec-test-1"];

    expect(receivable?.amount).toBe(7000);
    expect(collection?.amountReceived).toBe(8000);
    expect(collection?.collected).toBe(false);
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(showToast).toHaveBeenCalledWith("Default saved in Library");
  });

  it("rejects a non-positive edited amount", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm: createEditForm({ amount: 0 }),
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-test-1"
    );

    expect(receivable?.amount).toBe(10000);
    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Amount must be greater than 0"
    );
  });

  it("rejects when deductions reduce net amount to zero or less", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      grossAmount: 10000,
      deductions: [
        { id: "d1", name: "Excessive Deduction", type: "fixed", value: 15000 },
      ],
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-test-1"
    );

    // Unchanged
    expect(receivable?.amount).toBe(10000);
    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Amount must be greater than 0");
  });

  it("allows changing scheduled date for By Date inflows with no payment history", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-by-date-unpaid",
            name: "Unpaid Project",
            amount: 5000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {},
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Unpaid Project",
      amount: 5000,
      frequency: "By Date",
      date: "2026-09-10",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-by-date-unpaid",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-by-date-unpaid"
    );
    expect(receivable?.date).toBe("2026-09-10");
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(showToast).toHaveBeenCalledWith("Default saved in Library");
    expect(harness.state.logs).toEqual({});
  });

  it("rejects changing scheduled date for fully collected By Date inflow with receipt history", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-by-date-1",
            name: "By Date Inflow",
            amount: 5000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-by-date-1": {
              amountReceived: 5000,
              collected: true,
            },
          },
          receivableSettlements: {
            "rec-by-date-1": [
              {
                id: "receipt-aug-1",
                amount: 5000,
                wallet: "maya",
                walletCredit: 5000,
                receivedAt: "2026-08-15T12:00:00.000Z",
              },
            ],
          },
          paymentDates: {
            "rec-by-date-1": "2026-08-15T12:00:00.000Z",
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "By Date Inflow",
      amount: 5000,
      frequency: "By Date",
      date: "2026-09-10",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-by-date-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );

    // Date was NOT changed
    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-by-date-1"
    );
    expect(receivable?.date).toBe("2026-08-15");

    // Original August 2026 logs remain completely intact and untouched
    const augCollection =
      harness.state.logs["August 2026"]?.recsCollected?.["rec-by-date-1"];
    expect(augCollection).toEqual({
      amountReceived: 5000,
      collected: true,
    });

    const augSettlements =
      harness.state.logs["August 2026"]?.receivableSettlements?.["rec-by-date-1"];
    expect(augSettlements).toHaveLength(1);
    expect(augSettlements?.[0]?.id).toBe("receipt-aug-1");
    expect(augSettlements?.[0]?.receivedAt).toBe("2026-08-15T12:00:00.000Z");

    const augPaymentDate =
      harness.state.logs["August 2026"]?.paymentDates?.["rec-by-date-1"];
    expect(augPaymentDate).toBe("2026-08-15T12:00:00.000Z");

    // No logs created in September 2026
    expect(harness.state.logs["September 2026"]).toBeUndefined();
  });

  it("rejects changing scheduled date for partially collected By Date inflow with receipt history", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-by-date-partial",
            name: "Partial Inflow",
            amount: 5000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-by-date-partial": {
              amountReceived: 2000,
              collected: false,
            },
          },
          receivableSettlements: {
            "rec-by-date-partial": [
              {
                id: "receipt-partial-1",
                amount: 2000,
                wallet: "maya",
                walletCredit: 2000,
                receivedAt: "2026-08-15T12:00:00.000Z",
              },
            ],
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Partial Inflow",
      amount: 5000,
      frequency: "By Date",
      date: "2026-09-10",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-by-date-partial",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );

    const receivable = harness.state.library.receivables.find(
      item => item.id === "rec-by-date-partial"
    );
    expect(receivable?.date).toBe("2026-08-15");

    // Original August 2026 logs remain completely intact
    const augCollection =
      harness.state.logs["August 2026"]?.recsCollected?.["rec-by-date-partial"];
    expect(augCollection?.amountReceived).toBe(2000);
    expect(augCollection?.collected).toBe(false);

    expect(harness.state.logs["September 2026"]).toBeUndefined();
  });

  it("rejects changing frequency from fully collected By Date to Monthly", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-by-date-settled",
            name: "Settled By Date",
            amount: 5000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-by-date-settled": {
              amountReceived: 5000,
              collected: true,
            },
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Settled By Date",
      amount: 5000,
      frequency: "Monthly",
      monthlyDay: 15,
      date: "2026-08-15",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-by-date-settled",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );
    expect(harness.state.library.receivables[0].frequency).toBe("By Date");
    expect(harness.state).toEqual(initialData);
  });

  it("rejects changing frequency from fully collected By Date to Bi-monthly", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-by-date-settled",
            name: "Settled By Date",
            amount: 5000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-by-date-settled": {
              amountReceived: 5000,
              collected: true,
            },
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Settled By Date",
      amount: 5000,
      frequency: "Bi-monthly",
      biMonthlyDays: [15, 30],
      date: "2026-08-15",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-by-date-settled",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );
    expect(harness.state.library.receivables[0].frequency).toBe("By Date");
    expect(harness.state).toEqual(initialData);
  });

  it("rejects changing frequency from partially collected By Date to Monthly", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-partial",
            name: "Partial Inflow",
            amount: 10000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-partial": {
              amountReceived: 4000,
              collected: false,
            },
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Partial Inflow",
      amount: 10000,
      frequency: "Monthly",
      monthlyDay: 15,
      date: "2026-08-15",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-partial",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );
    expect(harness.state.library.receivables[0].frequency).toBe("By Date");
    expect(harness.state).toEqual(initialData);
  });

  it("rejects changing the date of an inflow with reversed receipt history", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-reversed",
            name: "Reversed Project",
            amount: 6000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-reversed": {
              amountReceived: 0,
              collected: false,
            },
          },
          receivableSettlements: {
            "rec-reversed": [
              {
                id: "receipt-old-1",
                amount: 6000,
                wallet: "maya",
                walletCredit: 6000,
                receivedAt: "2026-08-15T10:00:00.000Z",
                reversedAt: "2026-08-16T10:00:00.000Z",
              },
            ],
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Reversed Project",
      amount: 6000,
      frequency: "By Date",
      date: "2026-09-20",
      wallet: "maya",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-reversed",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );
    expect(harness.state.library.receivables[0].date).toBe("2026-08-15");
    expect(harness.state).toEqual(initialData);
  });

  it("allows changing name, category, and wallet of a collected By Date inflow when date and frequency remain unchanged", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-collected-rename",
            name: "Original Name",
            amount: 5000,
            category: "Other",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-collected-rename": {
              amountReceived: 5000,
              collected: true,
            },
          },
          receivableSettlements: {
            "rec-collected-rename": [
              {
                id: "receipt-rename-1",
                amount: 5000,
                wallet: "maya",
                walletCredit: 5000,
                receivedAt: "2026-08-15T12:00:00.000Z",
              },
            ],
          },
        },
      },
    };

    const harness = createStateHarness(initialData);
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Updated Name",
      amount: 5000,
      category: "Shoot",
      wallet: "gcash",
      frequency: "By Date",
      date: "2026-08-15", // date unchanged
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-collected-rename",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(showToast).toHaveBeenCalledWith("Default saved in Library");

    const updated = harness.state.library.receivables.find(r => r.id === "rec-collected-rename");
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.category).toBe("Shoot");
    expect(updated?.wallet).toBe("gcash");
    expect(updated?.date).toBe("2026-08-15");
    expect(updated?.frequency).toBe("By Date");

    // Logs and receipt history preserved intact
    expect(harness.state.logs["August 2026"]).toEqual(initialData.logs["August 2026"]);
  });

  it("deferred or repeated updater evaluation cannot produce false success or duplicate side effects", () => {
    const initialData: UnifiedFinanceData = {
      ...createTestData(),
      library: {
        ...createTestData().library,
        receivables: [
          {
            id: "rec-settled-replay",
            name: "Settled Inflow",
            amount: 5000,
            category: "Shoot",
            frequency: "By Date",
            date: "2026-08-15",
            wallet: "maya",
          },
        ],
      },
      logs: {
        "August 2026": {
          recsCollected: {
            "rec-settled-replay": {
              amountReceived: 5000,
              collected: true,
            },
          },
        },
      },
    };

    let transitionFn: ((prev: UnifiedFinanceData) => ReceivableTransitionResult) | null = null;
    const deferredCommitter = vi.fn(
      (transition: (prev: UnifiedFinanceData) => ReceivableTransitionResult) => {
        transitionFn = transition;
        // Simulate React StrictMode double invocation of updater
        const firstEvaluation = transition(initialData);
        const secondEvaluation = transition(initialData);
        expect(firstEvaluation).toEqual(secondEvaluation);
        return secondEvaluation;
      }
    );

    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Settled Inflow",
      amount: 5000,
      frequency: "By Date",
      date: "2026-09-10", // date change on settled inflow
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: deferredCommitter,
        editingId: "rec-settled-replay",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      const saved = result.current.saveReceivableEdit();
      expect(saved).toBe(false);
    });

    // Committer ran with double evaluation
    expect(deferredCommitter).toHaveBeenCalledTimes(1);

    // Modal was NOT closed, success toast was NOT fired
    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "This inflow has recorded receipt history. Its scheduled date or frequency cannot be changed."
    );

    // Pure transition function can be called again without side effects or mutating original data
    expect(transitionFn).not.toBeNull();
    const thirdEvaluation = transitionFn!(initialData);
    expect(thirdEvaluation.ok).toBe(false);
    expect(thirdEvaluation.data).toBe(initialData);
  });

  it("rejects saving By Date inflow when date is missing or invalid", () => {
    const harness = createStateHarness(createTestData());
    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      frequency: "By Date",
      date: "",
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: harness.commitReceivableTransition,
        editingId: "rec-test-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      result.current.saveReceivableEdit();
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Please enter a valid date for this inflow."
    );
  });

  it("rejects saving when the authoritative committer returns a failure", () => {
    const initialData = createTestData();
    const failingCommitter = vi.fn(() => ({
      ok: false as const,
      error: "Authoritative sync transition committer is not ready.",
      data: initialData,
    }));

    const setEditingId = vi.fn();
    const showToast = vi.fn();

    const editForm = createEditForm({
      name: "Updated Name",
      amount: 5000,
    });

    const { result } = renderHook(() =>
      useReceivableSaveActions({
        commitReceivableTransition: failingCommitter,
        editingId: "rec-test-1",
        editForm,
        setEditingId,
        showToast,
      })
    );

    act(() => {
      const saved = result.current.saveReceivableEdit();
      expect(saved).toBe(false);
    });

    expect(setEditingId).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Authoritative sync transition committer is not ready."
    );
  });
});
