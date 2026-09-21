import { AppSettings, WalletState } from "../types/finance";
import { getDefaultExpenseWalletId } from "./financeHelpers";

export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Transport",
  "Utilities",
  "Laundry & Home",
  "Shopping",
  "Other",
] as const;

export interface SettingsForm {
  goalName: string;
  targetFund: number;
  paydayDays: number[];
  milestoneWallet: string;
  theme: "dark" | "light" | "system";
  baseLivingAllowance: number;
  livingWallet: string;
  baseSavingsTarget: number;
  savingsWallet: string;
  defaultTransitAllocation: number;
  transitWallet: string;
  defaultWallet: string;
  expenseWallets: Record<string, string>;
  inflowsLabel: string;
  gigsLabel: string;
  inflowCategories: string[];
  gigCategories: string[];
  walletLabels: Record<string, string>;
}

const DEFAULT_WALLET_LABELS = {
  maribank: "MariBank",
  gcash: "GCash",
  maya: "Maya",
  gotyme: "GoTyme",
  bpi: "BPI",
  cash: "Cash On-Hand",
};

export function createSettingsForm(
  settings?: AppSettings,
  wallets?: WalletState,
  defaults?: {
    inflowCategories: string[];
    gigCategories: string[];
  }
): SettingsForm {
  return {
    goalName: settings?.goalName || "",
    targetFund: settings?.targetFund || 0,
    paydayDays: settings?.paydayDays || [15, 30],
    theme: settings?.theme || "dark",
    milestoneWallet: settings?.milestoneWallet || "bpi",
    baseLivingAllowance: settings?.baseLivingAllowance ?? 2500,
    livingWallet: settings?.livingWallet || "gcash",
    baseSavingsTarget: settings?.baseSavingsTarget ?? 1000,
    savingsWallet: settings?.savingsWallet || "bpi",
    defaultTransitAllocation: settings?.defaultTransitAllocation ?? 1500,
    transitWallet: settings?.transitWallet || "gotyme",
    defaultWallet: settings?.defaultWallet || "main",
    expenseWallets: Object.fromEntries(
      EXPENSE_CATEGORIES.map(category => [
        category,
        settings?.expenseWallets?.[category] ||
          getDefaultExpenseWalletId(category, settings, wallets),
      ])
    ),
    inflowsLabel: settings?.inflowsLabel || "RECEIVABLES & INFLOWS",
    gigsLabel: settings?.gigsLabel || "UPCOMING SHOOTS & GIGS",
    inflowCategories: settings?.inflowCategories?.length
      ? settings.inflowCategories
      : defaults?.inflowCategories || [],
    gigCategories: settings?.gigCategories?.length
      ? settings.gigCategories
      : defaults?.gigCategories || [],
    walletLabels: settings?.walletLabels || { ...DEFAULT_WALLET_LABELS },
  };
}

export function applySettingsForm(
  settings: AppSettings | undefined,
  form: SettingsForm
): AppSettings {
  return {
    ...(settings || {}),
    targetFund: Number(form.targetFund),
    paydayDays: form.paydayDays,
    goalName: form.goalName,
    milestoneWallet: form.milestoneWallet,
    theme: form.theme,
    baseLivingAllowance: Number(form.baseLivingAllowance),
    livingWallet: form.livingWallet,
    baseSavingsTarget: Number(form.baseSavingsTarget),
    savingsWallet: form.savingsWallet,
    defaultTransitAllocation: Number(form.defaultTransitAllocation),
    transitWallet: form.transitWallet,
    defaultWallet: form.defaultWallet,
    expenseWallets: form.expenseWallets,
    inflowsLabel: form.inflowsLabel,
    gigsLabel: form.gigsLabel,
    inflowCategories: form.inflowCategories,
    gigCategories: form.gigCategories,
    walletLabels: form.walletLabels,
  };
}
