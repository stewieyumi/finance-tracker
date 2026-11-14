import { AppSettings, Deduction, WalletState } from "../types/finance";
import {
  calculateNetSalary,
  getDefaultExpenseWalletId,
  getDefaultTransferWallets,
  resolveActiveWalletDefault,
  validateActiveWalletAssignment,
} from "./financeHelpers";

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
  grossPerPayoutSalary: number;
  salaryDeductions: Deduction[];
  milestoneWallet: string;
  theme: "dark" | "light" | "system";
  baseLivingAllowance: number;
  livingWallet: string;
  baseSavingsTarget: number;
  savingsWallet: string;
  defaultTransitAllocation: number;
  transitWallet: string;
  defaultWallet: string;
  transferFromWallet: string;
  transferToWallet: string;
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
  const grossPerPayoutSalary =
    settings?.grossPerPayoutSalary !== undefined
      ? Math.max(0, Number(settings.grossPerPayoutSalary) || 0)
      : Math.max(0, Number(settings?.perPayoutSalary) || 0);

  const salaryDeductions = (settings?.salaryDeductions || []).map(d => ({
    id: d.id,
    name: d.name,
    type: d.type,
    value: Number(d.value) || 0,
  }));

  const activeWallets = settings?.customWallets || [];
  const activeDefault = resolveActiveWalletDefault(settings, wallets);
  const resolveSettingWallet = (id: string | undefined, legacyFallback: string) => {
    if (!id || id.trim() === "") return activeDefault || legacyFallback;
    // If active customWallets is not configured (e.g. unmigrated settings), retain existing/fallback
    if (activeWallets.length === 0) return id || legacyFallback;
    const validation = validateActiveWalletAssignment(id, settings, wallets);
    if (validation.ok) return validation.walletId;
    return id || activeDefault || legacyFallback;
  };

  return {
    goalName: settings?.goalName || "",
    targetFund: settings?.targetFund || 0,
    paydayDays: settings?.paydayDays ? [...settings.paydayDays] : [],
    grossPerPayoutSalary,
    salaryDeductions,
    theme: settings?.theme || "dark",
    milestoneWallet: resolveSettingWallet(settings?.milestoneWallet, "bpi"),
    baseLivingAllowance: settings?.baseLivingAllowance ?? 2500,
    livingWallet: resolveSettingWallet(settings?.livingWallet, "gcash"),
    baseSavingsTarget: settings?.baseSavingsTarget ?? 1000,
    savingsWallet: resolveSettingWallet(settings?.savingsWallet, "bpi"),
    defaultTransitAllocation: settings?.defaultTransitAllocation ?? 1500,
    transitWallet: resolveSettingWallet(settings?.transitWallet, "gotyme"),
    defaultWallet: resolveSettingWallet(settings?.defaultWallet, "main"),
    transferFromWallet: settings?.customWallets?.find(wallet => wallet.id === settings.transferFromWallet)?.id || "",
    transferToWallet: getDefaultTransferWallets(settings).destinationWallet,
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
  const gross = Math.max(0, Number(form.grossPerPayoutSalary) || 0);
  const deductions: Deduction[] = (form.salaryDeductions || []).map(d => ({
    id: d.id,
    name: d.name,
    type: d.type === "percentage" ? "percentage" : "fixed",
    value: Math.max(0, Number(d.value) || 0),
  }));

  const netSalary = calculateNetSalary(gross, deductions);

  return {
    ...(settings || {}),
    targetFund: Number(form.targetFund),
    paydayDays: form.paydayDays,
    grossPerPayoutSalary: gross,
    salaryDeductions: deductions,
    perPayoutSalary: netSalary,
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
    transferFromWallet: settings?.customWallets?.find(wallet => wallet.id === form.transferFromWallet)?.id || undefined,
    transferToWallet: getDefaultTransferWallets({ ...settings, ...form }).destinationWallet || undefined,
    expenseWallets: form.expenseWallets,
    inflowsLabel: form.inflowsLabel,
    gigsLabel: form.gigsLabel,
    inflowCategories: form.inflowCategories,
    gigCategories: form.gigCategories,
    walletLabels: form.walletLabels,
  };
}
