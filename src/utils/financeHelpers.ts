import type { AppSettings } from "../types/finance";

export function getEffectiveBillAmount(
  baseAmount: number,
  override?: number
): number {
  return override !== undefined ? override : baseAmount;
}

export type Wallet = "maya" | "gcash" | "maribank" | "gotyme" | "bpi" | "cash" | string;

// This name-matching fallback exists ONLY to handle bills created before
// the `wallet` field existed on Bill. Every new bill created through the
// Add Bill form now always has an explicit `wallet` set (seeded from
// settings.defaultWallet), so this heuristic should not gain new rules
// going forward — it is legacy-data compatibility, not a routing engine.
export function getWalletForBill(
  name: string,
  walletProp?: string,
  fallbackWallet: string = "maya"
): Wallet {
  if (walletProp) return walletProp as Wallet;

  const n = (name || "").toLowerCase();

  if (
    n.includes("unobank") ||
    n.includes("appliance") ||
    n.includes("gcredit")
  ) {
    return "gcash";
  }

  if (n.includes("spaylater")) {
    return "maribank";
  }

  if (n.includes("shared") || n.includes("japan trip")) {
    return "bpi";
  }

  return fallbackWallet;
}

/**
 * Calculates how much of a bill should be funded on this payday.
 *
 * Rules:
 * - Never fund more than the remaining bill balance.
 * - Never return a negative value.
 * - Treat zero paydays remaining as one payday.
 * - Round the actual allocation to cents here, before it is routed
 *   into wallet totals and contribution logs.
 *
 * Rounding here is important because an amount such as 100 / 3 can
 * otherwise become 33.333..., which can cause cent-level drift when
 * the previous contribution is stored as 33.33.
 */
export function computeBillPerPaydayAmount(
  billAmount: number,
  alreadyAllocated: number,
  paydaysRemaining: number
): number {
  const safeBillAmount = Math.max(0, Number(billAmount) || 0);
  const safeAlreadyAllocated = Math.min(
    safeBillAmount,
    Math.max(0, Number(alreadyAllocated) || 0)
  );
  const safePaydays = Math.max(1, Math.floor(Number(paydaysRemaining) || 0));

  const remaining = Math.max(
    0,
    safeBillAmount - safeAlreadyAllocated
  );

  return Math.round((remaining / safePaydays) * 100) / 100;
}

/**
 * Scales the living/savings/transit baselines together so they only
 * consume the payout room left after bill allocations.
 *
 * Bills are funded first. Baselines consume only the remaining room.
 * If bills already exceed the payout, baselines become zero.
 */
export function computeBaselineScale(
  totalBillObligations: number,
  perPayoutSalary: number,
  totalBaselineTarget: number
): number {
  const safeBills = Math.max(0, Number(totalBillObligations) || 0);
  const safeSalary = Math.max(0, Number(perPayoutSalary) || 0);
  const safeBaseline = Math.max(0, Number(totalBaselineTarget) || 0);

  if (safeBaseline <= 0) return 0;

  const leftoverAfterBills = Math.max(
    0,
    safeSalary - safeBills
  );

  return Math.min(
    1,
    leftoverAfterBills / safeBaseline
  );
}

/**
 * Rounds each baseline allocation independently, then clamps the later
 * allocations to the actual room left after bills and earlier baselines.
 *
 * This keeps the three baseline buckets proportional to their configured
 * targets without allowing cent-level rounding to push the payday total
 * above the configured payout.
 */
export function computeScaledBaselineAllocations(
  totalBillObligations: number,
  perPayoutSalary: number,
  baseLivingAllowance: number,
  baseSavingsTarget: number,
  defaultTransit: number
): { living: number; savings: number; transit: number } {
  const safeBills = Math.max(0, Number(totalBillObligations) || 0);
  const safeSalary = Math.max(0, Number(perPayoutSalary) || 0);
  const safeLiving = Math.max(0, Number(baseLivingAllowance) || 0);
  const safeSavings = Math.max(0, Number(baseSavingsTarget) || 0);
  const safeTransit = Math.max(0, Number(defaultTransit) || 0);
  const totalBaselineTarget = safeLiving + safeSavings + safeTransit;
  const scale = computeBaselineScale(
    safeBills,
    safeSalary,
    totalBaselineTarget
  );

  const available = Math.round(
    Math.max(0, safeSalary - safeBills) * 100
  ) / 100;

  const living = Math.min(
    Math.round(safeLiving * scale * 100) / 100,
    available
  );

  const savings = Math.min(
    Math.round(safeSavings * scale * 100) / 100,
    Math.max(0, Math.round((available - living) * 100) / 100)
  );

  const transit = Math.min(
    Math.round(safeTransit * scale * 100) / 100,
    Math.max(0, Math.round((available - living - savings) * 100) / 100)
  );

  return { living, savings, transit };
}

/**
 * Treat both legacy string execution records and current execution objects
 * as the same payday execution for idempotency checks.
 */
export function hasPaydayExecutionOnDate(
  executions: Array<string | { date?: string }> | undefined,
  date: string
): boolean {
  return !!executions?.some(execution =>
    typeof execution === "string"
      ? execution === date
      : execution?.date === date
  );
}

export function getReceivableStatus(
  amount: number,
  amountReceived: number,
  isManuallyCollected: boolean
) {
  const safeAmount = Math.max(0, amount || 0);
  const safeReceived = Math.max(0, amountReceived || 0);

  const remaining = Math.max(0, safeAmount - safeReceived);
  const isCollected =
    safeAmount > 0
      ? safeReceived >= safeAmount
      : !!isManuallyCollected;

  return { isCollected, remaining };
}

export function getDefaultWalletId(
  settings?: {
    defaultWallet?: string;
    customWallets?: { id: string }[];
  },
  wallets?: Record<string, number>
): string {
  const configuredWallet = settings?.defaultWallet;
  if (
    configuredWallet &&
    (!wallets || wallets[configuredWallet] !== undefined)
  ) {
    return configuredWallet;
  }

  const firstAvailableWallet = settings?.customWallets?.find(
    wallet =>
      !!wallet.id &&
      (!wallets || wallets[wallet.id] !== undefined)
  );

  return firstAvailableWallet?.id || "";
}

/**
 * Returns the configured wallet for a new expense category.
 *
 * A category-specific route wins when it points to a valid wallet.
 * Otherwise, the normal default wallet fallback is used.
 */
export function getDefaultExpenseWalletId(
  category: string,
  settings?: AppSettings,
  wallets?: Record<string, number>
): string {
  const configuredWallet = settings?.expenseWallets?.[category];

  if (
    configuredWallet &&
    (!wallets || wallets[configuredWallet] !== undefined)
  ) {
    return configuredWallet;
  }

  return getDefaultWalletId(settings, wallets);
}

export function applyWalletTransaction(
  currentBalance: number,
  delta: number
): number {
  const safeBalance = currentBalance || 0;
  return Math.round(
    Math.max(0, safeBalance + delta) * 100
  ) / 100;
}
