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
    const setGlobalData = vi.fn();
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={vi.fn()}
      globalData={data} setGlobalData={setGlobalData} showToast={vi.fn()} />);
    expect(screen.getByLabelText("From")).toHaveValue(from);
    expect(screen.getByLabelText("To")).toHaveValue(to);
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("lets a transfer override both defaults without changing the saved preferences", () => {
    const data = makeData();
    data.settings = { ...data.settings, transferFromWallet: "gcash", transferToWallet: "maya" };
    const setGlobalData = vi.fn();
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={vi.fn()}
      globalData={data} setGlobalData={setGlobalData} showToast={vi.fn()} />);
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
      const setGlobalData = vi.fn();
      const onClose = vi.fn();
      render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={onClose}
        globalData={data} setGlobalData={setGlobalData} showToast={vi.fn()} />);
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
      globalData={data} setGlobalData={vi.fn()} showToast={vi.fn()} />);
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
    const setGlobalData = vi.fn();
    const props = { isOpen: true, initialType: 'transfer' as const, onClose: vi.fn(),
      globalData: data, setGlobalData, showToast: vi.fn() };
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
    const setGlobalData = vi.fn();
    render(<HistoricalLedgerModal isOpen initialType="transfer" onClose={onClose}
      globalData={makeData()} setGlobalData={setGlobalData} showToast={vi.fn()} />);
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
        setGlobalData={vi.fn()}
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
