import type { BillSettlement } from "../types/finance";

/** Keep status intervals without changing settlement identity or its wallet effect. */
export function recordBillSettlementStatus(
  settlement: BillSettlement,
  paid: boolean,
  at: string
): BillSettlement {
  const existing = Array.isArray(settlement.statusHistory) ? settlement.statusHistory : [
    { paid: true, at: settlement.paidAt },
    ...(settlement.reversedAt ? [{ paid: false, at: settlement.reversedAt }] : [])
  ];
  return {
    ...settlement,
    statusHistory: [...existing, { paid, at }],
    // Old redo intervals may already have been erased. Never backfill certainty.
    historyComplete: Array.isArray(settlement.statusHistory) && settlement.historyComplete === true
  };
}
