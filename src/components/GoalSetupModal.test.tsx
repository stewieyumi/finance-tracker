import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { GoalSetupModal } from "./GoalSetupModal";
import { UnifiedFinanceData } from "../types/finance";

const createMockData = (overrides: Partial<UnifiedFinanceData> = {}): UnifiedFinanceData => ({
  wallets: {
    main: 1000,
    bpi: 4000,
    gcash: 2000,
  },
  library: {
    bills: [],
    receivables: [],
    shoots: [],
    manualTransactions: [],
  },
  logs: {},
  settings: {
    goalName: "Vacation Fund",
    targetFund: 20000,
    milestoneWallet: "bpi",
    theme: "dark",
    baseLivingAllowance: 2500,
    livingWallet: "gcash",
    baseSavingsTarget: 1000,
    savingsWallet: "bpi",
    defaultTransitAllocation: 1500,
    transitWallet: "gotyme",
    defaultWallet: "main",
    paydayDays: [15, 30],
    expenseWallets: {},
    inflowsLabel: "RECEIVABLES & INFLOWS",
    gigsLabel: "UPCOMING SHOOTS & GIGS",
    inflowCategories: [],
    gigCategories: [],
    walletLabels: {},
    customWallets: [
      { id: "main", label: "Main Wallet" },
      { id: "bpi", label: "BPI" },
      { id: "gcash", label: "GCash" },
    ],
  },
  ...overrides,
});

describe("GoalSetupModal", () => {
  it("1. renders goal fields", () => {
    const data = createMockData();
    render(
      <GoalSetupModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={data}
        setGlobalData={vi.fn()}
      />
    );

    expect(screen.getByText("Milestone Goal Setup")).toBeInTheDocument();
    expect(screen.getByLabelText(/goal name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/linked wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save goal/i })).toBeInTheDocument();
  });

  it("2. loads existing goal values", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        goalName: "Japan ADB Milestone",
        targetFund: 85000,
        milestoneWallet: "main",
      },
    });

    render(
      <GoalSetupModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={data}
        setGlobalData={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Japan ADB Milestone")).toBeInTheDocument();
    expect(screen.getByDisplayValue("85000")).toBeInTheDocument();
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("main");
  });

  it("3. updates goal fields locally", () => {
    const data = createMockData();
    render(
      <GoalSetupModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={data}
        setGlobalData={vi.fn()}
      />
    );

    const goalNameInput = screen.getByDisplayValue("Vacation Fund");
    const targetAmountInput = screen.getByDisplayValue("20000");
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    fireEvent.change(goalNameInput, { target: { value: "New Camera Lens" } });
    fireEvent.change(targetAmountInput, { target: { value: "45000" } });
    fireEvent.change(select, { target: { value: "gcash" } });

    expect(goalNameInput).toHaveValue("New Camera Lens");
    expect(targetAmountInput).toHaveValue(45000);
    expect(select.value).toBe("gcash");
  });

  it("4. save persists goal values", () => {
    const data = createMockData();
    const setGlobalData = vi.fn();
    const onClose = vi.fn();

    render(
      <GoalSetupModal
        isOpen={true}
        onClose={onClose}
        globalData={data}
        setGlobalData={setGlobalData}
      />
    );

    fireEvent.change(screen.getByDisplayValue("Vacation Fund"), {
      target: { value: "Emergency Fund" },
    });
    fireEvent.change(screen.getByDisplayValue("20000"), {
      target: { value: "100000" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "gcash" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save goal/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setGlobalData).toHaveBeenCalledTimes(1);

    const updater = setGlobalData.mock.calls[0][0];
    const updated = updater(data);
    expect(updated.settings.goalName).toBe("Emergency Fund");
    expect(updated.settings.targetFund).toBe(100000);
    expect(updated.settings.milestoneWallet).toBe("gcash");
  });

  it("5. save preserves unrelated settings", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        baseLivingAllowance: 9876,
        paydayDays: [5, 20],
        theme: "light",
      },
    });
    const setGlobalData = vi.fn();

    render(
      <GoalSetupModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={data}
        setGlobalData={setGlobalData}
      />
    );

    fireEvent.change(screen.getByDisplayValue("Vacation Fund"), {
      target: { value: "MacBook Pro" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save goal/i }));

    const updater = setGlobalData.mock.calls[0][0];
    const updated = updater(data);

    expect(updated.settings.goalName).toBe("MacBook Pro");
    expect(updated.settings.baseLivingAllowance).toBe(9876);
    expect(updated.settings.paydayDays).toEqual([5, 20]);
    expect(updated.settings.theme).toBe("light");
  });

  it("6. cancel does not persist", () => {
    const data = createMockData();
    const setGlobalData = vi.fn();
    const onClose = vi.fn();

    render(
      <GoalSetupModal
        isOpen={true}
        onClose={onClose}
        globalData={data}
        setGlobalData={setGlobalData}
      />
    );

    fireEvent.change(screen.getByDisplayValue("Vacation Fund"), {
      target: { value: "Discarded Goal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("7. X/backdrop/Escape do not persist", () => {
    const data = createMockData();
    const setGlobalData = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <GoalSetupModal
        isOpen={true}
        onClose={onClose}
        globalData={data}
        setGlobalData={setGlobalData}
      />
    );

    // Test X button
    fireEvent.change(screen.getByDisplayValue("Vacation Fund"), {
      target: { value: "Discarded X" },
    });
    fireEvent.click(screen.getByRole("button", { name: /close goal setup modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setGlobalData).not.toHaveBeenCalled();

    // Test Escape key
    rerender(
      <GoalSetupModal
        isOpen={true}
        onClose={onClose}
        globalData={data}
        setGlobalData={setGlobalData}
      />
    );
    fireEvent.change(screen.getByDisplayValue("Vacation Fund"), {
      target: { value: "Discarded Esc" },
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(setGlobalData).not.toHaveBeenCalled();

    // Test Backdrop click
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("8. reopening modal reflects current globalData settings", () => {
    const initialData = createMockData({
      settings: {
        ...createMockData().settings!,
        goalName: "Initial Goal",
        targetFund: 10000,
      },
    });
    const onClose = vi.fn();

    const { rerender } = render(
      <GoalSetupModal
        isOpen={true}
        onClose={onClose}
        globalData={initialData}
        setGlobalData={vi.fn()}
      />
    );

    // Edit without saving
    fireEvent.change(screen.getByDisplayValue("Initial Goal"), {
      target: { value: "Dirty Unsaved Draft" },
    });
    expect(screen.getByDisplayValue("Dirty Unsaved Draft")).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // Reopen modal with updated data
    const updatedData = createMockData({
      settings: {
        ...createMockData().settings!,
        goalName: "Updated External Goal",
        targetFund: 50000,
      },
    });

    rerender(
      <GoalSetupModal
        isOpen={false}
        onClose={onClose}
        globalData={updatedData}
        setGlobalData={vi.fn()}
      />
    );

    rerender(
      <GoalSetupModal
        isOpen={true}
        onClose={onClose}
        globalData={updatedData}
        setGlobalData={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Updated External Goal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Dirty Unsaved Draft")).not.toBeInTheDocument();
  });

  it("9. unrelated globalData change while modal is OPEN does not overwrite active unsaved draft", () => {
    const initialData = createMockData({
      settings: {
        ...createMockData().settings!,
        goalName: "Initial Goal",
        targetFund: 10000,
        baseLivingAllowance: 2500,
      },
    });

    const { rerender } = render(
      <GoalSetupModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={initialData}
        setGlobalData={vi.fn()}
      />
    );

    // User types an active unsaved draft
    const input = screen.getByDisplayValue("Initial Goal");
    fireEvent.change(input, { target: { value: "Active Unsaved Draft" } });
    expect(screen.getByDisplayValue("Active Unsaved Draft")).toBeInTheDocument();

    // Parent re-renders while modal is STILL OPEN with a new globalData reference / unrelated change
    const updatedUnrelatedData = createMockData({
      settings: {
        ...createMockData().settings!,
        goalName: "Initial Goal",
        targetFund: 10000,
        baseLivingAllowance: 5000,
      },
      wallets: {
        ...createMockData().wallets,
        main: 9999,
      },
    });

    rerender(
      <GoalSetupModal
        isOpen={true}
        onClose={vi.fn()}
        globalData={updatedUnrelatedData}
        setGlobalData={vi.fn()}
      />
    );

    // Active unsaved draft must NOT be overwritten
    expect(screen.getByDisplayValue("Active Unsaved Draft")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Initial Goal")).not.toBeInTheDocument();
  });
});
