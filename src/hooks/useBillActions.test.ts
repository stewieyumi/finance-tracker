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
  it("marks an unpaid bill as paid and deducts its amount from the routed wallet", () => {
    const mockSetGlobalData = vi.fn();
    const mockShowToast = vi.fn();
    const initialData = createTestData();
    const bill = createBill();

    const { result } = renderHook(() =>
      useBillActions({
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

  it("unmarks a paid bill and refunds its amount to the routed wallet", () => {
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

    expect(nextData.wallets.maya).toBe(5000);
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
