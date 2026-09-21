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
    expect(form.paydayDays).toEqual([15, 30]);
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
