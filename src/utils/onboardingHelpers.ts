import { AppSettings, UnifiedFinanceData } from "../types/finance";

/**
 * Checks whether any user financial records exist in the dataset.
 */
export function hasFinancialData(data: UnifiedFinanceData): boolean {
  const lib = data.library;
  if (lib) {
    if (Array.isArray(lib.bills) && lib.bills.length > 0) return true;
    if (Array.isArray(lib.receivables) && lib.receivables.length > 0) return true;
    if (Array.isArray(lib.expenses) && lib.expenses.length > 0) return true;
    if (Array.isArray(lib.shoots) && lib.shoots.length > 0) return true;
    if (Array.isArray(lib.manualTransactions) && lib.manualTransactions.length > 0) return true;
  }

  // Payday executions
  if (Array.isArray(data.paydaySplitExecutions) && data.paydaySplitExecutions.length > 0) {
    return true;
  }

  // Monthly logs
  if (data.logs && typeof data.logs === "object" && Object.keys(data.logs).length > 0) {
    return true;
  }

  // Non-zero wallet balances
  if (data.wallets && typeof data.wallets === "object") {
    const hasNonZeroBalance = Object.values(data.wallets).some(
      bal => typeof bal === "number" && bal !== 0
    );
    if (hasNonZeroBalance) return true;
  }

  return false;
}

/**
 * Checks whether the user has customized settings beyond the stock INITIAL_UNIFIED_DATA template.
 * This guarantees that an existing user with no transactions or bills, but with legitimate
 * persisted settings/configuration, is safely recognized as a returning user.
 */
export function hasConfiguredSettings(settings?: AppSettings): boolean {
  if (!settings || typeof settings !== "object") return false;

  // Explicit completion flag
  if (settings.hasCompletedOnboarding === true) return true;

  // Customized milestone goal
  if (typeof settings.goalName === "string" && settings.goalName.trim() !== "") return true;
  if (typeof settings.targetFund === "number" && settings.targetFund > 0) return true;

  // Customized payday schedule
  if (Array.isArray(settings.paydayDays) && settings.paydayDays.length > 0) return true;

  // Customized salary or deductions
  if (typeof settings.grossPerPayoutSalary === "number" && settings.grossPerPayoutSalary > 0) return true;
  if (Array.isArray(settings.salaryDeductions) && settings.salaryDeductions.length > 0) return true;
  if (typeof settings.perPayoutSalary === "number" && settings.perPayoutSalary !== 15000) return true;

  // Customized theme
  if (settings.theme && settings.theme !== "dark") return true;

  // Customized baselines / allowances
  if (typeof settings.baseLivingAllowance === "number" && settings.baseLivingAllowance !== 2500) return true;
  if (typeof settings.baseSavingsTarget === "number" && settings.baseSavingsTarget !== 1000) return true;
  if (typeof settings.defaultTransitAllocation === "number" && settings.defaultTransitAllocation !== 1500) return true;

  // Custom labels or categories
  if (typeof settings.inflowsLabel === "string" && settings.inflowsLabel !== "RECEIVABLES & INFLOWS") return true;
  if (typeof settings.gigsLabel === "string" && settings.gigsLabel !== "UPCOMING SHOOTS & GIGS") return true;
  if (Array.isArray(settings.inflowCategories) && settings.inflowCategories.length > 0) return true;
  if (Array.isArray(settings.gigCategories) && settings.gigCategories.length > 0) return true;
  if (settings.walletLabels && Object.keys(settings.walletLabels).length > 0) return true;
  if (settings.expenseWallets && Object.keys(settings.expenseWallets).length > 0) return true;

  // Customized wallets (labels, count, or colors differing from the 3 stock defaults)
  if (Array.isArray(settings.customWallets)) {
    const isExactDefault =
      settings.customWallets.length === 3 &&
      settings.customWallets[0]?.id === "main" && settings.customWallets[0]?.label === "Main Account" &&
      settings.customWallets[1]?.id === "savings" && settings.customWallets[1]?.label === "Savings" &&
      settings.customWallets[2]?.id === "cash" && settings.customWallets[2]?.label === "Cash On-Hand";
    if (!isExactDefault) return true;
  }

  return false;
}

/**
 * Determines whether a user is an existing/returning user who should NOT see onboarding.
 *
 * Checks:
 * 1. Explicit onboarding completed flag.
 * 2. Any recorded financial records (bills, receivables, expenses, shoots, transactions, logs, non-zero wallets).
 * 3. Any legitimate persisted settings or configuration.
 *
 * NOTE: A bare `updatedAt > 0` on an otherwise completely stock/empty template is
 * intentionally NOT treated as a returning user, ensuring freshly initialized profiles
 * with an automatic timestamp are not locked out of onboarding.
 */
export function isReturningUser(data?: UnifiedFinanceData | null): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }

  // 1. Explicit flag
  if (data.settings?.hasCompletedOnboarding === true) {
    return true;
  }

  // 2. Any real financial activity
  if (hasFinancialData(data)) {
    return true;
  }

  // 3. Any legitimate custom settings configuration
  if (hasConfiguredSettings(data.settings)) {
    return true;
  }

  return false;
}

export interface ShouldShowOnboardingParams {
  globalData: UnifiedFinanceData | null | undefined;
  isAuth: boolean;
  hasInitialSyncCompleted: boolean;
}

/**
 * Gatekeeper for deciding whether to display the Onboarding Wizard.
 *
 * Rules:
 * - If not authenticated: false (Auth/Landing page takes precedence).
 * - If user is already established (isReturningUser): false (never overwrite or disrupt returning users).
 * - If initial cloud sync has not completed yet: false (prevents racing cloud hydration where returning user on new device might briefly see onboarding).
 * - Only true when authenticated, initial sync is done, and user has no prior setup or data.
 */
export function shouldShowOnboarding({
  globalData,
  isAuth,
  hasInitialSyncCompleted,
}: ShouldShowOnboardingParams): boolean {
  if (!isAuth) {
    return false;
  }

  if (isReturningUser(globalData)) {
    return false;
  }

  if (!hasInitialSyncCompleted) {
    return false;
  }

  return true;
}
