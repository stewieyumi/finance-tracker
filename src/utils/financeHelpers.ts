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

export function applyWalletTransaction(
  currentBalance: number,
  delta: number
): number {
  const safeBalance = currentBalance || 0;
  return Math.round(
    Math.max(0, safeBalance + delta) * 100
  ) / 100;
}
