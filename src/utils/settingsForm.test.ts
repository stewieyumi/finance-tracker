import { describe, expect, it } from "vitest";
import { AppSettings, WalletState } from "../types/finance";
import {
  applySettingsForm,
  createSettingsForm,
  EXPENSE_CATEGORIES,
  SettingsForm,
} from "./settingsForm";

describe("createSettingsForm", () => {
  it("loads configured settings into the form", () => {
    const settings: AppSettings = {
      goalName: "Japan Trip",
      targetFund: 50000,
      paydayDays: [10, 25],
      milestoneWallet: "bpi",
      theme: "light",
      baseLivingAllowance: 3000,
      livingWallet: "gcash",
      baseSavingsTarget: 2000,
      savingsWallet: "bpi",
      defaultTransitAllocation: 1200,
      transitWallet: "gotyme",
      defaultWallet: "maya",
      expenseWallets: {
        "Food & Dining": "gcash",
      },
      inflowsLabel: "Income",
      gigsLabel: "Projects",
      inflowCategories: ["Salary"],
      gigCategories: ["Shoot"],
      walletLabels: {
        maya: "My Maya",
      },
    };

    const wallets: WalletState = {
      gcash: 1000,
      maya: 2000,
      bpi: 3000,
      gotyme: 4000,
    };

    const form = createSettingsForm(settings, wallets);

    expect(form.goalName).toBe("Japan Trip");
    expect(form.targetFund).toBe(50000);
    expect(form.paydayDays).toEqual([10, 25]);
    expect(form.theme).toBe("light");
    expect(form.defaultWallet).toBe("maya");
    expect(form.expenseWallets["Food & Dining"]).toBe("gcash");
    expect(form.inflowsLabel).toBe("Income");
    expect(form.gigCategories).toEqual(["Shoot"]);
    expect(form.walletLabels).toEqual({ maya: "My Maya" });
  });

  it("uses expense-wallet defaults when a category is not configured", () => {
    const settings: AppSettings = {
      defaultWallet: "maya",
    };

    const wallets: WalletState = {
      maya: 1000,
      gcash: 500,
    };

    const form = createSettingsForm(settings, wallets);

    expect(Object.keys(form.expenseWallets)).toEqual(
      expect.arrayContaining([...EXPENSE_CATEGORIES])
    );
    expect(form.expenseWallets["Food & Dining"]).toBe("maya");
  });

  it("uses supplied category defaults when saved categories are missing", () => {
    const form = createSettingsForm(undefined, undefined, {
      inflowCategories: ["Salary", "Shoot"],
      gigCategories: ["Solo Shoot", "Video Edit"],
    });

    expect(form.inflowCategories).toEqual(["Salary", "Shoot"]);
    expect(form.gigCategories).toEqual(["Solo Shoot", "Video Edit"]);
  });

  it("uses the same fallback defaults as the existing settings form", () => {
    const form = createSettingsForm(undefined, undefined);

    expect(form.goalName).toBe("");
    expect(form.targetFund).toBe(0);
    expect(form.paydayDays).toEqual([]);
    expect(form.theme).toBe("dark");
    expect(form.milestoneWallet).toBe("bpi");
    expect(form.baseLivingAllowance).toBe(2500);
    expect(form.livingWallet).toBe("gcash");
    expect(form.baseSavingsTarget).toBe(1000);
    expect(form.savingsWallet).toBe("bpi");
    expect(form.defaultTransitAllocation).toBe(1500);
    expect(form.transitWallet).toBe("gotyme");
    expect(form.defaultWallet).toBe("main");
    expect(form.inflowCategories).toEqual([]);
    expect(form.gigCategories).toEqual([]);
  });

  it("handles empty and custom paydayDays correctly without mutating", () => {
    const emptyForm = createSettingsForm({ paydayDays: [] }, undefined);
    expect(emptyForm.paydayDays).toEqual([]);

    const customDays = [5, 20];
    const customForm = createSettingsForm({ paydayDays: customDays }, undefined);
    expect(customForm.paydayDays).toEqual([5, 20]);
    expect(customForm.paydayDays).not.toBe(customDays);
  });
});

describe("applySettingsForm", () => {
  it("updates editable settings while preserving unrelated settings", () => {
    const existing: AppSettings = {
      goalName: "Old Goal",
      perPayoutSalary: 15000,
      phpToJpyRate: 0.38,
      hasMigratedBaseWallets: true,
      customWallets: [
        {
          id: "custom",
          label: "Custom",
        },
      ],
    };

    const form: SettingsForm = createSettingsForm(existing, {
      main: 1000,
      maya: 2000,
    });

    form.goalName = "New Goal";
    form.targetFund = 25000;
    form.defaultWallet = "maya";

    const result = applySettingsForm(existing, form);

    expect(result.goalName).toBe("New Goal");
    expect(result.targetFund).toBe(25000);
    expect(result.defaultWallet).toBe("maya");
    expect(result.perPayoutSalary).toBe(15000);
    expect(result.phpToJpyRate).toBe(0.38);
    expect(result.hasMigratedBaseWallets).toBe(true);
    expect(result.customWallets).toEqual([
      {
        id: "custom",
        label: "Custom",
      },
    ]);
  });

  it("does not mutate the original settings", () => {
    const existing: AppSettings = {
      goalName: "Original",
      targetFund: 1000,
    };

    const form = createSettingsForm(existing, {
      main: 1000,
    });

    form.goalName = "Changed";

    const result = applySettingsForm(existing, form);

    expect(existing.goalName).toBe("Original");
    expect(result.goalName).toBe("Changed");
  });
});

describe("Salary & Deductions integration in settingsForm", () => {
  it("preserves perPayoutSalary for legacy settings without gross/deductions metadata", () => {
    const legacySettings: AppSettings = {
      perPayoutSalary: 18000,
    };

    const form = createSettingsForm(legacySettings);
    expect(form.grossPerPayoutSalary).toBe(18000);
    expect(form.salaryDeductions).toEqual([]);

    const result = applySettingsForm(legacySettings, form);
    expect(result.perPayoutSalary).toBe(18000);
    expect(result.grossPerPayoutSalary).toBe(18000);
    expect(result.salaryDeductions).toEqual([]);
  });

  it("produces identical net when gross salary has no deductions", () => {
    const existing: AppSettings = {};
    const form = createSettingsForm(existing);
    form.grossPerPayoutSalary = 25000;
    form.salaryDeductions = [];

    const result = applySettingsForm(existing, form);
    expect(result.grossPerPayoutSalary).toBe(25000);
    expect(result.salaryDeductions).toEqual([]);
    expect(result.perPayoutSalary).toBe(25000);
  });

  it("produces correct net with fixed deduction", () => {
    const existing: AppSettings = {};
    const form = createSettingsForm(existing);
    form.grossPerPayoutSalary = 25000;
    form.salaryDeductions = [
      { id: "d1", name: "Income Tax", type: "fixed", value: 3000 },
    ];

    const result = applySettingsForm(existing, form);
    expect(result.grossPerPayoutSalary).toBe(25000);
    expect(result.salaryDeductions).toEqual([
      { id: "d1", name: "Income Tax", type: "fixed", value: 3000 },
    ]);
    expect(result.perPayoutSalary).toBe(22000);
  });

  it("produces correct net with percentage deduction", () => {
    const existing: AppSettings = {};
    const form = createSettingsForm(existing);
    form.grossPerPayoutSalary = 25000;
    form.salaryDeductions = [
      { id: "d1", name: "Withholding Tax", type: "percentage", value: 10 },
    ];

    const result = applySettingsForm(existing, form);
    expect(result.grossPerPayoutSalary).toBe(25000);
    expect(result.salaryDeductions).toEqual([
      { id: "d1", name: "Withholding Tax", type: "percentage", value: 10 },
    ]);
    expect(result.perPayoutSalary).toBe(22500);
  });

  it("produces correct net with multiple deductions", () => {
    const existing: AppSettings = {};
    const form = createSettingsForm(existing);
    form.grossPerPayoutSalary = 30000;
    form.salaryDeductions = [
      { id: "d1", name: "SSS", type: "fixed", value: 1125 },
      { id: "d2", name: "Tax", type: "percentage", value: 10 },
      { id: "d3", name: "PhilHealth", type: "fixed", value: 500 },
    ];

    const result = applySettingsForm(existing, form);
    expect(result.grossPerPayoutSalary).toBe(30000);
    // 30000 - (1125 + 3000 + 500) = 25375
    expect(result.perPayoutSalary).toBe(25375);
    expect(result.salaryDeductions?.length).toBe(3);
  });

  it("caps net at zero when deductions exceed gross salary", () => {
    const existing: AppSettings = {};
    const form = createSettingsForm(existing);
    form.grossPerPayoutSalary = 10000;
    form.salaryDeductions = [
      { id: "d1", name: "Big Deduction", type: "fixed", value: 15000 },
    ];

    const result = applySettingsForm(existing, form);
    expect(result.grossPerPayoutSalary).toBe(10000);
    expect(result.perPayoutSalary).toBe(0);
  });

  it("persists gross salary, deductions, and calculated net into perPayoutSalary", () => {
    const existing: AppSettings = {
      grossPerPayoutSalary: 20000,
      salaryDeductions: [
        { id: "d1", name: "SSS", type: "fixed", value: 1000 },
      ],
      perPayoutSalary: 19000,
    };

    const form = createSettingsForm(existing);
    expect(form.grossPerPayoutSalary).toBe(20000);
    expect(form.salaryDeductions).toEqual([
      { id: "d1", name: "SSS", type: "fixed", value: 1000 },
    ]);

    form.grossPerPayoutSalary = 25000;
    form.salaryDeductions.push({
      id: "d2",
      name: "PhilHealth",
      type: "fixed",
      value: 500,
    });

    const result = applySettingsForm(existing, form);
    expect(result.grossPerPayoutSalary).toBe(25000);
    expect(result.salaryDeductions).toEqual([
      { id: "d1", name: "SSS", type: "fixed", value: 1000 },
      { id: "d2", name: "PhilHealth", type: "fixed", value: 500 },
    ]);
    expect(result.perPayoutSalary).toBe(23500);
  });

  it("keeps existing unrelated settings unchanged when updating salary", () => {
    const existing: AppSettings = {
      goalName: "Vacation",
      targetFund: 75000,
      phpToJpyRate: 0.38,
      baseLivingAllowance: 4000,
      livingWallet: "gcash",
      theme: "light",
      customWallets: [{ id: "c1", label: "Custom 1" }],
    };

    const form = createSettingsForm(existing);
    form.grossPerPayoutSalary = 50000;
    form.salaryDeductions = [
      { id: "d1", name: "Tax", type: "percentage", value: 20 },
    ];

    const result = applySettingsForm(existing, form);
    expect(result.goalName).toBe("Vacation");
    expect(result.targetFund).toBe(75000);
    expect(result.phpToJpyRate).toBe(0.38);
    expect(result.baseLivingAllowance).toBe(4000);
    expect(result.livingWallet).toBe("gcash");
    expect(result.theme).toBe("light");
    expect(result.customWallets).toEqual([{ id: "c1", label: "Custom 1" }]);
    expect(result.grossPerPayoutSalary).toBe(50000);
    expect(result.perPayoutSalary).toBe(40000);
  });
});
