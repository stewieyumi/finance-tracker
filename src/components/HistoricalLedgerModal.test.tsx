import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HistoricalLedgerModal } from "./HistoricalLedgerModal";
import type { UnifiedFinanceData } from "../types/finance";

const makeData = (overrides: Partial<UnifiedFinanceData> = {}): UnifiedFinanceData => ({
  wallets: {
    maribank: 0,
    gcash: 1000,
    maya: 1000,
    gotyme: 0,
    bpi: 0,
    cash: 0,
  },
  library: {
    bills: [],
    receivables: [],
    shoots: [],
    manualTransactions: [],
  },
  logs: {},
  settings: {
    defaultWallet: "maya",
    customWallets: [
      { id: "maya", label: "Maya" },
      { id: "gcash", label: "GCash" },
    ],
  } as any,
  ...overrides,
});

const renderModal = (
  globalData: UnifiedFinanceData,
  setGlobalData = vi.fn()
) => {
  render(
    <HistoricalLedgerModal
      isOpen
      onClose={vi.fn()}
      globalData={globalData}
      setGlobalData={setGlobalData}
      showToast={vi.fn()}
    />
  );

  return setGlobalData;
};

const applyUpdate = (
  setGlobalData: ReturnType<typeof vi.fn>,
  data: UnifiedFinanceData
) => {
  const updater = setGlobalData.mock.calls.at(-1)?.[0];
  expect(updater).toEqual(expect.any(Function));
  return updater(data);
};

describe("HistoricalLedgerModal wallet mutations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("adds income to the selected wallet", () => {
    const data = makeData();
    const setGlobalData = renderModal(data);

    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.click(screen.getByRole("button", { name: /income/i }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "250" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Backdated Salary, Bank Transfer/i),
      { target: { value: "Test Income" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const next = applyUpdate(setGlobalData, data);

    expect(next.wallets.maya).toBe(1250);
    expect(next.library.manualTransactions).toHaveLength(1);
    expect(next.library.manualTransactions?.[0].type).toBe("income");
  });

  it("subtracts expense from the selected wallet", () => {
    const data = makeData();
    const setGlobalData = renderModal(data);

    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.click(screen.getByRole("button", { name: /expense/i }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "250" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Backdated Salary, Bank Transfer/i),
      { target: { value: "Test Expense" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const next = applyUpdate(setGlobalData, data);

    expect(next.wallets.maya).toBe(750);
    expect(next.library.manualTransactions).toHaveLength(1);
    expect(next.library.manualTransactions?.[0].type).toBe("expense");
  });

  it("moves money from the source wallet to the destination wallet", () => {
    const data = makeData();
    const setGlobalData = renderModal(data);

    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.click(screen.getByRole("button", { name: /transfer/i }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "300" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Backdated Salary, Bank Transfer/i),
      { target: { value: "Test Transfer" } }
    );
    const walletSelects = screen.getAllByRole("combobox");
    fireEvent.change(walletSelects[1], {
      target: { value: "gcash" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const next = applyUpdate(setGlobalData, data);

    expect(next.wallets.maya).toBe(700);
    expect(next.wallets.gcash).toBe(1300);
    expect(next.library.manualTransactions?.[0].type).toBe("transfer");
  });

  it("reverses the old wallet effect before applying an edited transaction", () => {
    const data = makeData({
      wallets: {
        maribank: 0,
        gcash: 1000,
        maya: 900,
        gotyme: 0,
        bpi: 0,
        cash: 0,
      },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-1",
            title: "Old Expense",
            amount: 100,
            type: "expense",
            date: "2026-09-20",
            wallet: "maya",
            category: "Other",
            note: "",
            createdAt: 1758362400000,
          },
        ],
      },
    });

    const setGlobalData = renderModal(data);
    const card = screen.getByText("Old Expense").closest("div.bg-surface");
    const editButton = card?.querySelectorAll("button")[0];

    expect(editButton).toBeTruthy();
    fireEvent.click(editButton!);

    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update/i }));

    const next = applyUpdate(setGlobalData, data);

    expect(next.wallets.maya).toBe(750);
    expect(next.library.manualTransactions).toHaveLength(1);
    expect(next.library.manualTransactions?.[0].amount).toBe(250);
  });

  it("reverses a transaction's wallet effect when deleted", () => {
    const data = makeData({
      wallets: {
        maribank: 0,
        gcash: 1000,
        maya: 750,
        gotyme: 0,
        bpi: 0,
        cash: 0,
      },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-1",
            title: "Old Expense",
            amount: 250,
            type: "expense",
            date: "2026-09-20",
            wallet: "maya",
            category: "Other",
            note: "",
            createdAt: 1758362400000,
          },
        ],
      },
    });

    vi.stubGlobal("confirm", vi.fn(() => true));

    const setGlobalData = renderModal(data);
    const card = screen.getByText("Old Expense").closest("div.bg-surface");
    const deleteButton = card?.querySelectorAll("button")[1];

    expect(deleteButton).toBeTruthy();
    fireEvent.click(deleteButton!);

    const next = applyUpdate(setGlobalData, data);

    expect(next.wallets.maya).toBe(1000);
    expect(next.library.manualTransactions).toHaveLength(0);
  });
});
