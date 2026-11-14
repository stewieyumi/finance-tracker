import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  HistoricalLedgerModal,
  LedgerTransitionCommitter,
  LedgerTransitionResult,
  applyLedgerDelete,
  applyLedgerSave,
  createLedgerDeleteUpdater,
  createLedgerSaveUpdater,
} from "./HistoricalLedgerModal";
import { useCloudSync } from "../hooks/useCloudSync";
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

const makeSetGlobalData = (initialData: UnifiedFinanceData = makeData()) => {
  let current = initialData;
  return vi.fn((transition: (prev: UnifiedFinanceData) => LedgerTransitionResult) => {
    const result = transition(current);
    if (result.ok) {
      current = result.data;
    }
    return result;
  }) as unknown as ReturnType<typeof vi.fn> & LedgerTransitionCommitter;
};

const renderModal = (
  globalData: UnifiedFinanceData,
  commitLedgerTransition = makeSetGlobalData(globalData)
) => {
  render(
    <HistoricalLedgerModal
      isOpen
      onClose={vi.fn()}
      globalData={globalData}
      commitLedgerTransition={commitLedgerTransition}
      showToast={vi.fn()}
    />
  );

  return commitLedgerTransition;
};

const applyUpdate = (
  commitSpy: ReturnType<typeof vi.fn>,
  data: UnifiedFinanceData
) => {
  const transition = commitSpy.mock.calls.at(-1)?.[0] as
    | ((prev: UnifiedFinanceData) => LedgerTransitionResult | UnifiedFinanceData)
    | undefined;
  expect(transition).toEqual(expect.any(Function));
  const output = transition!(data);
  if (output && typeof output === "object" && "ok" in output && "data" in output) {
    return (output as LedgerTransitionResult).data;
  }
  return output as UnifiedFinanceData;
};

describe("Wallets Transfer entry", () => {
  it.each([
    ["configured pair", { transferFromWallet: "gcash", transferToWallet: "maya" }, "gcash", "maya"],
    ["missing source", { transferFromWallet: "removed", transferToWallet: "gcash" }, "maya", "gcash"],
    ["missing destination", { transferFromWallet: "gcash", transferToWallet: "removed" }, "gcash", ""],
    ["same wallet", { transferFromWallet: "gcash", transferToWallet: "gcash" }, "gcash", ""],
    ["destination matches fallback source", { transferFromWallet: "removed", transferToWallet: "maya" }, "maya", ""],
  ])("prefills %s without moving money", (_name, defaults, from, to) => {
    const data = makeData();
    data.settings = { ...data.settings, ...defaults };
    const setGlobalData = makeSetGlobalData(data);
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={vi.fn()}
      globalData={data} commitLedgerTransition={setGlobalData} showToast={vi.fn()} />);
    expect(screen.getByLabelText("From")).toHaveValue(from);
    expect(screen.getByLabelText("To")).toHaveValue(to);
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("lets a transfer override both defaults without changing the saved preferences", () => {
    const data = makeData();
    data.settings = { ...data.settings, transferFromWallet: "gcash", transferToWallet: "maya" };
    const setGlobalData = makeSetGlobalData(data);
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={vi.fn()}
      globalData={data} commitLedgerTransition={setGlobalData} showToast={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "maya" } });
    expect(screen.getByLabelText("To")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "125.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    const next = applyUpdate(setGlobalData, data);
    expect(next.wallets.maya).toBe(874.75);
    expect(next.wallets.gcash).toBe(1125.25);
    expect(next.library.manualTransactions).toHaveLength(1);
    expect(next.settings).toBe(data.settings);
  });

  it("shows only Amount, From, and To, then records one transfer with the local date", () => {
    vi.stubEnv("TZ", "Asia/Manila");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T16:30:00Z"));
    try {
      const data = makeData();
      const setGlobalData = makeSetGlobalData(data);
      const onClose = vi.fn();
      render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={onClose}
        globalData={data} commitLedgerTransition={setGlobalData} showToast={vi.fn()} />);
      expect(screen.getByRole("dialog", { name: "Transfer" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Transfer" })).toBeInTheDocument();
      expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
      expect(screen.getByLabelText("From")).toHaveValue("maya");
      expect(screen.getByLabelText("To")).toHaveValue("");
      expect(setGlobalData).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "300" } });
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "gcash" } });
      fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(setGlobalData).toHaveBeenCalledOnce();
      const next: UnifiedFinanceData = applyUpdate(setGlobalData, data);
      expect(next.wallets.maya).toBe(700);
      expect(next.wallets.gcash).toBe(1300);
      expect(Object.values(next.wallets).reduce((sum, amount) => sum + amount, 0)).toBe(2000);
      expect(next.library.manualTransactions).toHaveLength(1);
      expect(next.library.manualTransactions?.[0]).toMatchObject({
        title: "Transfer", type: "transfer", wallet: "maya", destinationWallet: "gcash", amount: 300,
        date: "2026-11-07", postingMode: "wallet", createdAt: Date.now(),
      });
      expect(next.library.expenses).toBe(data.library.expenses);
      expect(next.logs).toBe(data.logs);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("excludes the source from destinations and clears To if From changes to that wallet", () => {
    const data = makeData();
    data.settings = { ...data.settings, defaultWallet: "missing-wallet" };
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={vi.fn()}
      globalData={data} commitLedgerTransition={makeSetGlobalData(data)} showToast={vi.fn()} />);
    expect(screen.getByLabelText("From")).toHaveValue("maya");
    const to = screen.getByLabelText("To");
    expect(to.querySelector('option[value="maya"]')).toBeNull();
    fireEvent.change(to, { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "gcash" } });
    expect(to).toHaveValue("");
    expect(to.querySelector('option[value="gcash"]')).toBeNull();
  });

  it("shows current balances below both selectors and updates them as wallets or data change", () => {
    const data = makeData();
    data.wallets.gcash = 450.25;
    const setGlobalData = makeSetGlobalData(data);
    const props = { isOpen: true, initialType: 'transfer' as const, onClose: vi.fn(),
      globalData: data, commitLedgerTransition: setGlobalData, showToast: vi.fn() };
    const { rerender } = render(<HistoricalLedgerModal {...props} />);
    expect(screen.getByLabelText("From")).toHaveAccessibleDescription("Balance: ₱1,000.00");
    expect(screen.getByLabelText("To")).toHaveAccessibleDescription("Balance: —");
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "gcash" } });
    expect(screen.getByLabelText("To")).toHaveAccessibleDescription("Balance: ₱450.25");
    rerender(<HistoricalLedgerModal {...props} globalData={{ ...data, wallets: { ...data.wallets, maya: 900 } }} />);
    expect(screen.getByLabelText("From")).toHaveAccessibleDescription("Balance: ₱900.00");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "gcash" } });
    expect(screen.getByLabelText("From")).toHaveAccessibleDescription("Balance: ₱450.25");
    expect(screen.getByLabelText("To")).toHaveAccessibleDescription("Balance: —");
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("cancels a transfer draft without changing financial data", () => {
    const onClose = vi.fn();
    const setGlobalData = makeSetGlobalData();
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={onClose}
      globalData={makeData()} commitLedgerTransition={setGlobalData} showToast={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(setGlobalData).not.toHaveBeenCalled();
  });
});

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

  it("records a history-only entry without changing wallets", () => {
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
    fireEvent.click(screen.getByRole("checkbox", { name: /update wallet balances/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    const next = applyUpdate(setGlobalData, data);

    expect(next.wallets).toEqual(data.wallets);
    expect(next.library.manualTransactions).toHaveLength(1);
    expect(next.library.manualTransactions?.[0]).toMatchObject({ type: "income", postingMode: "history-only" });
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

  it.each(["wallet", "history-only"] as const)("deletes a %s transaction with the appropriate wallet effect", postingMode => {
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
            postingMode,
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

    expect(next.wallets.maya).toBe(postingMode === "wallet" ? 1000 : 750);
    expect(next.library.manualTransactions).toHaveLength(0);
  });
});

describe("HistoricalLedgerModal modal shell behavior", () => {
  it("renders with dialog accessibility, and dismisses on Escape and backdrop click", () => {
    const data = makeData();
    const onClose = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={onClose}
        globalData={data}
        commitLedgerTransition={makeSetGlobalData(data)}
        showToast={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Historical Ledger");

    // Escape dismissal
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Backdrop dismissal
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Phase A — Ledger financial guardrails, stale-state safety, and local dates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a compact Wallets Transfer that exceeds the source wallet balance and keeps the draft open", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
    });
    const setGlobalData = makeSetGlobalData(data);
    const onClose = vi.fn();
    const showToast = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        initialType="transfer"
        onClose={onClose}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={showToast}
      />
    );

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Amount")).toHaveValue(10000);
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance/i);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/insufficient balance/i));
    expect(showToast).not.toHaveBeenCalledWith("Transaction recorded");
  });

  it("rejects a wallet-posted ledger expense over balance atomically", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 200, gotyme: 0, bpi: 0, cash: 0 },
    });
    const setGlobalData = makeSetGlobalData(data);
    const showToast = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Overspend" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(screen.getByLabelText(/title \/ description/i)).toHaveValue("Overspend");
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance/i);
    expect(showToast).not.toHaveBeenCalledWith("Transaction recorded");
  });

  it("allows exact-balance transfers and expenses, bringing the source wallet to 0 and conserving transfer totals", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 250, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
    });
    const setGlobalData = makeSetGlobalData(data);

    const { unmount } = render(
      <HistoricalLedgerModal
        isOpen
        initialType="transfer"
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    const afterTransfer = applyUpdate(setGlobalData, data);
    expect(afterTransfer.wallets.maya).toBe(0);
    expect(afterTransfer.wallets.gcash).toBe(750);

    unmount();
    setGlobalData.mockClear();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={afterTransfer}
        commitLedgerTransition={setGlobalData}
        showToast={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Exact Expense" } });
    fireEvent.change(screen.getByLabelText("Wallet"), { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "750" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const afterExpense = applyUpdate(setGlobalData, afterTransfer);
    expect(afterExpense.wallets.gcash).toBe(0);
  });

  it("filters out the source wallet in full ledger transfer mode and rejects same-wallet transfers even if bypassed", () => {
    const data = makeData();
    const setGlobalData = makeSetGlobalData(data);
    const showToast = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.click(screen.getByRole("button", { name: /^transfer$/i }));

    const fromSelect = screen.getByLabelText("From Wallet");
    const toSelect = screen.getByLabelText("To Wallet");
    expect(fromSelect).toHaveValue("maya");
    expect(toSelect.querySelector('option[value="maya"]')).toBeNull();

    // Bypass option filtering by appending a synthetic duplicate option
    const duplicateOption = document.createElement("option");
    duplicateOption.value = "maya";
    toSelect.appendChild(duplicateOption);
    fireEvent.change(toSelect, { target: { value: "maya" } });
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Self Transfer" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(screen.getByRole("alert")).toHaveTextContent(/different destination wallet/i);
    expect(showToast).not.toHaveBeenCalledWith("Transaction recorded");
  });

  it("evaluates edited expenses using net balance after restoring the original expense effect", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 50, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-exp-100",
            title: "Groceries",
            amount: 100,
            type: "expense",
            date: "2026-10-10",
            wallet: "maya",
            createdAt: 1760000000000,
            postingMode: "wallet",
          },
        ],
      },
    });
    const setGlobalData = makeSetGlobalData(data);
    const showToast = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={showToast}
      />
    );

    const card = screen.getByText("Groceries").closest("div.bg-surface")!;
    fireEvent.click(card.querySelectorAll("button")[0]!);

    // Editing 100 -> 160 exceeds 50 + 100 = 150 available -> rejected
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "160" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance/i);
    expect(showToast).not.toHaveBeenCalledWith("Transaction updated");

    // Editing 100 -> 120 fits within 50 + 100 = 150 -> accepted, final balance 30
    setGlobalData.mockClear();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(setGlobalData).toHaveBeenCalledOnce();
    const next = applyUpdate(setGlobalData, data);
    expect(next.wallets.maya).toBe(30);
    expect(next.library.manualTransactions).toHaveLength(1);
    expect(next.library.manualTransactions?.[0]).toMatchObject({
      id: "tx-exp-100",
      amount: 120,
      date: "2026-10-10",
      createdAt: 1760000000000,
    });
  });

  it("allows reducing a posted income when final balance stays non-negative, but blocks deleting, moving, or reducing it below zero", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 20, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-inc-100",
            title: "Client Payout",
            amount: 100,
            type: "income",
            date: "2026-10-12",
            wallet: "maya",
            createdAt: 1760100000000,
            postingMode: "wallet",
          },
        ],
      },
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const setGlobalData = makeSetGlobalData(data);
    const showToast = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={showToast}
      />
    );

    // Deleting the 100 income when balance is 20 would produce -80 -> rejected
    const card = screen.getByText("Client Payout").closest("div.bg-surface")!;
    fireEvent.click(card.querySelectorAll("button")[1]!);
    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/insufficient balance/i));
    expect(showToast).not.toHaveBeenCalledWith("Transaction deleted");

    // Moving the 100 income from maya (20) to gcash (1000) would leave maya at -80 -> rejected atomically
    setGlobalData.mockClear();
    fireEvent.click(card.querySelectorAll("button")[0]!);
    fireEvent.change(screen.getByLabelText("Wallet"), { target: { value: "gcash" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance/i);

    // Editing 100 -> 90 on maya when balance is 20 leaves final net balance 10 (temporary -80 must not block) -> accepted
    setGlobalData.mockClear();
    fireEvent.change(screen.getByLabelText("Wallet"), { target: { value: "maya" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(setGlobalData).toHaveBeenCalledOnce();
    const next = applyUpdate(setGlobalData, data);
    expect(next.wallets.maya).toBe(10);
    expect(next.library.manualTransactions?.[0].amount).toBe(90);
  });

  it("validates all affected wallets across 2, 3, and 4 wallets when deleting, reducing, or rerouting a transfer", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 100, maya: 700, gotyme: 0, bpi: 500, cash: 500 },
      settings: {
        defaultWallet: "maya",
        customWallets: [
          { id: "maya", label: "Maya" },
          { id: "gcash", label: "GCash" },
          { id: "bpi", label: "BPI" },
          { id: "cash", label: "Cash" },
        ],
      } as any,
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-tr-300",
            title: "Top-up GCash",
            amount: 300,
            type: "transfer",
            date: "2026-10-15",
            wallet: "maya",
            destinationWallet: "gcash",
            createdAt: 1760200000000,
            postingMode: "wallet",
          },
        ],
      },
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const setGlobalData = makeSetGlobalData(data);
    const showToast = vi.fn();

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={showToast}
      />
    );

    const card = screen.getByText("Top-up GCash").closest("div.bg-surface")!;
    // Delete transfer when destination (gcash) only has 100 left -> rejected atomically
    fireEvent.click(card.querySelectorAll("button")[1]!);
    expect(applyUpdate(setGlobalData, data)).toBe(data);
    expect(showToast).not.toHaveBeenCalledWith("Transaction deleted");

    // Edit transfer: reduce 300 -> 150 (debits gcash by 150 > 100) -> rejected
    setGlobalData.mockClear();
    fireEvent.click(card.querySelectorAll("button")[0]!);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(applyUpdate(setGlobalData, data)).toBe(data);

    // Edit transfer: reroute destination to bpi (reverses 300 from gcash > 100) -> rejected
    setGlobalData.mockClear();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("To Wallet"), { target: { value: "bpi" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(applyUpdate(setGlobalData, data)).toBe(data);

    // 3-wallet combined debit check: old transfer maya -> gcash (300), edited to gcash -> bpi (100)
    // Even if gcash had 350 (>= 300 and >= 100 individually), combined delta on gcash is -300 - 100 = -400 -> rejected!
    const threeWalletData = { ...data, wallets: { ...data.wallets, gcash: 350 } };
    const threeWalletRejected = applyLedgerSave(threeWalletData, {
      id: "tx-tr-300",
      editingId: "tx-tr-300",
      expectedOldTx: data.library.manualTransactions?.[0],
      title: "Top-up GCash",
      amount: "100",
      type: "transfer",
      date: "2026-10-15",
      wallet: "gcash",
      destinationWallet: "bpi",
      updateWallets: true,
    });
    expect(threeWalletRejected.ok).toBe(false);
    expect(threeWalletRejected.data).toBe(threeWalletData);

    // 4-wallet edit check: maya -> gcash (300) edited to bpi -> cash (600) where gcash has 300 (ok) but bpi only has 500 -> rejected atomically!
    const fourWalletData = { ...data, wallets: { ...data.wallets, gcash: 300, bpi: 500 } };
    const fourWalletRejected = applyLedgerSave(fourWalletData, {
      id: "tx-tr-300",
      editingId: "tx-tr-300",
      expectedOldTx: data.library.manualTransactions?.[0],
      title: "Reroute 4 Wallets",
      amount: "600",
      type: "transfer",
      date: "2026-10-15",
      wallet: "bpi",
      destinationWallet: "cash",
      updateWallets: true,
    });
    expect(fourWalletRejected.ok).toBe(false);
    expect(fourWalletRejected.data).toBe(fourWalletData);

    // Now restore destination to gcash, change source to bpi, and amount to 250:
    // Net deltas: maya +300 (1000), gcash -300 + 250 = -50 (50 >= 0), bpi -250 (250 >= 0) -> accepted!
    setGlobalData.mockClear();
    fireEvent.change(screen.getByLabelText("From Wallet"), { target: { value: "bpi" } });
    fireEvent.change(screen.getByLabelText("To Wallet"), { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(setGlobalData).toHaveBeenCalledOnce();
    const next = applyUpdate(setGlobalData, data);
    expect(next.wallets.maya).toBe(1000);
    expect(next.wallets.gcash).toBe(50);
    expect(next.wallets.bpi).toBe(250);
    expect(next.library.manualTransactions?.[0]).toMatchObject({
      id: "tx-tr-300",
      wallet: "bpi",
      destinationWallet: "gcash",
      amount: 250,
    });
  });

  it("handles history-only create, edit mode transitions, and delete accurately", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 20, gotyme: 0, bpi: 0, cash: 0 },
    });
    const setGlobalData = makeSetGlobalData(data);

    const { unmount } = render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={vi.fn()}
      />
    );

    // History-only expense of 5000 on wallet with 20 balance -> allowed and leaves wallets unchanged
    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Historical Rent" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /update wallet balances/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const withHistoryOnly = applyUpdate(setGlobalData, data);
    expect(withHistoryOnly.wallets.maya).toBe(20);
    expect(withHistoryOnly.library.manualTransactions?.[0].postingMode).toBe("history-only");

    unmount();
    const secondSetter = makeSetGlobalData(withHistoryOnly);

    // Editing a history-only expense (5000) to wallet-posted when balance is 20 -> rejected; when edited to 15 -> deducts 15
    const secondRender = render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={withHistoryOnly}
        commitLedgerTransition={secondSetter}
        showToast={vi.fn()}
      />
    );
    const histCard = screen.getByText("Historical Rent").closest("div.bg-surface")!;
    fireEvent.click(histCard.querySelectorAll("button")[0]!);
    fireEvent.click(screen.getByRole("checkbox", { name: /update wallet balances/i }));
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(applyUpdate(secondSetter, withHistoryOnly)).toBe(withHistoryOnly);

    secondSetter.mockClear();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(secondSetter).toHaveBeenCalledOnce();
    const postedFromHistory = applyUpdate(secondSetter, withHistoryOnly);
    expect(postedFromHistory.wallets.maya).toBe(5);
    expect(postedFromHistory.library.manualTransactions?.[0].postingMode).toBe("wallet");

    secondRender.unmount();
    const thirdSetter = makeSetGlobalData(postedFromHistory);

    // Editing a posted expense (15) to history-only refunds 15 back to maya
    const thirdRender = render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={postedFromHistory}
        commitLedgerTransition={thirdSetter}
        showToast={vi.fn()}
      />
    );
    const postedExpCard = screen.getByText("Historical Rent").closest("div.bg-surface")!;
    fireEvent.click(postedExpCard.querySelectorAll("button")[0]!);
    fireEvent.click(screen.getByRole("checkbox", { name: /update wallet balances/i }));
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    const backToHistoryOnly = applyUpdate(thirdSetter, postedFromHistory);
    expect(backToHistoryOnly.wallets.maya).toBe(20);
    expect(backToHistoryOnly.library.manualTransactions?.[0].postingMode).toBe("history-only");

    thirdRender.unmount();

    // Editing a posted income (100) to history-only when balance is 20 -> blocked because removing old posted effect would overdraw
    const postedIncomeData = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 20, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-inc",
            title: "Posted Bonus",
            amount: 100,
            type: "income",
            date: "2026-10-01",
            wallet: "maya",
            createdAt: 1759000000000,
            postingMode: "wallet",
          },
        ],
      },
    });
    const fourthSetter = makeSetGlobalData(postedIncomeData);

    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={postedIncomeData}
        commitLedgerTransition={fourthSetter}
        showToast={vi.fn()}
      />
    );

    const card = screen.getByText("Posted Bonus").closest("div.bg-surface")!;
    fireEvent.click(card.querySelectorAll("button")[0]!);
    fireEvent.click(screen.getByRole("checkbox", { name: /update wallet balances/i }));
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));

    expect(applyUpdate(fourthSetter, postedIncomeData)).toBe(postedIncomeData);
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance/i);
  });

  it("protects against missing/archived wallets, stale changed records, missing IDs, repeated deletes, and precheck-vs-commit races", () => {
    const baseTx = {
      id: "tx-1",
      title: "Lunch",
      amount: 100,
      type: "expense" as const,
      date: "2026-10-10",
      wallet: "maya",
      createdAt: 1760000000000,
      postingMode: "wallet" as const,
    };
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [baseTx],
      },
    });
    vi.stubGlobal("confirm", vi.fn(() => true));

    // 1. Precheck-vs-commit race with same-batch state change and authoritative latestDataRef
    const showToast = vi.fn();
    const onClose = vi.fn();
    const latestDataRef: { current: UnifiedFinanceData } = { current: data };
    let setExternalState!: (updater: (prev: UnifiedFinanceData) => UnifiedFinanceData) => void;
    let latestCommittedState = data;

    const StatefulHarness: React.FC = () => {
      const [state, setState] = React.useState(data);
      latestCommittedState = state;
      setExternalState = updater => {
        const next = updater(latestDataRef.current);
        latestDataRef.current = next;
        setState(next);
      };
      const commitLedgerTransition = (
        transition: (prev: UnifiedFinanceData) => LedgerTransitionResult
      ): LedgerTransitionResult => {
        const current = latestDataRef.current;
        const result = transition(current);
        if (result.ok && result.data !== current) {
          latestDataRef.current = result.data;
          setState(result.data);
        }
        return result;
      };
      return (
        <React.StrictMode>
          <HistoricalLedgerModal
            isOpen
            onClose={onClose}
            globalData={state}
            commitLedgerTransition={commitLedgerTransition}
            showToast={showToast}
          />
        </React.StrictMode>
      );
    };

    const { unmount } = render(<StatefulHarness />);

    const card = screen.getByText("Lunch").closest("div.bg-surface")!;
    fireEvent.click(card.querySelectorAll("button")[0]!);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "150" } });

    // Queue a competing state mutation (record deleted) in the same batch right before clicking Update
    const updateBtn = screen.getByRole("button", { name: /^update$/i });
    updateBtn.addEventListener(
      "click",
      () => {
        setExternalState(prev => ({
          ...prev,
          library: { ...prev.library, manualTransactions: [] },
        }));
      },
      { once: true, capture: true },
    );
    fireEvent.click(updateBtn);

    // Missing ID in latest state must NOT debit maya, close the form, or show success toast
    expect(latestCommittedState.wallets.maya).toBe(500);
    expect(latestCommittedState.library.manualTransactions).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalledWith("Transaction updated");
    expect(screen.getByRole("alert")).toHaveTextContent(/no longer exists/i);
    expect(screen.getByLabelText("Amount")).toHaveValue(150);

    // 2. Changed stale record in latest state (amount changed from 100 to 300 in same batch before Update)
    showToast.mockClear();
    updateBtn.addEventListener(
      "click",
      () => {
        setExternalState(prev => ({
          ...prev,
          library: {
            ...prev.library,
            manualTransactions: [{ ...baseTx, amount: 300 }],
          },
        }));
      },
      { once: true, capture: true },
    );
    fireEvent.click(updateBtn);
    expect(latestCommittedState.wallets.maya).toBe(500);
    expect(latestCommittedState.library.manualTransactions?.[0].amount).toBe(300);
    expect(showToast).not.toHaveBeenCalledWith("Transaction updated");
    expect(screen.getByRole("alert")).toHaveTextContent(/changed/i);

    // 3. Reverse precheck-vs-commit race: stale prop had insufficient balance (10), but queued latest state has 500 -> succeeds!
    showToast.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    act(() => {
      setExternalState(prev => ({
        ...prev,
        wallets: { ...prev.wallets, maya: 10 },
      }));
    });
    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Queued Funds Expense" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "150" } });
    const saveBtn = screen.getByRole("button", { name: /^save$/i });
    saveBtn.addEventListener(
      "click",
      () => {
        setExternalState(prev => ({
          ...prev,
          wallets: { ...prev.wallets, maya: 500 },
        }));
      },
      { once: true, capture: true },
    );
    fireEvent.click(saveBtn);
    expect(latestCommittedState.wallets.maya).toBe(350);
    expect(showToast).toHaveBeenCalledWith("Transaction recorded");

    // 4. Delete precheck-vs-commit race: stale prop shows tx-1 (amount 300), but queued same-batch update modifies tx-1 before delete runs
    showToast.mockClear();
    const currentCard = screen.getByText("Lunch").closest("div.bg-surface")!;
    const currentDeleteBtn = currentCard.querySelectorAll("button")[1]!;
    currentDeleteBtn.addEventListener(
      "click",
      () => {
        setExternalState(prev => ({
          ...prev,
          library: {
            ...prev.library,
            manualTransactions: (prev.library.manualTransactions ?? []).map(t =>
              t.id === "tx-1" ? { ...t, amount: 450 } : t,
            ),
          },
        }));
      },
      { once: true, capture: true },
    );
    fireEvent.click(currentDeleteBtn);
    expect(latestCommittedState.wallets.maya).toBe(350);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/changed/i));
    expect(showToast).not.toHaveBeenCalledWith("Transaction deleted");

    unmount();

    // 5. Repeated delete and missing delete ID do not double-refund, and pure transition is idempotent/side-effect-free
    const deleteToast = vi.fn();
    const deleteSetter = makeSetGlobalData(data);
    const deleteRender = render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={deleteSetter}
        showToast={deleteToast}
      />
    );
    const deleteCard = screen.getByText("Lunch").closest("div.bg-surface")!;
    fireEvent.click(deleteCard.querySelectorAll("button")[1]!);
    expect(deleteToast).toHaveBeenCalledWith("Transaction deleted");
    const transition = deleteSetter.mock.calls.at(-1)?.[0] as (
      prev: UnifiedFinanceData
    ) => LedgerTransitionResult;
    deleteToast.mockClear();
    const firstDeleteResult = transition(data);
    expect(firstDeleteResult.ok).toBe(true);
    const firstDelete = firstDeleteResult.data;
    expect(firstDelete.wallets.maya).toBe(600);
    expect(firstDelete.library.manualTransactions).toHaveLength(0);
    expect(deleteToast).not.toHaveBeenCalled();

    // Second invocation against already-deleted state must be a no-op
    const secondDeleteResult = transition(firstDelete);
    expect(secondDeleteResult.ok).toBe(false);
    expect(secondDeleteResult.data).toBe(firstDelete);
    expect(secondDeleteResult.data.wallets.maya).toBe(600);

    // Clicking delete again on the same modal before prop re-renders rejects without a second success toast
    fireEvent.click(deleteCard.querySelectorAll("button")[1]!);
    expect(deleteToast).toHaveBeenCalledWith("This transaction no longer exists.");
    expect(deleteToast).not.toHaveBeenCalledWith("Transaction deleted");
    deleteRender.unmount();

    // 6. Missing or archived wallet in state is rejected without inventing wallet keys
    const ghostWalletData = makeData({
      wallets: { maya: 500, gcash: 500 },
      settings: {
        defaultWallet: "ghost",
        customWallets: [
          { id: "ghost", label: "Ghost" },
          { id: "maya", label: "Maya" },
        ],
        archivedWallets: [{ id: "archived", label: "Archived" }],
      } as any,
    });
    const ghostSetter = makeSetGlobalData(ghostWalletData);
    const ghostToast = vi.fn();
    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={ghostWalletData}
        commitLedgerTransition={ghostSetter}
        showToast={ghostToast}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Ghost Entry" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(applyUpdate(ghostSetter, ghostWalletData)).toBe(ghostWalletData);
    expect(ghostWalletData.wallets.ghost).toBeUndefined();
    expect(ghostToast).not.toHaveBeenCalledWith("Transaction recorded");
  });

  it("preserves pre-existing negative balances, allows metadata edits and improvements, and rejects worsening overdrafts", () => {
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: -100, gotyme: 0, bpi: 200, cash: 0 },
      settings: {
        defaultWallet: "maya",
        customWallets: [
          { id: "maya", label: "Maya" },
          { id: "gcash", label: "GCash" },
          { id: "bpi", label: "BPI" },
        ],
      } as any,
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [
          {
            id: "tx-neg-exp",
            title: "Prior Expense",
            amount: 80,
            type: "expense",
            date: "2026-10-05",
            wallet: "maya",
            createdAt: 1759500000000,
            postingMode: "wallet",
          },
        ],
      },
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const setGlobalData = makeSetGlobalData(data);

    const { unmount } = render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={setGlobalData}
        showToast={vi.fn()}
      />
    );

    // 1. Worsening the negative balance via a new expense on maya -> rejected
    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "More Debt" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(applyUpdate(setGlobalData, data)).toBe(data);

    // 2. Improving the negative balance via income (+60 brings -100 to -40) -> accepted!
    setGlobalData.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^income$/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Partial Recovery" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(setGlobalData).toHaveBeenCalledOnce();
    const improved = applyUpdate(setGlobalData, data);
    expect(improved.wallets.maya).toBe(-40);

    // 3. Metadata-only edit (0 net delta) and expense reduction (+30 delta) on negative wallet -> accepted; expense increase (-10 delta) -> rejected
    const priorTx = data.library.manualTransactions?.[0];
    const metadataEdit = applyLedgerSave(data, {
      id: "tx-neg-exp",
      editingId: "tx-neg-exp",
      expectedOldTx: priorTx,
      title: "Prior Expense (Renamed)",
      amount: "80",
      type: "expense",
      date: "2026-10-05",
      wallet: "maya",
      updateWallets: true,
    });
    expect(metadataEdit.ok).toBe(true);
    expect(metadataEdit.data.wallets.maya).toBe(-100);

    const reduceExpenseEdit = applyLedgerSave(data, {
      id: "tx-neg-exp",
      editingId: "tx-neg-exp",
      expectedOldTx: priorTx,
      title: "Prior Expense",
      amount: "50",
      type: "expense",
      date: "2026-10-05",
      wallet: "maya",
      updateWallets: true,
    });
    expect(reduceExpenseEdit.ok).toBe(true);
    expect(reduceExpenseEdit.data.wallets.maya).toBe(-70);

    const increaseExpenseEdit = applyLedgerSave(data, {
      id: "tx-neg-exp",
      editingId: "tx-neg-exp",
      expectedOldTx: priorTx,
      title: "Prior Expense",
      amount: "90",
      type: "expense",
      date: "2026-10-05",
      wallet: "maya",
      updateWallets: true,
    });
    expect(increaseExpenseEdit.ok).toBe(false);
    expect(increaseExpenseEdit.data).toBe(data);

    unmount();
    const deleteSetter = makeSetGlobalData(data);

    // 4. Deleting the prior 80 expense on maya improves -100 to -20 -> accepted, and preserves other wallets
    render(
      <HistoricalLedgerModal
        isOpen
        onClose={vi.fn()}
        globalData={data}
        commitLedgerTransition={deleteSetter}
        showToast={vi.fn()}
      />
    );
    const priorCard = screen.getByText("Prior Expense").closest("div.bg-surface")!;
    fireEvent.click(priorCard.querySelectorAll("button")[1]!);
    expect(deleteSetter).toHaveBeenCalledOnce();
    const afterDelete = applyUpdate(deleteSetter, data);
    expect(afterDelete.wallets.maya).toBe(-20);
  });

  it("allows deleting or repairing a legacy same-wallet transfer while rejecting new or edited same-wallet saves", () => {
    const legacySelfTransfer = {
      id: "tx-self",
      title: "Legacy Self Transfer",
      amount: 100,
      type: "transfer" as const,
      date: "2026-09-01",
      wallet: "maya",
      destinationWallet: "maya",
      createdAt: 1757000000000,
      postingMode: "wallet" as const,
    };
    const data = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [legacySelfTransfer],
      },
    });

    const deleted = applyLedgerDelete(data, { id: "tx-self", expectedTx: legacySelfTransfer });
    expect(deleted.ok).toBe(true);
    expect(deleted.data.wallets.maya).toBe(500);
    expect(deleted.data.library.manualTransactions).toHaveLength(0);

    const repaired = applyLedgerSave(data, {
      id: "tx-self",
      editingId: "tx-self",
      expectedOldTx: legacySelfTransfer,
      title: "Repaired Transfer",
      amount: "100",
      type: "transfer",
      date: "2026-09-01",
      wallet: "maya",
      destinationWallet: "gcash",
      updateWallets: true,
    });
    expect(repaired.ok).toBe(true);
    expect(repaired.data.wallets.maya).toBe(400);
    expect(repaired.data.wallets.gcash).toBe(1100);
  });

  it.each(["0", "-25", "12.345", "1e2", ".5", "5.", "+50", "NaN", "Infinity", ""])(
    "rejects invalid amount %j without partial posting",
    invalidAmount => {
      const data = makeData();
      const setGlobalData = makeSetGlobalData(data);

      render(
        <HistoricalLedgerModal
          isOpen
          onClose={vi.fn()}
          globalData={data}
          commitLedgerTransition={setGlobalData}
          showToast={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
      fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Invalid Entry" } });
      fireEvent.change(screen.getByLabelText("Amount"), { target: { value: invalidAmount } });
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(applyUpdate(setGlobalData, data)).toBe(data);
    }
  );

  it("handles floating-point cent arithmetic exactly and rejects sub-cent numeric precision", () => {
    const floatWalletData = makeData({
      // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754
      wallets: { maribank: 0, gcash: 1000, maya: 0.1 + 0.2, gotyme: 0, bpi: 0, cash: 0 },
    });

    // Sub-cent numeric precision like 10.00000001 or 1.005 is rejected without truncation
    expect(
      applyLedgerSave(floatWalletData, {
        id: "tx-subcent-1",
        editingId: null,
        title: "Subcent",
        amount: 10.00000001,
        type: "income",
        date: "2026-11-08",
        wallet: "maya",
        updateWallets: true,
      }).ok,
    ).toBe(false);
    expect(
      applyLedgerSave(floatWalletData, {
        id: "tx-subcent-2",
        editingId: null,
        title: "Subcent",
        amount: 0.105,
        type: "expense",
        date: "2026-11-08",
        wallet: "maya",
        updateWallets: true,
      }).ok,
    ).toBe(false);

    // 0.30000000000000004 - 0.10 = exact 0.20 (and - 0.20 = exact 0)
    const afterTenCents = applyLedgerSave(floatWalletData, {
      id: "tx-exact-10c",
      editingId: null,
      title: "Ten Cents",
      amount: 0.1,
      type: "expense",
      date: "2026-11-08",
      wallet: "maya",
      updateWallets: true,
    });
    expect(afterTenCents.ok).toBe(true);
    expect(afterTenCents.data.wallets.maya).toBe(0.2);

    // Pure functional updater factories are side-effect free and deterministic across repeated invocations
    const saveUpdater = createLedgerSaveUpdater({
      id: "tx-pure",
      editingId: null,
      title: "Pure Check",
      amount: "0.20",
      type: "expense",
      date: "2026-11-08",
      wallet: "maya",
      updateWallets: true,
      now: 1762500000000,
    });
    expect(saveUpdater(afterTenCents.data)).toEqual(saveUpdater(afterTenCents.data));
    expect(saveUpdater(afterTenCents.data).wallets.maya).toBe(0);

    const deleteUpdater = createLedgerDeleteUpdater({
      id: "tx-exact-10c",
      expectedTx: afterTenCents.ok ? afterTenCents.transaction : undefined,
      now: 1762500001000,
    });
    expect(deleteUpdater(afterTenCents.data).wallets.maya).toBe(0.3);
  });

  it("uses local Manila date for ordinary ledger defaults and recomputes when Add is clicked after local midnight", () => {
    vi.stubEnv("TZ", "Asia/Manila");
    vi.useFakeTimers();
    // 2026-11-06 23:50 Manila (UTC 15:50)
    vi.setSystemTime(new Date("2026-11-06T15:50:00Z"));
    try {
      const data = makeData();
      render(
        <HistoricalLedgerModal
          isOpen
          onClose={vi.fn()}
          globalData={data}
          commitLedgerTransition={makeSetGlobalData(data)}
          showToast={vi.fn()}
        />
      );

      // Advance past Manila midnight to 2026-11-07 00:30 Manila (still 2026-11-06T16:30Z in UTC!)
      vi.setSystemTime(new Date("2026-11-06T16:30:00Z"));
      fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));

      expect(screen.getByLabelText("Date")).toHaveValue("2026-11-07");
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("uses explicit commit acknowledgement against authoritative latestDataRef rather than reconstructing outcomes from a stale modal snapshot", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    const existingTx = {
      id: "tx-auth-1",
      title: "Studio Cable",
      amount: 100,
      type: "expense" as const,
      date: "2026-10-20",
      wallet: "maya",
      createdAt: 1760900000000,
      postingMode: "wallet" as const,
    };

    const modalSnapshot = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [existingTx],
      },
      // Existing timestamp intentionally ahead of the current clock
      updatedAt: Date.now() + 86_400_000,
    });

    // Authoritative latestDataRef starts with insufficient funds (maya: 80) while modalSnapshot has maya: 500
    const latestDataRef: { current: UnifiedFinanceData } = {
      current: {
        ...modalSnapshot,
        wallets: { ...modalSnapshot.wallets, maya: 80 },
      },
    };

    const showToast = vi.fn();
    const onClose = vi.fn();
    let setModalPropState!: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;

    const CloudSyncCommitHarness: React.FC = () => {
      const [modalState, setModalState] = React.useState(modalSnapshot);
      setModalPropState = setModalState;

      // Exact useCloudSync.commitDataTransition semantics:
      // evaluates against latestDataRef.current, preserves monotonic updatedAt,
      // returns the authoritative LedgerTransitionResult, and leaves React state untouched when rejected.
      const commitLedgerTransition = (
        transition: (prev: UnifiedFinanceData) => LedgerTransitionResult
      ): LedgerTransitionResult => {
        const current = latestDataRef.current;
        // Simulate React Strict Mode / repeated evaluation of the pure transition function
        const firstEval = transition(current);
        const secondEval = transition(current);
        expect(secondEval).toEqual(firstEval);
        if (!secondEval.ok || secondEval.data === current) {
          return secondEval;
        }
        const monotonicUpdatedAt = Math.max(
          Date.now(),
          secondEval.data.updatedAt ?? 0,
          current.updatedAt ?? 0,
        );
        const nextData: UnifiedFinanceData = {
          ...secondEval.data,
          updatedAt: monotonicUpdatedAt,
        };
        latestDataRef.current = nextData;
        setModalState(nextData);
        return { ...secondEval, data: nextData };
      };

      return (
        <React.StrictMode>
          <HistoricalLedgerModal
            isOpen
            onClose={onClose}
            globalData={modalState}
            commitLedgerTransition={commitLedgerTransition}
            showToast={showToast}
          />
        </React.StrictMode>
      );
    };

    const { unmount } = render(<CloudSyncCommitHarness />);

    // 1. Modal snapshot has sufficient funds (500), but authoritative latestDataRef has insufficient funds (80):
    // Submitting an expense of 300 must reject, preserve draft, and show NO success toast.
    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Camera Battery" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(latestDataRef.current.wallets.maya).toBe(80);
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance in maya/i);
    expect(screen.getByLabelText(/title \/ description/i)).toHaveValue("Camera Battery");
    expect(screen.getByLabelText("Amount")).toHaveValue(300);
    expect(showToast).toHaveBeenCalledWith("Insufficient balance in Maya.");
    expect(showToast).not.toHaveBeenCalledWith("Transaction recorded");
    expect(onClose).not.toHaveBeenCalled();

    // 2. Authoritative state has sufficient funds (600) despite an older modal snapshot showing insufficient funds (20):
    // Submitting the 300 expense must be accepted.
    showToast.mockClear();
    act(() => {
      setModalPropState(prev => ({
        ...prev,
        wallets: { ...prev.wallets, maya: 20 },
      }));
    });
    latestDataRef.current = {
      ...latestDataRef.current,
      wallets: { ...latestDataRef.current.wallets, maya: 600 },
    };

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(latestDataRef.current.wallets.maya).toBe(300);
    expect(showToast).toHaveBeenCalledWith("Transaction recorded");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // 3. Modal snapshot contains an existing transaction (amount: 100), but authoritative state has a changed transaction (amount: 250):
    // Editing that transaction must reject as stale and preserve the draft.
    showToast.mockClear();
    const cableCard = screen.getByText("Studio Cable").closest("div.bg-surface")!;
    fireEvent.click(cableCard.querySelectorAll("button")[0]!);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "120" } });

    latestDataRef.current = {
      ...latestDataRef.current,
      library: {
        ...latestDataRef.current.library,
        manualTransactions: (latestDataRef.current.library.manualTransactions ?? []).map(t =>
          t.id === "tx-auth-1" ? { ...t, amount: 250 } : t,
        ),
      },
    };

    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/this transaction changed/i);
    expect(screen.getByLabelText("Amount")).toHaveValue(120);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/this transaction changed/i));
    expect(showToast).not.toHaveBeenCalledWith("Transaction updated");

    // 4. Successful delete when existing globalData.updatedAt is ahead of the current clock:
    // Must acknowledge "Transaction deleted", retain the future updatedAt, and never falsely report "This transaction no longer exists."
    showToast.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    const futureUpdatedAt = Date.now() + 86_400_000;
    const syncedStateWithFutureTimestamp: UnifiedFinanceData = {
      ...latestDataRef.current,
      library: {
        ...latestDataRef.current.library,
        manualTransactions: [existingTx],
      },
      updatedAt: futureUpdatedAt,
    };
    latestDataRef.current = syncedStateWithFutureTimestamp;
    act(() => {
      setModalPropState(syncedStateWithFutureTimestamp);
    });

    const cardToDelete = screen.getByText("Studio Cable").closest("div.bg-surface")!;
    fireEvent.click(cardToDelete.querySelectorAll("button")[1]!);
    expect(latestDataRef.current.library.manualTransactions).toHaveLength(0);
    expect(latestDataRef.current.wallets.maya).toBe(400);
    expect(latestDataRef.current.updatedAt).toBe(futureUpdatedAt);
    expect(showToast).toHaveBeenCalledWith("Transaction deleted");
    expect(showToast).not.toHaveBeenCalledWith("This transaction no longer exists.");

    unmount();
  });

  it("integrates directly with real useCloudSync.commitDataTransition, preserves monotonic future updatedAt, and keeps updater functions side-effect-free", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    const futureUpdatedAt = Date.now() + 86_400_000;
    const existingTx = {
      id: "tx-future-1",
      title: "Lens Cap",
      amount: 30,
      type: "expense" as const,
      date: "2026-10-25",
      wallet: "gcash",
      createdAt: 1761300000000,
      postingMode: "wallet" as const,
    };
    const initialData = makeData({
      wallets: { maribank: 0, gcash: 1000, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
      library: {
        bills: [],
        receivables: [],
        shoots: [],
        manualTransactions: [existingTx],
      },
      updatedAt: futureUpdatedAt,
    });

    const showToast = vi.fn();
    const onClose = vi.fn();
    let triggerBackgroundDeduction!: () => void;
    let seedFutureAuthoritativeTimestamp!: () => void;
    let latestReactState = initialData;
    let lastTransitionResult: LedgerTransitionResult | undefined;

    const RealCloudSyncAppHarness: React.FC = () => {
      const [globalState, setGlobalState] = React.useState(initialData);
      latestReactState = globalState;
      const { commitDataChange, commitDataTransition } = useCloudSync(
        globalState,
        setGlobalState,
        showToast,
      );

      // Simulate a same-tick commit to useCloudSync.latestDataRef before modal props re-render
      triggerBackgroundDeduction = () => {
        commitDataChange(prev => ({
          ...prev,
          wallets: { ...prev.wallets, maya: 40 },
        }));
      };

      // Seed useCloudSync.latestDataRef with a future updatedAt via commitDataTransition
      seedFutureAuthoritativeTimestamp = () => {
        commitDataTransition(prev => ({
          ok: true,
          data: {
            ...prev,
            updatedAt: futureUpdatedAt,
          },
        }));
      };

      const wrappedCommitTransition: LedgerTransitionCommitter = transition => {
        const res = commitDataTransition(transition);
        lastTransitionResult = res;
        return res;
      };

      return (
        <React.StrictMode>
          <HistoricalLedgerModal
            isOpen
            onClose={onClose}
            globalData={initialData} // Intentionally pinned to stale modal snapshot (maya: 500)
            commitLedgerTransition={wrappedCommitTransition}
            showToast={showToast}
          />
        </React.StrictMode>
      );
    };

    render(<RealCloudSyncAppHarness />);

    // 1. Authoritative latestDataRef in useCloudSync drops maya to 40 while modal prop still shows 500
    // Also verify ordinary commitDataChange preserves Date.now() timestamp semantics for unrelated callers
    act(() => {
      triggerBackgroundDeduction();
    });
    expect(latestReactState.wallets.maya).toBe(40);
    expect(latestReactState.updatedAt).toBeLessThan(futureUpdatedAt);

    // Now seed authoritative latestDataRef.current.updatedAt ahead of Date.now()
    act(() => {
      seedFutureAuthoritativeTimestamp();
    });
    expect(latestReactState.updatedAt).toBe(futureUpdatedAt);
    showToast.mockClear();

    // 2. Attempting to spend 200 on maya against stale modal snapshot (500) is rejected by real useCloudSync (40)
    fireEvent.click(screen.getByRole("button", { name: /add manual transaction/i }));
    fireEvent.change(screen.getByLabelText(/title \/ description/i), { target: { value: "Tripod" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(latestReactState.wallets.maya).toBe(40);
    expect(latestReactState.updatedAt).toBe(futureUpdatedAt);
    expect(screen.getByRole("alert")).toHaveTextContent(/insufficient balance in maya/i);
    expect(screen.getByLabelText(/title \/ description/i)).toHaveValue("Tripod");
    expect(showToast).toHaveBeenCalledWith("Insufficient balance in Maya.");
    expect(showToast).not.toHaveBeenCalledWith("Transaction recorded");

    // 3. Accepted ledger save when latestDataRef.current.updatedAt is ahead of Date.now():
    // Must preserve the future updatedAt on both the returned result and the committed state
    showToast.mockClear();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(showToast).toHaveBeenCalledWith("Transaction recorded");
    expect(lastTransitionResult?.ok).toBe(true);
    expect(lastTransitionResult?.data.updatedAt).toBe(futureUpdatedAt);
    expect(latestReactState.wallets.maya).toBe(15);
    expect(latestReactState.updatedAt).toBe(futureUpdatedAt);

    // 4. Accepted ledger delete when latestDataRef.current.updatedAt is ahead of Date.now():
    // Must also preserve the future updatedAt on the committed state
    showToast.mockClear();
    const lensCard = screen.getByText("Lens Cap").closest("div.bg-surface")!;
    fireEvent.click(lensCard.querySelectorAll("button")[1]!);

    expect(showToast).toHaveBeenCalledWith("Transaction deleted");
    expect(lastTransitionResult?.ok).toBe(true);
    expect(lastTransitionResult?.data.updatedAt).toBe(futureUpdatedAt);
    expect(latestReactState.wallets.gcash).toBe(1030);
    expect(latestReactState.updatedAt).toBe(futureUpdatedAt);

    // 5. Verify pure updater has zero side effects across repeated evaluations
    const pureUpdater = createLedgerSaveUpdater({
      id: "tx-pure-repeat",
      editingId: null,
      title: "Pure Repeat",
      amount: "10",
      type: "expense",
      date: "2026-11-08",
      wallet: "maya",
      updateWallets: true,
      now: 1762500000000,
    });
    const snapshotCopy = structuredClone(latestReactState);
    const run1 = pureUpdater(latestReactState);
    const run2 = pureUpdater(latestReactState);
    const eval1 = pureUpdater.evaluate(latestReactState);
    const eval2 = pureUpdater.evaluate(latestReactState);
    expect(latestReactState).toEqual(snapshotCopy);
    expect(run1).toEqual(run2);
    expect(eval1).toEqual(eval2);
    expect(run1.wallets.maya).toBe(5);
    expect(run1.updatedAt).toBe(futureUpdatedAt);
  });

  it("preserves account-ownership isolation, offline pending-sync persistence, dirty-state tracking, unauthenticated behavior, broadcast/local persistence, and immediate cloud push/retry in commitSnapshot", async () => {
    vi.useFakeTimers();
    const store: Record<string, string> = {};
    const mockStorage = {
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        for (const k of Object.keys(store)) delete store[k];
      }),
    };
    vi.stubGlobal("localStorage", mockStorage);
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    const broadcastMessages: any[] = [];
    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: { data: any }) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage(msg: any) {
        broadcastMessages.push({ channel: this.name, msg });
      }
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    try {
      const futureUpdatedAt = Date.now() + 86_400_000;
      const baseData = makeData({
        wallets: { maribank: 0, gcash: 1000, maya: 500, gotyme: 0, bpi: 0, cash: 0 },
        updatedAt: futureUpdatedAt,
      });

      // 1. Unauthenticated behavior (getGoogleSub() === null):
      // Updates React state, keeps isDirty=false, writes no pending-sync or scoped storage keys, skips cloud push.
      let unauthState = baseData;
      let unauthSync!: ReturnType<typeof useCloudSync>;
      const UnauthHarness: React.FC = () => {
        const [state, setState] = React.useState(baseData);
        unauthState = state;
        unauthSync = useCloudSync(state, setState, vi.fn());
        return null;
      };
      const unauthView = render(<UnauthHarness />);
      act(() => {
        const res = unauthSync.commitDataTransition(prev =>
          applyLedgerSave(prev, {
            id: "tx-unauth",
            editingId: null,
            title: "Offline Cash",
            amount: "50",
            type: "expense",
            date: "2026-11-08",
            wallet: "maya",
            updateWallets: true,
          }),
        );
        expect(res.ok).toBe(true);
        expect(res.data.updatedAt).toBe(futureUpdatedAt);
      });
      expect(unauthState.wallets.maya).toBe(450);
      expect(unauthState.updatedAt).toBe(futureUpdatedAt);
      expect(Object.keys(store).filter(k => k.startsWith("ft_sync_pending_writer:"))).toHaveLength(0);
      expect(Object.keys(store).filter(k => k.startsWith("ft_master_data_v1_"))).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
      unauthView.unmount();

      // 2. Authenticated as user_123: immediate cloud push, pending-sync persistence, dirty-state tracking,
      // scoped localStorage persistence, and BroadcastChannel notification.
      store.ft_google_token = "header.eyJzdWIiOiJ1c2VyXzEyMyJ9.sig";
      store.ft_sync_base_revision_user_123 = "7";
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, accepted: true, revision: 7 }),
      });

      let authState = baseData;
      let authSync!: ReturnType<typeof useCloudSync>;
      const AuthHarness: React.FC = () => {
        const [state, setState] = React.useState(baseData);
        authState = state;
        authSync = useCloudSync(state, setState, vi.fn());
        return null;
      };
      const authView = render(<AuthHarness />);
      expect(authSync.canReloadSafely()).toBe(true);

      mockFetch.mockClear();
      let resolvePut!: (value: any) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolvePut = resolve;
          }),
      );

      act(() => {
        const res = authSync.commitDataTransition(prev =>
          applyLedgerSave(prev, {
            id: "tx-auth-push",
            editingId: null,
            title: "Light Stand",
            amount: "100",
            type: "expense",
            date: "2026-11-08",
            wallet: "maya",
            updateWallets: true,
          }),
        );
        expect(res.ok).toBe(true);
        expect(res.data.updatedAt).toBe(futureUpdatedAt);
      });

      // Dirty state & pending-sync record owned by user_123 while PUT is in flight
      expect(authSync.canReloadSafely()).toBe(false);
      const pendingKey = Object.keys(store).find(k =>
        k.startsWith("ft_sync_pending_writer:user_123:"),
      )!;
      expect(pendingKey).toBeTruthy();
      expect(JSON.parse(store[pendingKey])).toMatchObject({
        version: 1,
        sub: "user_123",
        baseRevision: 7,
        snapshot: {
          updatedAt: futureUpdatedAt,
          wallets: expect.objectContaining({ maya: 400 }),
        },
      });

      // Scoped localStorage & BroadcastChannel updated for user_123
      expect(JSON.parse(store.ft_master_data_v1_user_123)).toMatchObject({
        updatedAt: futureUpdatedAt,
        wallets: expect.objectContaining({ maya: 400 }),
      });
      expect(broadcastMessages.at(-1)).toMatchObject({
        channel: "ft_sync_channel",
        msg: {
          type: "SYNC_DATA",
          payload: {
            sub: "user_123",
            data: expect.objectContaining({ updatedAt: futureUpdatedAt }),
          },
        },
      });

      // Immediate PUT /api/sync with monotonic updatedAt
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe("/api/sync");
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
        baseRevision: 7,
        data: expect.objectContaining({
          updatedAt: futureUpdatedAt,
          wallets: expect.objectContaining({ maya: 400 }),
        }),
      });

      // Resolve PUT -> clears pending record & dirty flag, updates baseRevision to 8
      await act(async () => {
        resolvePut({
          ok: true,
          status: 200,
          json: async () => ({ success: true, accepted: true, revision: 8 }),
        });
      });
      expect(store[pendingKey]).toBeUndefined();
      expect(store.ft_sync_base_revision_user_123).toBe("8");
      expect(authSync.canReloadSafely()).toBe(true);

      // 3. Offline pending-sync persistence & 500 server-error retry semantics
      Object.defineProperty(window.navigator, "onLine", {
        value: false,
        configurable: true,
      });
      mockFetch.mockClear();

      act(() => {
        authSync.commitDataTransition(prev =>
          applyLedgerSave(prev, {
            id: "tx-offline",
            editingId: null,
            title: "Offline Taxi",
            amount: "40",
            type: "expense",
            date: "2026-11-08",
            wallet: "maya",
            updateWallets: true,
          }),
        );
      });
      expect(authState.wallets.maya).toBe(360);
      expect(authSync.canReloadSafely()).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
      const offlinePendingKey = Object.keys(store).find(k =>
        k.startsWith("ft_sync_pending_writer:user_123:"),
      )!;
      expect(JSON.parse(store[offlinePendingKey]).snapshot.wallets.maya).toBe(360);

      // Back online: 500 error triggers schedulePushRetry (2s backoff), then succeeds on retry
      Object.defineProperty(window.navigator, "onLine", {
        value: true,
        configurable: true,
      });
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, accepted: true, revision: 9 }),
        });

      await act(async () => {
        authSync.commitDataTransition(prev =>
          applyLedgerSave(prev, {
            id: "tx-retry",
            editingId: null,
            title: "Retry Meal",
            amount: "60",
            type: "expense",
            date: "2026-11-08",
            wallet: "maya",
            updateWallets: true,
          }),
        );
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(authSync.canReloadSafely()).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(authSync.canReloadSafely()).toBe(true);

      // 4. Account-ownership isolation when token subject mismatches activeSubRef.current:
      // Must NOT persist pending sync or scoped data under user_456 and must skip cloud push.
      mockFetch.mockClear();
      store.ft_google_token = "header.eyJzdWIiOiJ1c2VyXzQ1NiJ9.sig";
      act(() => {
        authSync.commitDataTransition(prev =>
          applyLedgerSave(prev, {
            id: "tx-mismatch-sub",
            editingId: null,
            title: "Mismatch Sub",
            amount: "10",
            type: "expense",
            date: "2026-11-08",
            wallet: "maya",
            updateWallets: true,
          }),
        );
      });
      expect(
        Object.keys(store).filter(k => k.startsWith("ft_sync_pending_writer:user_456:")),
      ).toHaveLength(0);
      expect(store.ft_master_data_v1_user_456).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();

      authView.unmount();
    } finally {
      Object.defineProperty(window.navigator, "onLine", {
        value: true,
        configurable: true,
      });
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  describe("Phase B1 — Historical Ledger Reversal Integrity for Archived Wallets", () => {
    it("deleting an expense refunds to the original wallet even when archived or absent from wallets", () => {
      const data = makeData({
        wallets: { active: 500 },
        settings: {
          customWallets: [{ id: "active", label: "Active" }],
          archivedWallets: [{ id: "old_wallet", label: "Old Wallet" }],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-exp",
              title: "Old Expense",
              amount: 100,
              type: "expense",
              date: "2026-08-01",
              wallet: "old_wallet",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerDelete(data, { id: "tx-arch-exp" });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.data.wallets.old_wallet).toBe(100);
      expect(outcome.data.library.manualTransactions).toHaveLength(0);
    });

    it("deleting an income debits the original wallet even when archived, blocking if insufficient balance", () => {
      const data = makeData({
        wallets: { old_wallet: 50 },
        settings: {
          archivedWallets: [{ id: "old_wallet", label: "Old Wallet" }],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-inc",
              title: "Old Income",
              amount: 100,
              type: "income",
              date: "2026-08-01",
              wallet: "old_wallet",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const blockedOutcome = applyLedgerDelete(data, { id: "tx-arch-inc" });
      expect(blockedOutcome.ok).toBe(false);
      if (blockedOutcome.ok) return;
      expect(blockedOutcome.error).toContain("Insufficient balance in Old Wallet");

      const fundedData = { ...data, wallets: { old_wallet: 150 } };
      const successOutcome = applyLedgerDelete(fundedData, { id: "tx-arch-inc" });
      expect(successOutcome.ok).toBe(true);
      if (!successOutcome.ok) return;
      expect(successOutcome.data.wallets.old_wallet).toBe(50);
      expect(successOutcome.data.library.manualTransactions).toHaveLength(0);
    });

    it("deleting a transfer between archived wallets reverses both wallets atomically", () => {
      const data = makeData({
        wallets: { src_arch: 100, dst_arch: 200 },
        settings: {
          archivedWallets: [
            { id: "src_arch", label: "Source Archived" },
            { id: "dst_arch", label: "Dest Archived" },
          ],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-xfer",
              title: "Old Transfer",
              amount: 50,
              type: "transfer",
              date: "2026-08-01",
              wallet: "src_arch",
              destinationWallet: "dst_arch",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerDelete(data, { id: "tx-arch-xfer" });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.data.wallets.src_arch).toBe(150);
      expect(outcome.data.wallets.dst_arch).toBe(150);
      expect(outcome.data.library.manualTransactions).toHaveLength(0);
    });

    it("editing a transaction with an archived original wallet reverses the archived wallet and credits the new active wallet", () => {
      const data = makeData({
        wallets: { arch_wallet: 100, active_wallet: 200 },
        settings: {
          customWallets: [{ id: "active_wallet", label: "Active" }],
          archivedWallets: [{ id: "arch_wallet", label: "Archived" }],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-edit-arch",
              title: "Prior Income",
              amount: 100,
              type: "income",
              date: "2026-08-01",
              wallet: "arch_wallet",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerSave(data, {
        id: "tx-edit-arch",
        editingId: "tx-edit-arch",
        title: "Moved Income",
        amount: "100",
        type: "income",
        date: "2026-08-01",
        wallet: "active_wallet",
        updateWallets: true,
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.data.wallets.arch_wallet).toBe(0);
      expect(outcome.data.wallets.active_wallet).toBe(300);
      expect(outcome.data.library?.manualTransactions?.[0]?.wallet).toBe("active_wallet");
    });

    it("rejects deleting an expense when original archived wallet has NaN balance, preserving record and balances", () => {
      const data = makeData({
        wallets: { old_wallet: NaN as any },
        settings: {
          archivedWallets: [{ id: "old_wallet", label: "Old Wallet" }],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-exp-nan",
              title: "Old Expense",
              amount: 100,
              type: "expense",
              date: "2026-08-01",
              wallet: "old_wallet",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerDelete(data, { id: "tx-arch-exp-nan" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error).toContain("unavailable");
      expect(outcome.data.library.manualTransactions).toHaveLength(1);
      expect(Number.isNaN(outcome.data.wallets.old_wallet)).toBe(true);
    });

    it("rejects deleting an income when original archived wallet has null or malformed balance, preserving record and balances", () => {
      const data = makeData({
        wallets: { old_wallet: null as any },
        settings: {
          archivedWallets: [{ id: "old_wallet", label: "Old Wallet" }],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-inc-null",
              title: "Old Income",
              amount: 100,
              type: "income",
              date: "2026-08-01",
              wallet: "old_wallet",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerDelete(data, { id: "tx-arch-inc-null" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error).toContain("unavailable");
      expect(outcome.data.library.manualTransactions).toHaveLength(1);
      expect(outcome.data.wallets.old_wallet).toBeNull();
    });

    it("rejects deleting a transfer when an archived endpoint has an invalid balance, preserving all balances and records", () => {
      const data = makeData({
        wallets: { src_arch: 200, dst_arch: NaN as any },
        settings: {
          archivedWallets: [
            { id: "src_arch", label: "Source Archived" },
            { id: "dst_arch", label: "Dest Archived" },
          ],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-xfer-nan",
              title: "Old Transfer",
              amount: 50,
              type: "transfer",
              date: "2026-08-01",
              wallet: "src_arch",
              destinationWallet: "dst_arch",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerDelete(data, { id: "tx-arch-xfer-nan" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error).toContain("unavailable");
      expect(outcome.data.library.manualTransactions).toHaveLength(1);
      expect(outcome.data.wallets.src_arch).toBe(200);
      expect(Number.isNaN(outcome.data.wallets.dst_arch)).toBe(true);
    });

    it("rejects deleting a transfer atomically when destination debit fails insufficient balance, leaving source untouched", () => {
      const data = makeData({
        wallets: { src_arch: 200, dst_arch: 40 }, // dst_arch has only 40, transfer is 50
        settings: {
          archivedWallets: [
            { id: "src_arch", label: "Source Archived" },
            { id: "dst_arch", label: "Dest Archived" },
          ],
        } as any,
        library: {
          bills: [],
          receivables: [],
          shoots: [],
          manualTransactions: [
            {
              id: "tx-arch-xfer-overdraft",
              title: "Old Transfer",
              amount: 50,
              type: "transfer",
              date: "2026-08-01",
              wallet: "src_arch",
              destinationWallet: "dst_arch",
              createdAt: 1754000000000,
              postingMode: "wallet",
            },
          ],
        },
      });

      const outcome = applyLedgerDelete(data, { id: "tx-arch-xfer-overdraft" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error).toContain("Insufficient balance in Dest Archived to reverse this transaction");
      // Atomic verification: src_arch must NOT have been credited +50 (stays at 200)
      expect(outcome.data.wallets.src_arch).toBe(200);
      expect(outcome.data.wallets.dst_arch).toBe(40);
      expect(outcome.data.library.manualTransactions).toHaveLength(1);
    });
  });
});
