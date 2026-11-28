import type { UnifiedFinanceData } from "../types/finance";
import { DEFAULT_TARGET_FUND } from "../constants/config";
import { expenseCents } from "./expenseChanges";
import { parseWalletBalance, resolveActiveWalletDefault, validateActiveWalletAssignment } from "./financeHelpers";
import { readWalletSavings } from "./walletSavings";

/** A goal observes existing money. Linking it never creates a reserve or moves funds. */
export function readGoalProgress(data: UnifiedFinanceData, target = data.settings?.targetFund ?? data.targetFund ?? DEFAULT_TARGET_FUND) {
  const walletId = data.settings?.milestoneWallet || resolveActiveWalletDefault(data.settings, data.wallets);
  const source = data.settings?.milestoneSource === "savings" ? "savings" : "balance";
  const parsed = parseWalletBalance(data.wallets[walletId]);
  const funds = readWalletSavings(data, walletId);
  const walletLabel = data.settings?.customWallets?.find(wallet => wallet.id === walletId)?.label
    || data.settings?.archivedWallets?.find(wallet => wallet.id === walletId)?.label || data.settings?.walletLabels?.[walletId] || walletId || "No wallet selected";
  const amount = source === "savings" ? Math.min(funds.savings ?? 0, Math.max(0, funds.balance ?? 0)) : parsed.isValid ? parsed.balance : 0;
  const needsReview = !walletId || !parsed.isValid || !parsed.isPresent || expenseCents(target) === null ||
    (data.settings?.milestoneSource !== undefined && !["balance", "savings"].includes(data.settings.milestoneSource)) ||
    (source === "savings" && funds.needsReview) ||
    (!!data.settings?.customWallets?.length && !validateActiveWalletAssignment(walletId, data.settings, data.wallets).ok);
  return { walletId, walletLabel, source, amount, target, needsReview, percent: target > 0 && Number.isFinite(target) ? ((amount / target) * 100).toFixed(1) : "0.0" };
}
