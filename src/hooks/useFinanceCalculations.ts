import { useMemo } from "react";
import {
  UnifiedFinanceData,
  BillViewModel,
  ReceivableViewModel
} from "../types/finance";
import { DEFAULT_TARGET_FUND } from "../constants/config";
import { getEffectiveBillAmount, getWalletForBill, computeBillPerPaydayAmount, computeBaselineScale } from "../utils/financeHelpers";
import {
  parseMonthKey,
  parseDateKey,
  getMonthKey,
  getMonthRange,
  getDaysUntil,
  countPaydaysUntil
} from "../utils/dateHelpers";
export function useFinanceCalculations(globalData: UnifiedFinanceData, selectedMonth: string) {
const currentMonthDate = parseMonthKey(selectedMonth);
const fallbackStartMonth = getMonthKey(new Date());

const activeBills = useMemo<BillViewModel[]>(() => {
      if (!globalData?.library?.bills) return [];

    return globalData.library.bills.filter(b => {
      const start = parseMonthKey(b.startMonth || fallbackStartMonth);
      if (currentMonthDate < start) return false;
      if (b.type === "Loan / Installment" && b.endMonth && currentMonthDate > parseMonthKey(b.endMonth)) return false;
      return true;
    }).map(b => {
      let oldestUnpaid: string | null = null;
      let totalLoanPaid = 0;

      const startMonth = b.startMonth || fallbackStartMonth;
      const monthsToCheck = getMonthRange(
        startMonth,
        selectedMonth
      );

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
        } else if (b.type === "Loan / Installment") {
          const override = globalData.logs?.[monthKey]?.billOverrides?.[b.id];
          totalLoanPaid +=
            override !== undefined && Number.isFinite(override)
              ? override
              : b.amount;
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
        totalLoanPaid
      };
    }).sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      const dayA = parseInt(a.dueDay, 10) || 99;
      const dayB = parseInt(b.dueDay, 10) || 99;
      if (dayA !== dayB) return dayA - dayB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [globalData, selectedMonth, currentMonthDate]);

const activeReceivables = useMemo<ReceivableViewModel[]>(() => {
      if (!globalData?.library?.receivables) return [];
    return globalData.library.receivables.filter(r => {
      if (r.frequency === "Monthly" || r.frequency === "Bi-monthly") {
        const start = parseMonthKey(r.startMonth || fallbackStartMonth);
        if (currentMonthDate < start) return false;
        return true;
      }
      if (r.frequency === "By Date") {
        if (!r.date) return true;
        const exactMonth = getMonthKey(parseDateKey(r.date));
        if (selectedMonth !== exactMonth && globalData.logs?.[exactMonth]?.recsCollected?.[r.id]?.collected) {
          return false;
        }
      }
      return true;
    }).map(r => {
      let targetMonthForDue = selectedMonth;
      let oldestUncollected: string | null = null;
      if (r.frequency === "By Date") {
        targetMonthForDue = r.date ? getMonthKey(parseDateKey(r.date)) : selectedMonth;
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

      const amountReceived = Math.max(0, parseFloat(String(log.amountReceived)) || 0);
      const receivableAmount = Math.max(0, parseFloat(String(r.amount)) || 0);
      const collected = receivableAmount > 0 ? amountReceived >= receivableAmount : !!log.collected;

  return {
        ...r,
        amountReceived,
        collected,
        targetMonthForDue
      };
    }).sort((a, b) => {
      if (a.collected !== b.collected) return a.collected ? 1 : -1;
      const fw = (f: string) => (f === "Bi-monthly" ? 1 : f === "Monthly" ? 2 : 3);
      if (!a.date && b.date) return 1; if (a.date && !b.date) return -1;
      if (a.date && b.date) {
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

  const totalLiquid = useMemo(() => Object.values(globalData?.wallets || {}).reduce((a, c) => a + (parseFloat(String(c)) || 0), 0), [globalData?.wallets]);
  const targetMilestoneFund = globalData?.settings?.targetFund ?? globalData?.targetFund ?? DEFAULT_TARGET_FUND;
const fundProgressPercent = useMemo(() => {
  if (targetMilestoneFund <= 0) return "0.0";

  return (
    ((globalData?.wallets?.[globalData?.settings?.milestoneWallet || 'maribank'] || 0) / targetMilestoneFund) * 100
  ).toFixed(1);
}, [globalData?.wallets, globalData?.settings?.milestoneWallet, targetMilestoneFund]);
  const totalPendingReceivables = useMemo(() => activeReceivables.filter(r => !r.collected).reduce((a, c) => a + Math.max(0, (parseFloat(String(c.amount)) || 0) - (parseFloat(String(c.amountReceived)) || 0)), 0), [activeReceivables]);
  const monthIncomeCollected = useMemo(() => activeReceivables.reduce((a, c) => a + (parseFloat(String(c.amountReceived)) || 0), 0), [activeReceivables]);
  const totalUnpaidCommitments = useMemo(() => activeBills.filter(b => !b.paid).reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [activeBills]);
  const priorityUnpaidBills = useMemo(() => activeBills.filter(b => !b.paid).slice(0, 3), [activeBills]);
  const priorityUnpaidSum = useMemo(() => priorityUnpaidBills.reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [priorityUnpaidBills]);
  const overdueBills = useMemo(() => activeBills.filter(b => !b.paid && (b.daysLeft ?? 0) < 0), [activeBills]);
  const overdueSum = useMemo(() => overdueBills.reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [overdueBills]);
  const cashShortfall = totalUnpaidCommitments - totalLiquid;

  const perPayoutSalary = globalData?.settings?.perPayoutSalary ?? 15000;
  const baseLivingAllowance = globalData?.settings?.baseLivingAllowance ?? 2500;
  const baseSavingsTarget = globalData?.settings?.baseSavingsTarget ?? 1000;
  const defaultTransit = globalData?.settings?.defaultTransitAllocation ?? 1500;

  const livingWallet = globalData?.settings?.livingWallet || "gcash";
  const savingsWallet = globalData?.settings?.savingsWallet || "bpi";
  const transitWallet = globalData?.settings?.transitWallet || "gotyme";
  
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const walletSplitTotals: Record<string, number> = { maya: 0, gcash: 0, maribank: 0, gotyme: 0, bpi: 0, cash: 0 };

  const billPaydayAllocations: { id: string; month: string; wallet: string; amount: number }[] = [];

  activeBills.filter(b => !b.paid).forEach(b => {
    const dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (b.daysLeft ?? 0));
    const paydaysRemaining = Math.max(1, countPaydaysUntil(today, dueDate));
    const alreadyAllocated = globalData.logs?.[b.targetMonthForDue]?.billPaydayContributions?.[b.id] || 0;
    const perPayday = computeBillPerPaydayAmount(parseFloat(String(b.amount)) || 0, alreadyAllocated, paydaysRemaining);
    const wallet = getWalletForBill(b.name, b.wallet);
    if (walletSplitTotals[wallet] === undefined) walletSplitTotals[wallet] = 0;
    walletSplitTotals[wallet] += perPayday;
    if (perPayday > 0) {
      billPaydayAllocations.push({ id: b.id, month: b.targetMonthForDue, wallet, amount: Math.round(perPayday * 100) / 100 });
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

    const allTransactions = useMemo(() => {
    const txs: import("../types/finance").TransactionHistoryItem[] = [];

    // 1. Expenses
    (globalData.library?.expenses || []).forEach(e => {
      txs.push({ id: e.id, title: e.merchant, amount: -e.amount, date: e.date, type: "expense", wallet: e.wallet, category: e.category });
    });

    // 2. Paid Bills
    globalData.library?.bills?.forEach(b => {
      Object.entries(globalData.logs || {}).forEach(([monthKey, log]) => {
        if (log.billsPaid?.includes(b.id)) {
          const d = parseMonthKey(monthKey);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(b.dueDay || "1").padStart(2, '0');
          const override = log.billOverrides?.[b.id];
          const amt = override !== undefined ? override : b.amount;
          txs.push({ id: `${b.id}_${monthKey}`, title: `${b.name} (${monthKey.split(" ")[0]})`, amount: -amt, date: log.paymentDates?.[b.id] || `${year}-${month}-${day}`, type: "bill", wallet: b.wallet || "maya", category: b.type });
        }
      });
    });

    // 3. Collected Inflows
    globalData.library?.receivables?.forEach(r => {
      Object.entries(globalData.logs || {}).forEach(([monthKey, log]) => {
        const recLog = log.recsCollected?.[r.id];
        if (recLog && recLog.amountReceived > 0) {
          let txDate = r.date;
          if (!txDate) {
            const d = parseMonthKey(monthKey);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = r.frequency === "Monthly" ? String(r.monthlyDay || 15).padStart(2, '0') : "15";
            txDate = `${year}-${month}-${day}`;
          }
          txs.push({ id: `${r.id}_${monthKey}`, title: `${r.name}`, amount: recLog.amountReceived, date: log.paymentDates?.[r.id] || txDate, type: "inflow", wallet: r.wallet || "maya", category: r.category });
        }
      });
    });

    return txs.sort((a, b) => { const dateA = a.date || ""; const dateB = b.date || ""; if (dateA !== dateB) return dateB.localeCompare(dateA); return b.id.localeCompare(a.id); });
  }, [globalData]);

  const recentTransactions = useMemo(() => allTransactions.slice(0, 5), [allTransactions]);

  return {
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