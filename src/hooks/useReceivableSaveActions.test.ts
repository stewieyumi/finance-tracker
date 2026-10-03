import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReceivableSaveActions } from "./useReceivableSaveActions";
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
        setGlobalData: harness.setGlobalData,
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
        setGlobalData: harness.setGlobalData,
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
        setGlobalData: harness.setGlobalData,
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
        setGlobalData: harness.setGlobalData,
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
        setGlobalData: harness.setGlobalData,
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
        setGlobalData: harness.setGlobalData,
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
});
