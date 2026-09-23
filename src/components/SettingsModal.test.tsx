import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";
import { UnifiedFinanceData } from "../types/finance";

const createMockData = (overrides: Partial<UnifiedFinanceData> = {}): UnifiedFinanceData => ({
  wallets: {
    main: 1000,
    gcash: 2000,
    maya: 3000,
    bpi: 4000,
    gotyme: 5000,
    cash: 500,
    maribank: 0,
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
      { id: "maya", label: "Maya" },
      { id: "gotyme", label: "GoTyme" },
    ],
  },
  ...overrides,
});

const renderSettingsModal = (
  globalData: UnifiedFinanceData,
  overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {}
) => {
  const setGlobalData = vi.fn();
  const onClose = vi.fn();

  render(
    <SettingsModal
      isOpen={true}
      initialTab="baselines"
      onClose={onClose}
      globalData={globalData}
      setGlobalData={setGlobalData}
      totalLiquid={10000}
      debugLog=""
      onForcePush={vi.fn()}
      onForcePull={vi.fn()}
      onExport={vi.fn()}
      onImportClick={vi.fn()}
      {...overrides}
    />
  );

  return { setGlobalData, onClose };
};

const extractSavedSettings = (setGlobalData: ReturnType<typeof vi.fn>, initialData: UnifiedFinanceData) => {
  expect(setGlobalData).toHaveBeenCalled();
  const updater = setGlobalData.mock.calls.at(-1)?.[0];
  expect(updater).toEqual(expect.any(Function));
  const updatedData = updater(initialData);
  return updatedData.settings;
};

describe("SettingsModal - Custom Payday Configuration", () => {
  it("displays System Default state when paydayDays is an empty array []", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [] },
    });

    renderSettingsModal(data);

    expect(screen.getByText("System Default")).toBeInTheDocument();
    expect(screen.getByText(/15th and 30th of each month/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove payday/i })).not.toBeInTheDocument();
  });

  it("displays System Default state when paydayDays is undefined", () => {
    const initialData = createMockData();
    delete initialData.settings!.paydayDays;

    renderSettingsModal(initialData);

    expect(screen.getByText("System Default")).toBeInTheDocument();
    expect(screen.getByText(/15th and 30th of each month/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove payday/i })).not.toBeInTheDocument();
  });

  it("adds a custom payday from the selector and removes System Default UI", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [] },
    });

    renderSettingsModal(data);

    expect(screen.getByText("System Default")).toBeInTheDocument();

    const select = screen.getByRole("combobox", { name: /select payday day/i });
    fireEvent.change(select, { target: { value: "5" } });

    const addButton = screen.getByRole("button", { name: "Add" });
    fireEvent.click(addButton);

    expect(screen.getByText("5th")).toBeInTheDocument();
    expect(screen.queryByText("System Default")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove payday 5" })).toBeInTheDocument();
  });

  it("adds multiple custom paydays and keeps them sorted numerically", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [] },
    });

    renderSettingsModal(data);

    const select = screen.getByRole("combobox", { name: /select payday day/i });
    const addButton = screen.getByRole("button", { name: "Add" });

    // Add 25th, then 5th, then 10th
    fireEvent.change(select, { target: { value: "25" } });
    fireEvent.click(addButton);

    fireEvent.change(select, { target: { value: "5" } });
    fireEvent.click(addButton);

    fireEvent.change(select, { target: { value: "10" } });
    fireEvent.click(addButton);

    expect(screen.getByTestId("payday-chip-5")).toBeInTheDocument();
    expect(screen.getByTestId("payday-chip-10")).toBeInTheDocument();
    expect(screen.getByTestId("payday-chip-25")).toBeInTheDocument();

    const chips = screen.getAllByTestId(/^payday-chip-/);
    const chipValues = chips.map(el => el.getAttribute("data-testid"));
    expect(chipValues).toEqual(["payday-chip-5", "payday-chip-10", "payday-chip-25"]);
  });

  it("prevents duplicate paydays both in UI selector and on add", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [15] },
    });

    renderSettingsModal(data);

    // Verify option 15 is disabled in the dropdown
    const select = screen.getByRole("combobox", { name: /select payday day/i }) as HTMLSelectElement;
    const option15 = Array.from(select.options).find(opt => opt.value === "15");
    expect(option15?.disabled).toBe(true);

    // Attempt to set value to 15 and click add
    fireEvent.change(select, { target: { value: "15" } });
    const addButton = screen.getByRole("button", { name: "Add" });
    expect(addButton).toBeDisabled();

    fireEvent.click(addButton);

    // Only one 15th chip should exist
    const fifteenChips = screen.getAllByTestId("payday-chip-15");
    expect(fifteenChips.length).toBe(1);
  });

  it("removes a single custom payday while keeping others", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [5, 20] },
    });

    renderSettingsModal(data);

    expect(screen.getByTestId("payday-chip-5")).toBeInTheDocument();
    expect(screen.getByTestId("payday-chip-20")).toBeInTheDocument();

    const removeFive = screen.getByRole("button", { name: "Remove payday 5" });
    fireEvent.click(removeFive);

    expect(screen.queryByTestId("payday-chip-5")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove payday 5" })).not.toBeInTheDocument();
    expect(screen.getByTestId("payday-chip-20")).toBeInTheDocument();
  });

  it("removes the final custom payday and returns to System Default state", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [15] },
    });

    const { setGlobalData } = renderSettingsModal(data);

    expect(screen.getByTestId("payday-chip-15")).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: "Remove payday 15" });
    fireEvent.click(removeBtn);

    // Restores System Default UI
    expect(screen.queryByTestId("payday-chip-15")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove payday 15" })).not.toBeInTheDocument();
    expect(screen.getByText("System Default")).toBeInTheDocument();
    expect(screen.getByText(/15th and 30th of each month/i)).toBeInTheDocument();

    // Saving persists paydayDays as []
    const saveButton = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveButton);

    const savedSettings = extractSavedSettings(setGlobalData, data);
    expect(savedSettings.paydayDays).toEqual([]);
  });

  it("provides accessible aria-labels on remove controls and selector", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, paydayDays: [10, 25] },
    });

    renderSettingsModal(data);

    expect(screen.getByRole("combobox", { name: "Select payday day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove payday 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove payday 25" })).toBeInTheDocument();
  });

  it("persists custom payday configuration on save while preserving unrelated settings", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        goalName: "Preserved Goal",
        targetFund: 99999,
        baseLivingAllowance: 7777,
        paydayDays: [],
      },
    });

    const { setGlobalData, onClose } = renderSettingsModal(data);

    const select = screen.getByRole("combobox", { name: /select payday day/i });
    const addButton = screen.getByRole("button", { name: "Add" });

    fireEvent.change(select, { target: { value: "10" } });
    fireEvent.click(addButton);

    fireEvent.change(select, { target: { value: "25" } });
    fireEvent.click(addButton);

    const saveButton = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveButton);

    expect(onClose).toHaveBeenCalled();
    const saved = extractSavedSettings(setGlobalData, data);
    expect(saved.paydayDays).toEqual([10, 25]);
    expect(saved.goalName).toBe("Preserved Goal");
    expect(saved.targetFund).toBe(99999);
    expect(saved.baseLivingAllowance).toBe(7777);
    expect(saved.theme).toBe("dark");
  });

  it("allows adding more than 10 custom paydays without an arbitrary limit", () => {
    const tenDays = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        paydayDays: tenDays,
      },
    });

    renderSettingsModal(data);

    // Verify day 11 can be selected and added beyond 10 days
    const select = screen.getByRole("combobox", { name: /select payday day/i });
    fireEvent.change(select, { target: { value: "11" } });

    const addButton = screen.getByRole("button", { name: "Add" });
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton);

    expect(screen.getByTestId("payday-chip-11")).toBeInTheDocument();
    const chips = screen.getAllByTestId(/^payday-chip-/);
    expect(chips.length).toBe(11);
  });

  it("supports and persists a full 31-day configuration", () => {
    const all31Days = Array.from({ length: 31 }, (_, i) => i + 1);
    const dataWith31Days = createMockData({
      settings: {
        ...createMockData().settings!,
        paydayDays: all31Days,
      },
    });

    const { setGlobalData } = renderSettingsModal(dataWith31Days);

    const chips = screen.getAllByTestId(/^payday-chip-/);
    expect(chips.length).toBe(31);

    const saveButton = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveButton);

    const saved = extractSavedSettings(setGlobalData, dataWith31Days);
    expect(saved.paydayDays).toEqual(all31Days);
  });
});
