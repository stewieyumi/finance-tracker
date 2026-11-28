import { describe, expect, it } from "vitest";
import { readGoalProgress } from "./goalProgress";
import { isValidFinanceBackup } from "./validationHelpers";
import { applySettingsForm, createSettingsForm } from "./settingsForm";
import { applyWalletSavings } from "./walletSavings";
import type { UnifiedFinanceData } from "../types/finance";
const seed = (): UnifiedFinanceData => ({ wallets: { main: 1000, cash: 500 }, settings: { targetFund: 2000, defaultWallet: "main", customWallets: [{ id: "main", label: "Bank" }, { id: "cash", label: "Cash" }], walletSavings: { main: 200, cash: 400 }, savingsWalletIds: ["main", "cash"] }, library: { bills: [], receivables: [], expenses: [], shoots: [] }, logs: {} });
describe("linked goal progress", () => {
  it("preserves the default whole-wallet behavior and switches to the selected wallet's Savings only", () => {
    const data = seed(); const before = structuredClone(data);
    expect(readGoalProgress(data)).toMatchObject({ walletId: "main", amount: 1000, source: "balance", percent: "50.0", needsReview: false });
    data.settings!.milestoneWallet = "cash"; data.settings!.milestoneSource = "savings";
    expect(readGoalProgress(data)).toMatchObject({ walletId: "cash", amount: 400, source: "savings", percent: "20.0", needsReview: false });
    expect(data.wallets).toEqual(before.wallets); expect(data.settings!.walletSavings).toEqual(before.settings!.walletSavings);
  });
  it("updates from real Savings changes without duplicating funds and survives unrelated settings saves", () => {
    const data = seed(); data.settings!.milestoneWallet = "cash"; data.settings!.milestoneSource = "savings";
    const result = applyWalletSavings(data, "cash", 450, { balance: 500, savings: 400 });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.data.wallets).toBe(data.wallets); expect(readGoalProgress(result.data).amount).toBe(450);
    const settings = applySettingsForm(result.data.settings, { ...createSettingsForm(result.data.settings, result.data.wallets), theme: "light" });
    expect(settings.milestoneSource).toBe("savings");
    expect(readGoalProgress({ ...result.data, settings }).percent).toBe("22.5");
  });
  it("caps stale Savings at remaining wallet cash and flags invalid or missing data", () => {
    const data = seed(); data.settings!.milestoneSource = "savings"; data.wallets.main = 50;
    expect(readGoalProgress(data)).toMatchObject({ amount: 50, needsReview: true });
    data.wallets.main = -5; expect(readGoalProgress(data).amount).toBe(0);
    data.settings!.walletSavings!.main = NaN; expect(readGoalProgress(data)).toMatchObject({ amount: 0, needsReview: true });
    data.settings!.milestoneWallet = "missing"; expect(readGoalProgress(data).needsReview).toBe(true);
  });
  it("round-trips the optional source in backups while rejecting unknown source modes", () => {
    const data = seed(); expect(isValidFinanceBackup(data)).toBe(true);
    data.settings!.milestoneSource = "savings"; const copied = JSON.parse(JSON.stringify(data));
    expect(isValidFinanceBackup(copied)).toBe(true); expect(readGoalProgress(copied).amount).toBe(200);
    copied.settings.milestoneSource = "other"; expect(isValidFinanceBackup(copied)).toBe(false);
  });
});
