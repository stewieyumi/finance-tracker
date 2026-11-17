import {
  getAdjacentMonth,
  getMonthKey,
  parseDateKey,
  parseMonthKey
} from "./dateHelpers";
import { UnifiedFinanceData } from "../types/finance";
import { reconcileDebt } from "./debtReconciliation";
import { getEffectiveBillAmount } from "./financeHelpers";

export interface DebtRunwayItem {
  id: string;
  name: string;
  monthlyAmount: number | null;
  startMonth?: string;
  endMonth?: string;
  totalMonths: number;
  elapsedMonths: number;
  /** Scheduled total, retained under the legacy field name; not bank principal. */
  totalPrincipal: number | null;
  totalPaid: number;
  remainingPrincipal: number | null;
  progressPercent: number;
}

export interface CashflowMomentumItem {
  month: string;
  isCurrent: boolean;
  inflow: number;
  bills: number;
}

export function calculateSafeToSpend(
  totalLiquid: number,
  totalUnpaidCommitments: number
): number {
  return Math.max(0, (totalLiquid || 0) - (totalUnpaidCommitments || 0));
}

export function calculateMonthlyDepositNeeded(
  targetFund: number,
  currentBalance: number,
  months = 1
): number {
  const remaining = Math.max(0, (targetFund || 0) - (currentBalance || 0));
  const periods = Number.isSafeInteger(months) && months > 0 ? months : 1;
  return Math.ceil(Math.round(remaining * 100) / periods) / 100;
}


export function calculateDebtRunway(
  globalData: UnifiedFinanceData,
  selectedMonth: string
): DebtRunwayItem[] {
  return reconcileDebt(globalData, selectedMonth).activeLoans.map(loan => ({
    id: loan.id, name: loan.name, monthlyAmount: loan.monthlyAmount,
    startMonth: loan.startMonth, endMonth: loan.endMonth,
    totalMonths: loan.totalMonths, elapsedMonths: loan.paidInstallments,
    totalPrincipal: loan.remainingScheduled === null ? null : loan.totalPaid + loan.remainingScheduled,
    totalPaid: loan.totalPaid,
    remainingPrincipal: loan.remainingScheduled,
    progressPercent: loan.progressPercent
  }));
}

export function calculateCashflowMomentum(
  globalData: UnifiedFinanceData,
  selectedMonth: string
): CashflowMomentumItem[] {
  const months: CashflowMomentumItem[] = [];
  const bills = globalData?.library?.bills || [];
  const receivables = globalData?.library?.receivables || [];
  const logs = globalData?.logs || {};

  const fallbackStartMonth = getMonthKey(new Date());

  for (let i = -3; i <= 2; i++) {
    const mKey = getAdjacentMonth(selectedMonth, i);
    const mDate = parseMonthKey(mKey);
    const mLog = logs[mKey] || {
      billsPaid: [],
      recsCollected: {}
    };

    const totalBills = bills
      .filter(bill => {
        const startMonth = bill.startMonth || fallbackStartMonth;
        const startDate = parseMonthKey(startMonth);

        if (mDate < startDate) {
          return false;
        }

        if (
          bill.type === "Loan / Installment" &&
          bill.endMonth &&
          mDate > parseMonthKey(bill.endMonth)
        ) {
          return false;
        }

        return true;
      })
      .reduce((sum, bill) => {
        const baseAmount =
          parseFloat(String(bill.amount)) || 0;

        const override =
          mLog.billOverrides?.[bill.id];

        const effectiveAmount = getEffectiveBillAmount(
          baseAmount,
          override
        );

        return sum + Math.max(0, effectiveAmount);
      }, 0);

    const totalInflow = receivables.reduce(
      (sum, receivable) => {
        const amount = Math.max(
          0,
          parseFloat(String(receivable.amount)) || 0
        );

        if (receivable.amountUnspecified || amount <= 0) {
          return sum;
        }

        let isScheduled = false;

        if (
          receivable.frequency === "Monthly" ||
          receivable.frequency === "Bi-monthly"
        ) {
          const startMonth =
            receivable.startMonth ||
            fallbackStartMonth;

          isScheduled =
            mDate >= parseMonthKey(startMonth);
        } else if (receivable.frequency === "By Date") {
          if (!receivable.date) {
            isScheduled = false;
          } else {
            const exactMonth = getMonthKey(
              parseDateKey(receivable.date)
            );

            isScheduled = exactMonth === mKey;
          }
        }

        if (!isScheduled) {
          return sum;
        }

        const recLog =
          mLog.recsCollected?.[receivable.id];

        if (recLog) {
          const received = Math.min(
            amount,
            Math.max(
              0,
              parseFloat(String(recLog.amountReceived)) || 0
            )
          );

          return sum + (received > 0 ? received : amount);
        }

        return sum + amount;
      },
      0
    );

    months.push({
      month: mKey.split(" ")[0].slice(0, 3),
      isCurrent: mKey === selectedMonth,
      inflow: totalInflow,
      bills: totalBills
    });
  }

  return months;
}
