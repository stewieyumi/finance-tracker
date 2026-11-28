import { readGoalProgress } from "../utils/goalProgress";
import { walletSavingsTotals } from "../utils/walletSavings";
import { readInflowIncome } from "../utils/inflowIncome";
import { useMemo } from "react";
import { noDateInflowState } from "../utils/noDateInflows";
import { reconcileDebt } from "../utils/debtReconciliation";
import {
  UnifiedFinanceData,
  BillViewModel,
  ReceivableViewModel
} from "../types/finance";
import { buildTransactionHistory } from "../utils/transactionHistory";
import { DEFAULT_TARGET_FUND } from "../constants/config";
import {
  getEffectiveBillAmount,
  getWalletForBill,
  computeBillPerPaydayAmount,
  computeBaselineScale,
  getReceivableStatus,
  reconcileWalletBalances,
  resolveActiveWalletDefault
} from "../utils/financeHelpers";
import {
  parseMonthKey,
  parseDateKey,
  getMonthKey,
  getMonthRange,
  getDaysUntil,
  countPaydaysUntil,
  isValidDateKey
} from "../utils/dateHelpers";
export function useFinanceCalculations(globalData: UnifiedFinanceData, selectedMonth: string) {
const currentMonthDate = parseMonthKey(selectedMonth);
const fallbackStartMonth = getMonthKey(new Date());
const debt = useMemo(() => reconcileDebt(globalData, selectedMonth), [globalData, selectedMonth]);

const activeBills = useMemo<BillViewModel[]>(() => {
      if (!globalData?.library?.bills) return [];

    return globalData.library.bills.filter(b => {
      const start = parseMonthKey(b.startMonth || fallbackStartMonth);
      if (currentMonthDate < start) return false;
      return true;
    }).map(b => {
      let oldestUnpaid: string | null = null;
      const loan = debt.loans.find(item => item.id === b.id);

      const startMonth = b.startMonth || fallbackStartMonth;
      const endMonth = b.type === "Loan / Installment" ? b.endMonth : undefined;
      const lastMonth = endMonth && currentMonthDate > parseMonthKey(endMonth) ? endMonth : selectedMonth;
      const monthsToCheck = getMonthRange(startMonth, lastMonth);

      for (const monthKey of monthsToCheck) {
        if (
          b.type === "Loan / Installment" &&
          b.endMonth &&
          parseMonthKey(monthKey) > parseMonthKey(b.endMonth)
        ) {
          break;
        }

        const isPaid = globalData.logs?.[monthKey]?.billsPaid?.includes(b.id);

        if (!isPaid) {
          if (!oldestUnpaid) oldestUnpaid = monthKey;
        }
      }
      const isPaidThisMonth = !oldestUnpaid;
      const targetMonthForDue = oldestUnpaid || selectedMonth;
      const daysLeft = getDaysUntil(b.dueDay, targetMonthForDue);

const targetOverride =
  globalData.logs?.[targetMonthForDue]?.billOverrides?.[b.id];

const effectiveAmount = getEffectiveBillAmount(
  b.amount,
  targetOverride
);      const isOverridden = targetOverride !== undefined;

  return {
        ...b,
        amount: effectiveAmount,
        baseAmount: b.amount,
        isOverridden,
        paid: isPaidThisMonth,
        targetMonthForDue,
        daysLeft,
        totalLoanPaid: loan?.totalPaid,
        paidLoanInstallments: loan?.paidInstallments,
        remainingLoanScheduled: loan?.remainingScheduled,
        loanHistoryApproximate: loan?.approximate,
        loanHistoryIncomplete: loan?.status === "incomplete"
      };
    }).filter(b => !(b.paid && b.type === "Loan / Installment" && b.endMonth &&
      currentMonthDate > parseMonthKey(b.endMonth))).sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      const dayA = parseInt(a.dueDay, 10) || 99;
      const dayB = parseInt(b.dueDay, 10) || 99;
      if (dayA !== dayB) return dayA - dayB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [globalData, selectedMonth, currentMonthDate, debt]);

const activeReceivables = useMemo<ReceivableViewModel[]>(() => {
      if (!globalData?.library?.receivables) return [];
    return globalData.library.receivables.filter(r => {
      if (r.frequency === "No Specific Date") return noDateInflowState(globalData, r, selectedMonth).visible;
      if (r.frequency === "Monthly" || r.frequency === "Bi-monthly") {
        const start = parseMonthKey(r.startMonth || fallbackStartMonth);
        if (currentMonthDate < start) return false;
        return true;
      }
      if (r.frequency === "By Date") {
        const hasValidDate = isValidDateKey(r.date);
        if (!hasValidDate) {
          // Undated legacy record: check if settled in an existing log month
          const settledMonth = Object.keys(globalData.logs || {}).find(m => {
            const log = globalData.logs?.[m]?.recsCollected?.[r.id];
            if (!log) return false;
            const parsedAmt = parseFloat(String(r.amount)) || 0;
            const parsedRec = parseFloat(String(log.amountReceived)) || 0;
            return getReceivableStatus(parsedAmt, parsedRec, !!log.collected).isCollected;
          });

          if (settledMonth) {
            const settledDate = parseMonthKey(settledMonth);
            if (currentMonthDate > settledDate) {
              return false;
            }
          }
          return true;
        }

        const scheduledMonth = getMonthKey(parseDateKey(r.date!));
        const scheduledMonthDate = parseMonthKey(scheduledMonth);

        // Future month does not show before scheduled month
        if (currentMonthDate < scheduledMonthDate) {
          return false;
        }

        // Scheduled month always shows
        if (currentMonthDate.getTime() === scheduledMonthDate.getTime()) {
          return true;
        }

        // Past month (overdue): check if already settled
        const log = globalData.logs?.[scheduledMonth]?.recsCollected?.[r.id];
        const parsedAmount = parseFloat(String(r.amount)) || 0;
        const parsedReceived = parseFloat(String(log?.amountReceived)) || 0;
        let { isCollected } = getReceivableStatus(parsedAmount, parsedReceived, !!log?.collected);

        if (!isCollected) {
          const anyCollected = Object.keys(globalData.logs || {}).some(m => {
            const mLog = globalData.logs?.[m]?.recsCollected?.[r.id];
            if (!mLog) return false;
            return getReceivableStatus(parsedAmount, parseFloat(String(mLog.amountReceived)) || 0, !!mLog.collected).isCollected;
          });
          if (anyCollected) {
            isCollected = true;
          }
        }

        // Once fully collected, do not appear in subsequent months
        if (isCollected) {
          return false;
        }

        // Uncollected overdue carries forward
        return true;
      }
      return true;
    }).map(r => {
      let targetMonthForDue = selectedMonth;
      let oldestUncollected: string | null = null;
      const isByDate = r.frequency === "By Date";
      const hasValidDate = isByDate && isValidDateKey(r.date);

      if (r.frequency === "No Specific Date") {
        const state = noDateInflowState(globalData, r, selectedMonth);
        return { ...r, amountReceived: state.amountReceived, collected: state.collected,
          targetMonthForDue: state.month, needsScheduleReview: !state.valid };
      }

      if (isByDate) {
        if (hasValidDate) {
          const scheduledMonth = getMonthKey(parseDateKey(r.date!));
          let targetMonth = scheduledMonth;
          if (!globalData.logs?.[targetMonth]?.recsCollected?.[r.id] && !globalData.logs?.[targetMonth]?.receivableSettlements?.[r.id]) {
            const existingLogMonth = Object.keys(globalData.logs || {}).find(m =>
              globalData.logs?.[m]?.recsCollected?.[r.id] || globalData.logs?.[m]?.receivableSettlements?.[r.id]
            );
            if (existingLogMonth) {
              targetMonth = existingLogMonth;
            }
          }
          targetMonthForDue = targetMonth;
        } else {
          const settledMonth = Object.keys(globalData.logs || {}).find(m => {
            const log = globalData.logs?.[m]?.recsCollected?.[r.id];
            if (!log) return false;
            const parsedAmt = parseFloat(String(r.amount)) || 0;
            const parsedRec = parseFloat(String(log.amountReceived)) || 0;
            return getReceivableStatus(parsedAmt, parsedRec, !!log.collected).isCollected;
          });
          targetMonthForDue = settledMonth || selectedMonth;
        }
      } else {
        const startMonth = r.startMonth || fallbackStartMonth;
        const monthsToCheck = getMonthRange(
          startMonth,
          selectedMonth
        );

        oldestUncollected =
          monthsToCheck.find(
            monthKey =>
              !globalData.logs?.[monthKey]?.recsCollected?.[r.id]?.collected
          ) || null;
        targetMonthForDue = oldestUncollected || selectedMonth;
      }

      const log = globalData.logs?.[targetMonthForDue]?.recsCollected?.[r.id] || {
        amountReceived: 0,
        collected: false
      };

      const parsedAmount = parseFloat(String(r.amount)) || 0;
      const parsedReceived = parseFloat(String(log.amountReceived)) || 0;
      
      const { isCollected } = getReceivableStatus(parsedAmount, parsedReceived, log.collected);
      const amountReceived = Math.max(0, parsedReceived);

      return {
        ...r,
        paydayReceived: (globalData.logs?.[targetMonthForDue]?.receivableSettlements?.[r.id] ?? [])
          .reduce<Record<number, number>>((totals, receipt) => {
            if (!receipt.reversedAt && receipt.paydayDay !== undefined) {
              totals[receipt.paydayDay] = (totals[receipt.paydayDay] ?? 0) + receipt.amount;
            }
            return totals;
          }, {}),
        amountReceived,
        collected: isCollected,
        targetMonthForDue,
        needsDate: isByDate && !hasValidDate
      };
    }).sort((a, b) => {
      if (a.collected !== b.collected) return a.collected ? 1 : -1;
      const fw = (f: string) => (f === "Bi-monthly" ? 1 : f === "Monthly" ? 2 : 3);
      const aValid = a.date && isValidDateKey(a.date);
      const bValid = b.date && isValidDateKey(b.date);
      if (!aValid && bValid) return 1;
      if (aValid && !bValid) return -1;
      if (aValid && bValid && a.date && b.date) {
        const dDiff = parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime();
        if (dDiff !== 0) return dDiff;
      }
      if (fw(a.frequency) !== fw(b.frequency)) return fw(a.frequency) - fw(b.frequency);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [globalData, selectedMonth, currentMonthDate]);

  const activeShoots = useMemo(() => {
    if (!globalData?.library?.shoots) return [];
    return globalData.library.shoots.filter(s => {
      if (!s.date) return true;
      const sMonth = parseMonthKey(getMonthKey(parseDateKey(s.date)));
      if (currentMonthDate < sMonth) return false;
      if (s.completed && currentMonthDate > sMonth) return false;
      return true;
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.date && b.date) return 1; if (a.date && !b.date) return -1;
      if (a.date && b.date) {
        const dDiff = parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime();
        if (dDiff !== 0) return dDiff;
      }
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [globalData, currentMonthDate]);

  const reconciledBalances = useMemo(() => reconcileWalletBalances(globalData), [globalData]);
  const totalLiquid = reconciledBalances.totalLiquid;
  const targetMilestoneFund = globalData?.settings?.targetFund ?? globalData?.targetFund ?? DEFAULT_TARGET_FUND;
  const fundProgressPercent = useMemo(() => readGoalProgress(globalData, targetMilestoneFund).percent,
    [globalData.wallets, globalData.settings, targetMilestoneFund]);
  const totalPendingReceivables = useMemo(() => activeReceivables.filter(r => !r.collected && !r.amountUnspecified).reduce((a, c) => a + Math.max(0, (parseFloat(String(c.amount)) || 0) - (parseFloat(String(c.amountReceived)) || 0)), 0), [activeReceivables]);
  const incomeReport = useMemo(() => readInflowIncome(globalData, selectedMonth), [globalData, selectedMonth]);
  const monthIncomeCollected = incomeReport.actual;
  const totalUnpaidCommitments = useMemo(() => activeBills.filter(b => !b.paid).reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [activeBills]);
  const priorityUnpaidBills = useMemo(() => activeBills.filter(b => !b.paid).slice(0, 3), [activeBills]);
  const priorityUnpaidSum = useMemo(() => priorityUnpaidBills.reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [priorityUnpaidBills]);
  const overdueBills = useMemo(() => activeBills.filter(b => !b.paid && (b.daysLeft ?? 0) < 0), [activeBills]);
  const overdueSum = useMemo(() => overdueBills.reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [overdueBills]);
  const cashShortfall = totalUnpaidCommitments - walletSavingsTotals(globalData).available;

  const perPayoutSalary = globalData?.settings?.perPayoutSalary ?? 0;
  const baseLivingAllowance = globalData?.settings?.baseLivingAllowance ?? 2500;
  const baseSavingsTarget = globalData?.settings?.baseSavingsTarget ?? 1000;
  const defaultTransit = globalData?.settings?.defaultTransitAllocation ?? 1500;

  const defaultActiveWallet = useMemo(() => resolveActiveWalletDefault(globalData?.settings, globalData?.wallets), [globalData?.settings, globalData?.wallets]);
  const livingWallet = globalData?.settings?.livingWallet || defaultActiveWallet;
  const savingsWallet = globalData?.settings?.savingsWallet || defaultActiveWallet;
  const transitWallet = globalData?.settings?.transitWallet || defaultActiveWallet;
  
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const walletSplitTotals: Record<string, number> = {};
  (globalData?.settings?.customWallets || []).forEach(w => {
    walletSplitTotals[w.id] = 0;
  });

  const billPaydayAllocations: { id: string; month: string; wallet: string; amount: number }[] = [];

  activeBills.filter(b => !b.paid).forEach(b => {
    const dueDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + (b.daysLeft ?? 0)
    );

    const paydaysRemaining = Math.max(
      1,
      countPaydaysUntil(today, dueDate, globalData.settings?.paydayDays)
    );

    const alreadyAllocated =
      globalData.logs?.[b.targetMonthForDue]
        ?.billPaydayContributions?.[b.id] || 0;

    const perPayday = computeBillPerPaydayAmount(
      parseFloat(String(b.amount)) || 0,
      alreadyAllocated,
      paydaysRemaining
    );

    const wallet = getWalletForBill(b.name, b.wallet, globalData?.settings?.defaultWallet || "maya");

    if (walletSplitTotals[wallet] === undefined) {
      walletSplitTotals[wallet] = 0;
    }

    // The helper already rounds to cents. Keep the aggregate rounded too
    // so multiple bills routed to the same wallet cannot accumulate
    // floating-point fractions that alter later payday calculations.
    walletSplitTotals[wallet] =
      Math.round(
        (walletSplitTotals[wallet] + perPayday) * 100
      ) / 100;

    if (perPayday > 0) {
      billPaydayAllocations.push({
        id: b.id,
        month: b.targetMonthForDue,
        wallet,
        amount: perPayday
      });
    }
  });

  const totalBillObligations = Object.values(walletSplitTotals).reduce((a, b) => a + b, 0);
  const totalBaselineTarget = baseLivingAllowance + baseSavingsTarget + defaultTransit;

  const baselineScale = computeBaselineScale(totalBillObligations, perPayoutSalary, totalBaselineTarget);

  const scaledLivingAllowance = Math.round(baseLivingAllowance * baselineScale * 100) / 100;
  const scaledSavingsTarget = Math.round(baseSavingsTarget * baselineScale * 100) / 100;
  const scaledTransit = Math.round(defaultTransit * baselineScale * 100) / 100;

  const paydayAllocations = { ...walletSplitTotals };
  Object.keys(paydayAllocations).forEach(k => {
    paydayAllocations[k] = Math.round(paydayAllocations[k] * 100) / 100;
  });

  paydayAllocations[livingWallet] = Math.round(((paydayAllocations[livingWallet] || 0) + scaledLivingAllowance) * 100) / 100;
  paydayAllocations[savingsWallet] = Math.round(((paydayAllocations[savingsWallet] || 0) + scaledSavingsTarget) * 100) / 100;
  paydayAllocations[transitWallet] = Math.round(((paydayAllocations[transitWallet] || 0) + scaledTransit) * 100) / 100;

  const totalAllocatedPerPayout = Object.values(paydayAllocations).reduce((a, b) => a + b, 0);
  const remainingBuffer = Math.round((perPayoutSalary - totalAllocatedPerPayout) * 100) / 100;

    const allTransactions = useMemo(
  () => buildTransactionHistory(globalData),
  [globalData]
);

const recentTransactions = useMemo(() => allTransactions.slice(0, 5), [allTransactions]);

  return {
    reconciledBalances,
    allTransactions,
    recentTransactions,
    billPaydayAllocations,
    activeBills,
    activeReceivables,
    activeShoots,
    totalLiquid,
    targetMilestoneFund,
    fundProgressPercent,
    totalPendingReceivables,
    monthIncomeCollected,
    incomeReport,
    totalUnpaidCommitments,
    priorityUnpaidBills,
    priorityUnpaidSum,
    overdueBills,
    overdueSum,
    cashShortfall,
    paydayAllocations,
    remainingBuffer
  };
}