import {
  BillViewModel,
  ReceivableViewModel,
  UnifiedFinanceData
} from "../types/finance";

interface BuildSummaryParams {
  activeBills: BillViewModel[];
  activeReceivables: ReceivableViewModel[];
  globalData: UnifiedFinanceData;
  selectedMonth: string;
  totalLiquid: number;
  totalUnpaidCommitments: number;
  overdueBills: BillViewModel[];
  targetMilestoneFund: number;
  fundProgressPercent: string;
  monthIncomeCollected: number;
}

export function buildFinancialSummary({
  activeBills,
  activeReceivables,
  globalData,
  selectedMonth,
  totalLiquid,
  totalUnpaidCommitments,
  overdueBills,
  targetMilestoneFund,
  fundProgressPercent,
  monthIncomeCollected
}: BuildSummaryParams): string {
  const unpaid = activeBills.filter(b => !b.paid);
  const pending = activeReceivables.filter(r => !r.collected);

  const fmt = (n: number | string) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2
    });

  const totalPendingAmount = pending.reduce((acc, r) => {
    const rec = parseFloat(String(r.amountReceived)) || 0;

    return acc + Math.max(
      0,
      (parseFloat(String(r.amount)) || 0) - rec
    );
  }, 0);

  const netPosition =
    totalLiquid +
    totalPendingAmount -
    totalUnpaidCommitments;

  const walletLines = [
    `  • MariBank (Japan Fund): ₱${fmt(globalData?.wallets?.maribank)}`,
    `  • Maya: ₱${fmt(globalData?.wallets?.maya)}`,
    `  • GCash: ₱${fmt(globalData?.wallets?.gcash)}`,
    `  • GoTyme: ₱${fmt(globalData?.wallets?.gotyme)}`,
    `  • BPI: ₱${fmt(globalData?.wallets?.bpi)}`,
    `  • Cash On-Hand: ₱${fmt(globalData?.wallets?.cash)}`
  ].join("\n");

  const billLines =
    unpaid
      .map(b => {
        const daysLeft = b.daysLeft ?? 0;

        const dueInfo =
          daysLeft < 0
            ? `[OVERDUE by ${Math.abs(daysLeft)}d | Due: Day ${b.dueDay}]`
            : daysLeft === 0
              ? `[DUE TODAY | Day ${b.dueDay}]`
              : `[Due in ${daysLeft}d | Day ${b.dueDay}]`;

        return `  • ${b.name} (${b.type}): ₱${fmt(b.amount)} ${dueInfo}`;
      })
      .join("\n") || "  • None (All paid)";

  const recLines =
    pending
      .map(r => {
        const rec =
          parseFloat(String(r.amountReceived)) || 0;

        const rem = Math.max(
          0,
          (parseFloat(String(r.amount)) || 0) - rec
        );

        const cat = r.category || "Income";

        const freqInfo =
          r.frequency === "By Date"
            ? r.date
              ? new Date(
                  r.date.replace(/-/g, "/")
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                })
              : "Date TBA"
            : r.frequency === "Bi-monthly"
              ? r.biMonthlyDays || "15th & 30th"
              : `Monthly (Day ${r.monthlyDay || "15"})`;

        return rec > 0
          ? `  • ${r.name} [${cat} | ${freqInfo}]: ₱${fmt(rem)} remaining (₱${fmt(rec)} collected of ₱${fmt(r.amount)})`
          : `  • ${r.name} [${cat} | ${freqInfo}]: ₱${fmt(r.amount)}`;
      })
      .join("\n") || "  • None (All collected)";

  return `========================================
FINANCIAL STATUS REPORT: ${selectedMonth.toUpperCase()}
Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
========================================

1. LIQUID CASH BREAKDOWN
${walletLines}
----------------------------------------
TOTAL LIQUID CASH: ₱${fmt(totalLiquid)}

2. UNPAID COMMITMENTS (${unpaid.length} pending, ${overdueBills.length} overdue)
${billLines}
----------------------------------------
TOTAL UNPAID BILLS: ₱${fmt(totalUnpaidCommitments)}

3. PENDING RECEIVABLES & INFLOWS (${pending.length} pending)
${recLines}
----------------------------------------
TOTAL PENDING INFLOWS: ₱${fmt(totalPendingAmount)}

4. GOAL TRACKING & NET OUTLOOK
• Japan ADB Milestone: ₱${fmt(globalData?.wallets?.maribank)} / ₱${fmt(targetMilestoneFund)} (${fundProgressPercent}%)
• Month Income Collected: ₱${fmt(monthIncomeCollected)}
• Net Projected Position: ₱${fmt(netPosition)} ${netPosition >= 0 ? "(Surplus)" : "(Shortfall)"}
========================================`;
}