import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SettingsModal } from "./SettingsModal";
import { UnifiedFinanceData } from "../types/finance";

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

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

describe("SettingsModal - Salary Gross & Deductions", () => {
  it("displays legacy perPayoutSalary as initial gross and net with no deductions", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        perPayoutSalary: 18000,
      },
    });

    renderSettingsModal(data);

    const grossInput = screen.getByRole("spinbutton", { name: /gross salary \/ pay period/i }) as HTMLInputElement;
    expect(grossInput.value).toBe("18000");

    expect(screen.getByTestId("salary-gross-display")).toHaveTextContent("₱18,000.00");
    expect(screen.getByTestId("salary-deductions-display")).toHaveTextContent("-₱0.00");
    expect(screen.getByTestId("salary-net-display")).toHaveTextContent("₱18,000.00");
    expect(screen.getByText(/no deductions configured/i)).toBeInTheDocument();
  });

  it("updates gross and net in real time when gross salary input changes", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        perPayoutSalary: 15000,
      },
    });

    renderSettingsModal(data);

    const grossInput = screen.getByRole("spinbutton", { name: /gross salary \/ pay period/i });
    fireEvent.change(grossInput, { target: { value: "30000" } });

    expect(screen.getByTestId("salary-gross-display")).toHaveTextContent("₱30,000.00");
    expect(screen.getByTestId("salary-net-display")).toHaveTextContent("₱30,000.00");
  });

  it("adds a fixed deduction and recalculates net salary in real time", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        perPayoutSalary: 25000,
      },
    });

    renderSettingsModal(data);

    const addDeductionBtn = screen.getByRole("button", { name: /add deduction/i });
    fireEvent.click(addDeductionBtn);

    const nameInput = screen.getByRole("textbox", { name: "Deduction name" });
    const valueInput = screen.getByRole("spinbutton", { name: "Deduction value" });

    fireEvent.change(nameInput, { target: { value: "Income Tax" } });
    fireEvent.change(valueInput, { target: { value: "2500" } });

    expect(screen.getByTestId("salary-deductions-display")).toHaveTextContent("-₱2,500.00");
    expect(screen.getByTestId("salary-net-display")).toHaveTextContent("₱22,500.00");
  });

  it("adds a percentage deduction and calculates correct deduction amount from gross", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        perPayoutSalary: 20000,
      },
    });

    renderSettingsModal(data);

    const addDeductionBtn = screen.getByRole("button", { name: /add deduction/i });
    fireEvent.click(addDeductionBtn);

    const typeSelect = screen.getByRole("combobox", { name: "Deduction type" });
    const valueInput = screen.getByRole("spinbutton", { name: "Deduction value" });

    fireEvent.change(typeSelect, { target: { value: "percentage" } });
    fireEvent.change(valueInput, { target: { value: "10" } });

    // 10% of 20000 is 2000 -> net is 18000
    expect(screen.getByTestId("salary-deductions-display")).toHaveTextContent("-₱2,000.00");
    expect(screen.getByTestId("salary-net-display")).toHaveTextContent("₱18,000.00");
  });

  it("removes a deduction and restores net salary", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        grossPerPayoutSalary: 20000,
        salaryDeductions: [
          { id: "d-tax", name: "Tax", type: "fixed", value: 3000 },
        ],
        perPayoutSalary: 17000,
      },
    });

    renderSettingsModal(data);

    expect(screen.getByTestId("salary-deductions-display")).toHaveTextContent("-₱3,000.00");
    expect(screen.getByTestId("salary-net-display")).toHaveTextContent("₱17,000.00");

    const removeBtn = screen.getByRole("button", { name: "Remove Tax" });
    fireEvent.click(removeBtn);

    expect(screen.getByTestId("salary-deductions-display")).toHaveTextContent("-₱0.00");
    expect(screen.getByTestId("salary-net-display")).toHaveTextContent("₱20,000.00");
    expect(screen.getByText(/no deductions configured/i)).toBeInTheDocument();
  });

  it("persists gross, deductions, and calculated net on save", () => {
    const data = createMockData({
      settings: {
        ...createMockData().settings!,
        perPayoutSalary: 20000,
      },
    });

    const { setGlobalData, onClose } = renderSettingsModal(data);

    const grossInput = screen.getByRole("spinbutton", { name: /gross salary \/ pay period/i });
    fireEvent.change(grossInput, { target: { value: "30000" } });

    const addDeductionBtn = screen.getByRole("button", { name: /add deduction/i });
    fireEvent.click(addDeductionBtn);

    const nameInput = screen.getByRole("textbox", { name: "Deduction name" });
    const typeSelect = screen.getByRole("combobox", { name: "Deduction type" });
    const valueInput = screen.getByRole("spinbutton", { name: "Deduction value" });

    fireEvent.change(nameInput, { target: { value: "Withholding" } });
    fireEvent.change(typeSelect, { target: { value: "percentage" } });
    fireEvent.change(valueInput, { target: { value: "10" } });

    const saveButton = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveButton);

    expect(onClose).toHaveBeenCalled();
    const saved = extractSavedSettings(setGlobalData, data);
    expect(saved.grossPerPayoutSalary).toBe(30000);
    expect(saved.salaryDeductions).toEqual([
      expect.objectContaining({
        name: "Withholding",
        type: "percentage",
        value: 10,
      }),
    ]);
    expect(saved.perPayoutSalary).toBe(27000);
  });
});

describe("SettingsModal - Theme Live-Preview & Persistence", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("light", "dark");
  });

  it("selecting Light immediately previews Light without saving", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const { setGlobalData } = renderSettingsModal(data);

    // Initial state is dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Click Light
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);

    // Immediately previews Light
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Does not save prematurely
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("selecting Dark immediately previews Dark without saving", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "light" },
    });

    const { setGlobalData } = renderSettingsModal(data);

    // Initial state is light
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // Click Dark
    const darkBtn = screen.getByRole("button", { name: /^dark$/i });
    fireEvent.click(darkBtn);

    // Immediately previews Dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);

    // Does not save prematurely
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("selecting System applies system theme behavior", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false, // system is light
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const data = createMockData({
        settings: { ...createMockData().settings!, theme: "dark" },
      });

      renderSettingsModal(data);

      const systemBtn = screen.getByRole("button", { name: /^system$/i });
      fireEvent.click(systemBtn);

      // System preference was mocked as light (matches: false)
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("cancelling restores the original saved theme", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const { onClose, setGlobalData } = renderSettingsModal(data);

    // User previews Light
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // User clicks Cancel
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);

    // Restores original saved theme (dark)
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("closing via close button (X) restores the original saved theme", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const { onClose, setGlobalData } = renderSettingsModal(data);

    // User previews Light
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // User clicks close button X
    const closeBtn = screen.getByRole("button", { name: /close settings modal/i });
    fireEvent.click(closeBtn);

    // Restores original saved theme (dark)
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("closing via Escape key restores the original saved theme without saving", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const { onClose, setGlobalData } = renderSettingsModal(data);

    // Initial state is dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // User previews Light
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // User presses Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // Restores original saved theme (dark)
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("closing via backdrop click restores the original saved theme without saving", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const { onClose, setGlobalData } = renderSettingsModal(data);

    // Initial state is dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // User previews Light
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // Click the backdrop itself
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);

    // Restores original saved theme (dark)
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setGlobalData).not.toHaveBeenCalled();
  });

  it("saving preserves the selected theme", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const { onClose, setGlobalData } = renderSettingsModal(data);

    // User selects Light
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);

    // User clicks Save Settings
    const saveBtn = screen.getByRole("button", { name: /save settings/i });
    fireEvent.click(saveBtn);

    // Theme remains Light (not rolled back)
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    expect(onClose).toHaveBeenCalled();
    const saved = extractSavedSettings(setGlobalData, data);
    expect(saved.theme).toBe("light");
  });

  it("reopening the modal starts from the saved theme rather than the previous unsaved preview", () => {
    const data = createMockData({
      settings: { ...createMockData().settings!, theme: "dark" },
    });

    const firstRender = renderSettingsModal(data);

    // Preview Light, then cancel
    const lightBtn = screen.getByRole("button", { name: /^light$/i });
    fireEvent.click(lightBtn);
    expect(document.documentElement.classList.contains("light")).toBe(true);

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    firstRender.onClose();

    // Reopen modal: render a new instance with the still-saved data (theme: "dark")
    renderSettingsModal(data);

    // Observable behavior: document stays dark, Dark button is active
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    const darkBtn = screen.getAllByRole("button", { name: /^dark$/i })[0];
    expect(darkBtn).toHaveClass("bg-blue-600");

    const lightBtnReopened = screen.getAllByRole("button", { name: /^light$/i })[0];
    expect(lightBtnReopened).not.toHaveClass("bg-blue-600");
  });

  it("no longer renders Main Milestone Goal controls on the General tab", () => {
    const data = createMockData();
    renderSettingsModal(data, { initialTab: "general" });

    expect(screen.queryByText(/main milestone goal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/goal name/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\. japan trip/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/target amount \(₱\)/i)).not.toBeInTheDocument();
  });

  it("renders with dialog accessibility", () => {
    const data = createMockData();
    renderSettingsModal(data);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "App Settings");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("does not close on click inside modal content", () => {
    const data = createMockData();
    const { onClose } = renderSettingsModal(data);
    fireEvent.click(screen.getByText("App Settings"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SettingsModal - Sync & Maintenance Actions", () => {
  it("invokes sync and backup callbacks without closing the modal", () => {
    const data = createMockData();
    const onForcePush = vi.fn();
    const onForcePull = vi.fn();
    const onExport = vi.fn();
    const onImportClick = vi.fn();

    const { onClose } = renderSettingsModal(data, {
      initialTab: "sync",
      onForcePush,
      onForcePull,
      onExport,
      onImportClick,
    });

    const pushBtn = screen.getByRole("button", { name: /push data/i });
    const pullBtn = screen.getByRole("button", { name: /pull data/i });
    const exportBtn = screen.getByRole("button", { name: /export json backup/i });
    const importBtn = screen.getByRole("button", { name: /import json backup/i });

    fireEvent.click(pushBtn);
    expect(onForcePush).toHaveBeenCalledTimes(1);

    fireEvent.click(pullBtn);
    expect(onForcePull).toHaveBeenCalledTimes(1);

    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledTimes(1);

    fireEvent.click(importBtn);
    expect(onImportClick).toHaveBeenCalledTimes(1);

    expect(onClose).not.toHaveBeenCalled();
  });

  describe("Legacy Bill Migration confirmation", () => {
    it("does not migrate when confirmation is cancelled", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const data = createMockData();

      const { setGlobalData } = renderSettingsModal(data, { initialTab: "sync" });

      const migrateBtn = screen.getByRole("button", { name: /force legacy bill migration/i });
      fireEvent.click(migrateBtn);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(setGlobalData).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it("triggers migration and alerts when confirmation is accepted", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const data = createMockData();

      const { setGlobalData } = renderSettingsModal(data, { initialTab: "sync" });

      const migrateBtn = screen.getByRole("button", { name: /force legacy bill migration/i });
      fireEvent.click(migrateBtn);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(setGlobalData).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledTimes(1);

      confirmSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });
});
