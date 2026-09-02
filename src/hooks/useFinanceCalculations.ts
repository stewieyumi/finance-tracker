import { useMemo } from "react";
import { UnifiedFinanceData } from "../types/finance";
import { parseMonthKey, getMonthKey, getAdjacentMonth, getDaysUntil } from "../utils/dateHelpers";

export function useFinanceCalculations(globalData: UnifiedFinanceData, selectedMonth: string) {
  const currentMonthDate = parseMonthKey(selectedMonth);

  const activeBills = useMemo(() => {
    if (!globalData?.library?.bills) return [];

    return globalData.library.bills.filter(b => {
      const start = parseMonthKey(b.startMonth || "August 2026");
      if (currentMonthDate < start) return false;
      if (b.type === "Loan / Installment" && b.endMonth && currentMonthDate > parseMonthKey(b.endMonth)) return false;
      return true;
    }).map(b => {
      let oldestUnpaid: string | null = null;
      let ptrMonth = b.startMonth || "August 2026";
      let loopFailsafe = 0;
      while (parseMonthKey(ptrMonth) <= currentMonthDate && loopFailsafe < 120) {
        if (b.type === "Loan / Installment" && b.endMonth && parseMonthKey(ptrMonth) > parseMonthKey(b.endMonth)) break;
        const isPaid = globalData.logs?.[ptrMonth]?.billsPaid?.includes(b.id);
        if (!isPaid) { oldestUnpaid = ptrMonth; break; }
        ptrMonth = getAdjacentMonth(ptrMonth, 1);
        loopFailsafe++;
      }
      const isPaidThisMonth = !oldestUnpaid;
      const targetMonthForDue = oldestUnpaid || selectedMonth;
      const daysLeft = getDaysUntil(b.dueDay, targetMonthForDue);

      const targetOverride = globalData.logs?.[targetMonthForDue]?.billOverrides?.[b.id];
      const effectiveAmount = targetOverride !== undefined ? targetOverride : b.amount;
      const isOverridden = targetOverride !== undefined;

      return {
        ...b,
        amount: effectiveAmount,
        baseAmount: b.amount,
        isOverridden,
        paid: isPaidThisMonth,
        targetMonthForDue,
        daysLeft
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

  const activeReceivables = useMemo(() => {
    if (!globalData?.library?.receivables) return [];
    return globalData.library.receivables.filter(r => {
      if (r.frequency === "Monthly" || r.frequency === "Bi-monthly") {
        const start = parseMonthKey(r.startMonth || "August 2026");
        if (currentMonthDate < start) return false;
        return true;
      }
      if (r.frequency === "By Date") {
        if (!r.date) return true;
        const exactMonth = getMonthKey(new Date(r.date.replace(/-/g, "/")));
        if (selectedMonth !== exactMonth && globalData.logs?.[exactMonth]?.recsCollected?.[r.id]?.collected) {
          return false;
        }
      }
      return true;
    }).map(r => {
      let targetMonthForDue = selectedMonth;
      let oldestUncollected: string | null = null;
      if (r.frequency === "By Date") {
        targetMonthForDue = r.date ? getMonthKey(new Date(r.date.replace(/-/g, "/"))) : selectedMonth;
      } else {
        let ptrMonth = r.startMonth || "August 2026";
        let loopFailsafe = 0;
        while (parseMonthKey(ptrMonth) <= currentMonthDate && loopFailsafe < 120) {
          const isCol = globalData.logs?.[ptrMonth]?.recsCollected?.[r.id]?.collected;
          if (!isCol) { oldestUncollected = ptrMonth; break; }
          ptrMonth = getAdjacentMonth(ptrMonth, 1);
          loopFailsafe++;
        }
        targetMonthForDue = oldestUncollected || selectedMonth;
      }
      const log = globalData.logs?.[targetMonthForDue]?.recsCollected?.[r.id] || { amountReceived: 0, collected: false };
      return { ...r, amountReceived: log.amountReceived, collected: log.collected, targetMonthForDue };
    }).sort((a, b) => {
      const fw = (f: string) => (f === "Bi-monthly" ? 1 : f === "Monthly" ? 2 : 3);
      if (!a.date && b.date) return 1; if (a.date && !b.date) return -1;
      if (a.date && b.date) {
        const dDiff = new Date(a.date.replace(/-/g, "/")).getTime() - new Date(b.date.replace(/-/g, "/")).getTime();
        if (dDiff !== 0) return dDiff;
      }
      if (fw(a.frequency) !== fw(b.frequency)) return fw(a.frequency) - fw(b.frequency);
      if (a.collected !== b.collected) return a.collected ? 1 : -1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [globalData, selectedMonth, currentMonthDate]);

  const activeShoots = useMemo(() => {
    if (!globalData?.library?.shoots) return [];
    return globalData.library.shoots.filter(s => {
      if (!s.date) return true;
      const sMonth = parseMonthKey(getMonthKey(new Date(s.date.replace(/-/g, "/"))));
      if (currentMonthDate < sMonth) return false;
      if (s.completed && currentMonthDate > sMonth) return false;
      return true;
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.date && b.date) return 1; if (a.date && !b.date) return -1;
      if (a.date && b.date) {
        const dDiff = new Date(a.date.replace(/-/g, "/")).getTime() - new Date(b.date.replace(/-/g, "/")).getTime();
        if (dDiff !== 0) return dDiff;
      }
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [globalData, currentMonthDate]);

  const totalLiquid = useMemo(() => Object.values(globalData?.wallets || {}).reduce((a, c) => a + (parseFloat(String(c)) || 0), 0), [globalData?.wallets]);
  const targetMilestoneFund = globalData?.settings?.targetFund ?? globalData?.targetFund ?? 80000;
  const fundProgressPercent = useMemo(() => (((globalData?.wallets?.maribank || 0) / targetMilestoneFund) * 100).toFixed(1), [globalData?.wallets?.maribank, targetMilestoneFund]);
  const totalPendingReceivables = useMemo(() => activeReceivables.filter(r => !r.collected).reduce((a, c) => a + Math.max(0, (parseFloat(String(c.amount)) || 0) - (parseFloat(String(c.amountReceived)) || 0)), 0), [activeReceivables]);
  const monthIncomeCollected = useMemo(() => activeReceivables.reduce((a, c) => a + (parseFloat(String(c.amountReceived)) || 0), 0), [activeReceivables]);
  const totalUnpaidCommitments = useMemo(() => activeBills.filter(b => !b.paid).reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [activeBills]);
  const priorityUnpaidBills = useMemo(() => activeBills.filter(b => !b.paid).slice(0, 3), [activeBills]);
  const priorityUnpaidSum = useMemo(() => priorityUnpaidBills.reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [priorityUnpaidBills]);
  const overdueBills = useMemo(() => activeBills.filter(b => !b.paid && (b.daysLeft ?? 0) < 0), [activeBills]);
  const overdueSum = useMemo(() => overdueBills.reduce((a, c) => a + (parseFloat(String(c.amount)) || 0), 0), [overdueBills]);
  const cashShortfall = totalUnpaidCommitments - totalLiquid;

  const perPayoutSalary = globalData?.settings?.perPayoutSalary ?? 15000;
  const targetGoTymeAllocation = globalData?.settings?.defaultTransitAllocation ?? 1500;
  const spayLaterBill = activeBills.find(b => b.name.toLowerCase().includes("spaylater") && !b.paid);
  const unoBankBill = activeBills.find(b => b.name.toLowerCase().includes("unobank") && !b.paid);
  const spayLaterAmount = spayLaterBill ? spayLaterBill.amount : 0;
  const unoBankAmount = unoBankBill ? unoBankBill.amount : 0;
  const otherUnpaidBillsSum = totalUnpaidCommitments - spayLaterAmount - unoBankAmount;
  const targetMayaAllocation = Math.max(0, otherUnpaidBillsSum / 2);
  const targetMariBankAllocation = spayLaterAmount > 0 ? spayLaterAmount / 2 : 0;
  const targetGCashAllocation = unoBankAmount > 0 ? unoBankAmount / 2 : 0;
  const totalAllocatedPerPayout = targetMayaAllocation + targetMariBankAllocation + targetGCashAllocation + targetGoTymeAllocation;
  const remainingBuffer = perPayoutSalary - totalAllocatedPerPayout;

  return {
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
    targetMayaAllocation,
    targetMariBankAllocation,
    targetGCashAllocation,
    targetGoTymeAllocation,
    remainingBuffer
  };
}