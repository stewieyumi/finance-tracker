import { readFinancialCheckup } from "./financialCheckup";
import { enabledSavingsWalletIds, readWalletSavings, walletSavingsTotals } from "./walletSavings";
import { readInflowIncome, type InflowIncomeReport } from "./inflowIncome";
import {
  BillViewModel,
  ReceivableViewModel,
  UnifiedFinanceData
} from "../types/finance";
import { parseDateKey } from "./dateHelpers";
import { reconcileWalletBalances, resolveActiveWalletDefault, parseWalletBalance } from "./financeHelpers";
import { budgetMonthRange, effectiveBudget } from "./budgeting";
import { reconcileDebt } from "./debtReconciliation";
import { expenseCents } from "./expenseChanges";
import { roundMoney } from "./currency";
import { transactionDay } from "./transactionDates";

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
  incomeReport?: InflowIncomeReport;
}


const formatOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};


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
  incomeReport = readInflowIncome(globalData, selectedMonth)
}: BuildSummaryParams): string {
  const unpaid = activeBills.filter(b => !b.paid);
  const pending = activeReceivables.filter(r => !r.collected);

  const fmt = (n: number | string) =>
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const totalPendingAmount = pending.reduce((acc, r) => {
    if (r.amountUnspecified) return acc;
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

  const reconciled = reconcileWalletBalances(globalData);
  const savingsTotals = walletSavingsTotals(globalData);
  const walletLabel = (id?: string | null) => {
    if (!id) return "No wallet recorded";
    return [...reconciled.activeWallets, ...reconciled.archivedWallets, ...reconciled.unlistedWallets].find(wallet => wallet.id === id)?.label || id;
  };
  const walletLines = [
    ...reconciled.activeWallets,
    ...reconciled.archivedWallets,
    ...reconciled.unlistedWallets
  ].map(wallet => {
    const funds = readWalletSavings(globalData, wallet.id);
    return `  • ${wallet.label}${wallet.status === "active" ? "" : ` [${wallet.status}]`}: ${wallet.isValid ? `₱${fmt(wallet.balance)}` : "Balance needs review"}; savings ${funds.savings === null ? "needs review" : `₱${fmt(funds.savings)}`}; available ₱${fmt(funds.available)}${funds.needsReview ? " — savings/balance need review" : ""}`;
  });
  let finalWalletLines = walletLines.length ? walletLines.join("\n") : "  • No accounts configured";
  if (reconciled.hasMetadataAnomalies) finalWalletLines += "\n  ⚠️ Wallet balances or account assignments need review; totals may be incomplete.";

  const checkup = readFinancialCheckup(globalData, selectedMonth, totalUnpaidCommitments);
  const spending = checkup.spending;
  const categoryLines = Object.entries(spending.byCategory).filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a).map(([category, amount]) => `  • ${category}: ₱${fmt(amount)}`).join("\n") || "  • No dated spending recorded";
  const expenseTotal = roundMoney(spending.spent - spending.byCategory.Commitments - spending.byCategory["Transfer fees"]);
  const effective = effectiveBudget(globalData, selectedMonth);
  const plan = effective.budget;
  const today = checkup.today;
  const daily = checkup.daily;
  const range = budgetMonthRange(selectedMonth);
  const planRange = plan?.cashPlan ?? range;
  const planLines = plan && daily ? [
    `• Plan period: ${planRange.startDate} to ${planRange.endDate}${effective.carriedFrom ? ` (carried from ${effective.carriedFrom}${effective.projected ? "; projected" : ""})` : ""}`,
    `• Spending limit: ₱${fmt(plan.limit)}; recorded spending in plan: ₱${fmt(daily.spending.spent)}`,
    `• ${daily.spending.spent > plan.limit ? "Over limit" : "Unspent allowance"}: ₱${fmt(Math.abs(roundMoney(plan.limit - daily.spending.spent)))}`,
    `• Rollover: ${plan.rollover ? "On (unused allowance only; no new money)" : "Off"}`,
    ...(plan.cashPlan ? [
      `• Selected wallets: ${plan.cashPlan.walletIds.map(walletLabel).join(", ")}; available now: ₱${fmt(daily.funding.available)}`,
      `• Usual daily essentials: ₱${fmt(plan.cashPlan.dailyEssentials)}`,
      `• Savings target: ₱${fmt(plan.cashPlan.savingsTarget)}; cushion: ₱${fmt(plan.cashPlan.cushion)} (planned amounts, not transfers)`,
    ] : ["• Wallet scope: all wallets"]),
    `• Unpaid-payment reserve remaining: ₱${fmt(daily.reserveLeft)}`,
    ...(daily.ended ? ["• This plan has ended; no current daily allowance."] : daily.future ? ["• This plan has not started; no current daily allowance."] : [
      `• Today (${today}): allowance ₱${fmt(daily.todayCap)}; everyday spending ₱${fmt(daily.todaySpent)}; left ₱${fmt(daily.remainingToday)}${daily.todaySpent > daily.todayCap ? `; over today's allowance by ₱${fmt(roundMoney(daily.todaySpent - daily.todayCap))}` : ""}`,
      `• Average remaining per day: ₱${fmt(daily.averageRemaining)} across ${daily.daysLeft} day(s); next 7 days: ₱${fmt(daily.nextSevenDays)}`,
    ]),
    ...Object.entries(plan.categoryLimits ?? {}).map(([category, limit]) => `  • ${category}: ₱${fmt(daily.spending.byCategory[category])} spent / ₱${fmt(limit)} limit${daily.spending.byCategory[category] > limit ? " — over limit" : ""}`),
    ...(daily.spending.excluded || daily.funding.needsReview ? ["⚠️ Budget spending or selected wallets need review; guidance may be incomplete."] : []),
    "Budget allowances are guidance, not additional wallet cash."
  ].join("\n") : `• No budget set for ${selectedMonth}.${effective.needsReview ? " Previous rollover history needs review." : ""}`;
  const ledgerIds = new Map<string, number>();
  for (const row of globalData.library.manualTransactions ?? []) ledgerIds.set(row.id, (ledgerIds.get(row.id) ?? 0) + 1);
  const ledger = (globalData.library.manualTransactions ?? []).filter(row => {
    const day = transactionDay(row.date);
    return !!row.id && ledgerIds.get(row.id) === 1 && day >= range.startDate && day <= range.endDate && expenseCents(row.amount) !== null;
  });
  const transfers = ledger.filter(row => row.type === "transfer");
  const transferLines = transfers.map(row => `  • ${transactionDay(row.date)}: ${walletLabel(row.wallet)} → ${walletLabel(row.destinationWallet)}: ₱${fmt(row.amount)}${row.transferFee !== undefined ? expenseCents(row.transferFee) === null ? "; fee needs review" : `; fee ₱${fmt(row.transferFee)}` : ""}${row.postingMode === "history-only" ? " [history only]" : ""}`).join("\n") || "  • No transfers recorded";
  const ledgerNeedsReview = (globalData.library.manualTransactions ?? []).some(row => (row.type === "transfer" || row.type === "income") &&
    (!transactionDay(row.date) || (transactionDay(row.date) >= range.startDate && transactionDay(row.date) <= range.endDate &&
      (!row.id || ledgerIds.get(row.id) !== 1 || expenseCents(row.amount) === null || (row.transferFee !== undefined && expenseCents(row.transferFee) === null)))));
  const ledgerIncomeLines = ledger.filter(row => row.type === "income").map(row => `  • ${transactionDay(row.date)}: ${row.title}: ₱${fmt(row.amount)} [${row.postingMode === "wallet" ? "wallet entry" : "history only"}]`).join("\n") || "  • None";
  const debt = reconcileDebt(globalData, selectedMonth);
  const debtLines = debt.loans.map(loan => [
    `  • ${loan.name}${loan.archived ? " [archived]" : ""}: ${loan.paidInstallments}/${loan.totalMonths} installments; ₱${fmt(loan.totalPaid)} paid; ${loan.remainingScheduled === null ? "remaining schedule unknown" : `₱${fmt(loan.remainingScheduled)} remaining scheduled`}${loan.status === "incomplete" ? " — History needs review" : loan.approximate ? " — Historical payments" : ""}`,
    ...loan.issues.map(issue => `    Review: ${issue}`),
    ...loan.estimateNotes.map(note => `    Historical entry: ${note}`),
  ].join("\n")).join("\n") || "  • No installment plans";
  const gigs = globalData.library.shoots ?? [];
  const gigLines = gigs.map(gig => `  • ${gig.title}: ${gig.date || "Date not set"} · ${gig.completed ? "Done" : gig.status}${gig.category ? ` · ${gig.category}` : ""}`).join("\n") || "  • No gigs/tasks saved";
  const milestoneId = globalData.settings?.milestoneWallet || resolveActiveWalletDefault(globalData.settings, globalData.wallets);
  const milestone = milestoneId ? parseWalletBalance(globalData.wallets[milestoneId]) : undefined;
  const goalLine = targetMilestoneFund > 0
    ? `${globalData.settings?.goalName?.trim() || "Savings goal"}: ${milestone?.isValid ? `₱${fmt(milestone.balance)} / ₱${fmt(targetMilestoneFund)} (${fundProgressPercent}%)` : "Wallet balance needs review"} · ${walletLabel(milestoneId)}`
    : "No savings goal set";

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
          r.frequency === "No Specific Date"
            ? `No specific date · Since ${r.startMonth || "month needs review"}`
            : r.frequency === "By Date"
            ? r.date
              ? parseDateKey(r.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                })
              : "Date TBA"
            : r.frequency === "Bi-monthly"
              ? (r.biMonthlyDays && r.biMonthlyDays.length > 0 ? r.biMonthlyDays.map(formatOrdinal).join(" & ") : "15th & 30th")
              : `Monthly (Day ${r.monthlyDay || 15})`;

        if (r.amountUnspecified) return `  • ${r.name} [${cat} | ${freqInfo}]: — (amount not set)`;
        return rec > 0
          ? `  • ${r.name} [${cat} | ${freqInfo}]: ₱${fmt(rem)} remaining (₱${fmt(rec)} collected of ₱${fmt(r.amount)})`
          : `  • ${r.name} [${cat} | ${freqInfo}]: ₱${fmt(r.amount)}`;
      })
      .join("\n") || "  • None (All collected)";

  return `========================================
FINANCIAL STATUS REPORT: ${selectedMonth.toUpperCase()}
Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
Activity period: ${range.startDate} to ${range.endDate}. Saved records only; dates use your device time zone. Wallet balances are current, not historical month-end balances.
========================================

AT A GLANCE
You have ₱${fmt(totalLiquid)} in recorded wallet cash now. In ${selectedMonth}, Inflows receipts total ₱${fmt(incomeReport.actual)} and recorded spending totals ₱${fmt(spending.spent)}.
Savings set aside within those balances: ₱${fmt(savingsTotals.savings)}. Cash available after savings: ₱${fmt(savingsTotals.available)}.
There are ₱${fmt(totalUnpaidCommitments)} in unpaid commitments and ₱${fmt(totalPendingAmount)} in expected inflows for the selected view. Expected money is not available cash.
${savingsTotals.available < totalUnpaidCommitments ? `Cash available after savings is ₱${fmt(roundMoney(totalUnpaidCommitments - savingsTotals.available))} short of these unpaid commitments.` : `Cash after savings and these unpaid commitments: ₱${fmt(roundMoney(savingsTotals.available - totalUnpaidCommitments))}, before any extra savings target, cushion and everyday spending.`}
${plan && daily ? `Your budget has ₱${fmt(Math.abs(roundMoney(plan.limit - daily.spending.spent)))} ${daily.spending.spent > plan.limit ? "over its spending limit" : "of unspent allowance"}.${daily.ended || daily.future ? " See the plan dates below." : ` Today's everyday spending guide has ₱${fmt(daily.remainingToday)} left.`}` : "No budget plan is set for this month."}
${spending.excluded || incomeReport.needsReview || savingsTotals.needsReview ? "⚠️ Some records need review; see the notes below." : ""}

1. LIQUID CASH BREAKDOWN
${finalWalletLines}
----------------------------------------
TOTAL WALLET CASH: ₱${fmt(totalLiquid)}
SAVINGS WITHIN THESE BALANCES: ₱${fmt(savingsTotals.savings)}
AVAILABLE AFTER SAVINGS: ₱${fmt(savingsTotals.available)}
Savings are a planning reserve; they do not move money or block recording actual spending.${savingsTotals.needsReview ? "\n⚠️ Wallet savings need review before relying on available cash." : ""}

2. UNPAID COMMITMENTS (${unpaid.length} pending, ${overdueBills.length} overdue)
${billLines}
----------------------------------------
TOTAL UNPAID BILLS: ₱${fmt(totalUnpaidCommitments)}

3. PENDING ${globalData?.settings?.inflowsLabel?.toUpperCase() || 'RECEIVABLES & INFLOWS'} (${pending.length} pending)
${recLines}
----------------------------------------
TOTAL PENDING INFLOWS: ₱${fmt(totalPendingAmount)}${pending.some(r => r.amountUnspecified) ? " (excludes inflows with no amount)" : ""}

4. GOAL TRACKING & NET OUTLOOK
• ${goalLine}
• Month Income Collected: ₱${fmt(incomeReport.actual)} (actual Inflows receipts)${incomeReport.confirmedMonthOnly ? `
• Included with confirmed receipt month: ₱${fmt(incomeReport.confirmedMonthOnly)} (exact day unknown)` : ""}${incomeReport.historicalDateUnverified > 0 ? `
• Historical income — date unverified: ₱${fmt(incomeReport.historicalDateUnverified)} (saved under this period; excluded from actual income)` : ""}${incomeReport.needsReview ? "\n• Income history needs review. Check receipt details before relying on this total." : ""}
• Net Projected Position: ₱${fmt(netPosition)} ${netPosition >= 0 ? "(Surplus)" : "(Shortfall)"} (cash + expected inflows − unpaid commitments; not spendable cash)

5. RECORDED SPENDING — ${selectedMonth.toUpperCase()}
• Expenses (including manual ledger expenses): ₱${fmt(expenseTotal)}
• Paid commitments by actual payment date: ₱${fmt(spending.byCategory.Commitments)}
• Transfer fees: ₱${fmt(spending.byCategory["Transfer fees"])}
TOTAL RECORDED SPENDING: ₱${fmt(spending.spent)}
Category breakdown:
${categoryLines}
Transfers between your wallets are excluded; their fees are included. Reversed payments are excluded.
Bills paid ahead count as spending on their actual payment date; their due-month commitment is settled separately.
${spending.excluded ? `⚠️ ${spending.excluded} spending record(s) need review and were excluded (missing dates, older confirmations, or duplicate/invalid records).` : ""}

6. BUDGET PLAN
${planLines}

FINANCIAL CHECKUP — CURRENT CASH / ${selectedMonth.toUpperCase()} ACTIVITY
• Available after Savings (active wallets, now): ₱${fmt(checkup.cash.available)}
• Selected-view unpaid commitments: ${checkup.unpaid === null ? "Needs review" : `₱${fmt(checkup.unpaid)}`}
• ${checkup.afterCommitments !== null && checkup.afterCommitments < 0 ? "Cash shortfall" : "Cash after those commitments"}: ${checkup.afterCommitments === null ? "Needs review" : `₱${fmt(Math.abs(checkup.afterCommitments))}`} (before extra savings targets, cushion and daily needs)
• Spending in ${selectedMonth}: ₱${fmt(checkup.spending.spent)}; actual Inflows receipts: ₱${fmt(checkup.income.actual)}
• Next step: ${checkup.nextAction}${checkup.needsReview ? "\n⚠️ Checkup totals need review." : ""}
• Wallets with Savings controls enabled: ${enabledSavingsWalletIds(globalData.settings).map(walletLabel).join(", ") || "None"}

EMERGENCY-FUND GOAL — CURRENT SAVINGS
${checkup.emergency.goal ? `• Target: ₱${fmt(checkup.emergency.goal.target)}; existing Savings counted: ₱${fmt(checkup.emergency.saved)}; remaining: ₱${fmt(checkup.emergency.remaining ?? 0)}
• Selected Savings wallets: ${checkup.emergency.goal.walletIds.map(walletLabel).join(", ")}
• Progress: ${fmt(checkup.emergency.percent ?? 0)}%${checkup.emergency.reached ? " — chosen target reached" : ""}
• This goal tracks existing Savings; no additional money is added or reserved.` : "• No emergency-fund goal set."}${checkup.emergency.needsReview ? "\n⚠️ Emergency-fund Savings or saved goal need review before relying on progress." : ""}

7. COMMITMENT STATUS — SELECTED VIEW
${activeBills.map(bill => `  • ${bill.name}: ${bill.paid ? "Settled" : "Unpaid"} · ₱${fmt(bill.amount)} · ${bill.targetMonthForDue}, day ${bill.dueDay} · ${walletLabel(bill.wallet)}`).join("\n") || "  • No commitments in this view"}
Status follows the selected schedule; actual payment-date spending is reported separately above.

8. INFLOW STATUS — SELECTED VIEW
${activeReceivables.map(inflow => `  • ${inflow.name}: ${inflow.collected ? "Received" : inflow.amountReceived > 0 ? "Partial" : "Pending"} · ${inflow.amountUnspecified ? "Expected amount not set" : `₱${fmt(inflow.amountReceived)} collected of ₱${fmt(inflow.amount)}`} · ${inflow.targetMonthForDue}`).join("\n") || "  • No inflows in this view"}
Actual receipt-month income above includes archived inflows. Scheduled totals can differ from receipt-month totals.
Separate manual ledger income (not added to Inflows receipt total; may describe the same money):
${ledgerIncomeLines}

9. WALLET TRANSFERS — ${selectedMonth.toUpperCase()}
${transferLines}
${ledgerNeedsReview ? "⚠️ Some manual income or transfer records need review; invalid or duplicate amounts/dates are not included in the lists." : ""}

10. INSTALLMENT PLANS — AS OF SELECTED PERIOD
• ${debt.isComplete ? "Remaining scheduled" : "Known remaining scheduled"}: ₱${fmt(debt.remainingScheduled)}; recorded installment payments to date: ₱${fmt(debt.totalPaid)}
• Scheduled in ${selectedMonth}: ${debt.monthlyScheduled === null ? "Review needed" : `₱${fmt(debt.monthlyScheduled)}`} (includes settled payments)
• Last planned payment: ${debt.scheduledFinish ?? (debt.finishStatus === "past-due" ? "Overdue schedule — unpaid installments in an ended plan" : debt.finishStatus === "review" ? "Review needed" : "No payments left")}; includes upcoming plans, assuming the saved schedule is met.
• Upcoming plans: ${debt.upcomingLoans.length}; ${debt.upcomingScheduled === null ? "remaining schedule needs review" : `₱${fmt(debt.upcomingScheduled)} remaining scheduled separately from active debt`}
• Active debt breakdown: ${debt.isComplete && debt.remainingScheduled > 0 ? debt.activeLoans.map(loan => `${loan.name}: ${((loan.remainingScheduled ?? 0) / debt.remainingScheduled * 100).toFixed(1)}%`).join("; ") : debt.isComplete ? "No active scheduled balance" : "Review needed"}
${debtLines}
${!debt.isComplete ? "⚠️ Some installment schedules or payment records need correction; review the reasons listed above.\n" : ""}${debt.approximate ? "Historical Paid entries count toward paid installments using saved months and amounts. Unknown exact dates stay unknown; wallets are not charged again.\n" : ""}Remaining scheduled amounts describe saved installment plans, not a lender payoff quote. They cannot independently verify older payments.

11. ${globalData.settings?.gigsLabel?.toUpperCase() || "GIGS & TASKS"} — ALL SAVED DATES
${gigs.filter(gig => gig.completed).length}/${gigs.length} completed
${gigLines}
========================================`;
}
