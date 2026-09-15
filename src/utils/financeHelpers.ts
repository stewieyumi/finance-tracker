export function getEffectiveBillAmount(
  baseAmount: number,
  override?: number
): number {
  return override !== undefined ? override : baseAmount;
}

export type Wallet = "maya" | "gcash" | "maribank" | "gotyme";

export function getWalletForBill(name: string, walletProp?: string): Wallet {
  if (walletProp) return walletProp as Wallet;
  const n = (name || "").toLowerCase();
  if (n.includes("unobank") || n.includes("appliance") || n.includes("gcredit")) return "gcash";
  if (n.includes("spaylater")) return "maribank";
  if (n.includes("shared") || n.includes("japan trip")) return "gotyme";
  return "maya";
}

// How much of a bill should be set aside THIS payday, given what's
// already been contributed toward it and how many paydays remain
// before it's due. Never re-funds an amount already allocated.
export function computeBillPerPaydayAmount(
  billAmount: number,
  alreadyAllocated: number,
  paydaysRemaining: number
): number {
  const remaining = Math.max(0, billAmount - alreadyAllocated);
  const safePaydays = Math.max(1, paydaysRemaining);
  return remaining / safePaydays;
}

// Scales the three flat baselines (living/savings/transit) down together
// so they only consume whatever payout room is left after bills are
// funded in full — never pushing the total negative.
export function computeBaselineScale(
  totalBillObligations: number,
  perPayoutSalary: number,
  totalBaselineTarget: number
): number {
  const leftoverAfterBills = Math.max(0, perPayoutSalary - totalBillObligations);
  return totalBaselineTarget > 0 ? Math.min(1, leftoverAfterBills / totalBaselineTarget) : 0;
}
