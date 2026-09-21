import {
  getAdjacentMonth,
  getMonthKey,
  getMonthRange,
  parseDateKey,
  parseMonthKey
} from "./dateHelpers";
import { UnifiedFinanceData } from "../types/finance";
import { getEffectiveBillAmount } from "./financeHelpers";

export interface DebtRunwayItem {
  id: string;
  name: string;
  monthlyAmount: number;
  startMonth?: string;
  endMonth?: string;
  totalMonths: number;
  elapsedMonths: number;
  totalPrincipal: number;
  totalPaid: number;
  remainingPrincipal: number;
  progressPercent: number;
}

export interface CashflowMomentumItem {
  month: string;
  isCurrent: boolean;
  inflow: number;
  bills: number;
}

export function calculateDebtRunway(
  globalData: UnifiedFinanceData,
  selectedMonth: string
): DebtRunwayItem[] {
  const bills = globalData?.library?.bills || [];
  const logs = globalData?.logs || {};
  const currentMonthDate = parseMonthKey(selectedMonth);

  return bills
    .filter(
      b =>
        b.type === "Loan / Installment" &&
        b.startMonth &&
        b.endMonth
    )
    .map(loan => {
      const start = parseMonthKey(loan.startMonth!);
      const end = parseMonthKey(loan.endMonth!);
      const totalMonths = Math.max(
        1,
        (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth()) +
          1
      );

      let elapsedMonths = 0;
      let totalPaid = 0;

      const scanEndMonth =
        currentMonthDate <= end
          ? selectedMonth
          : loan.endMonth!;

      const monthsToCheck = getMonthRange(
        loan.startMonth!,
        scanEndMonth
      );

      for (const monthKey of monthsToCheck) {
        if (logs[monthKey]?.billsPaid?.includes(loan.id)) {
          elapsedMonths++;
          const override = logs[monthKey]?.billOverrides?.[loan.id];
          totalPaid +=
            override !== undefined && Number.isFinite(override)
              ? override
              : parseFloat(String(loan.amount)) || 0;
        }
      }

      const totalPrincipal =
        (parseFloat(String(loan.amount)) || 0) * totalMonths;
      const remainingPrincipal = Math.max(
        0,
        totalPrincipal - totalPaid
      );
      const progressPercent = Math.min(
        100,
        (elapsedMonths / totalMonths) * 100
      );

      return {
        id: loan.id,
        name: loan.name,
        monthlyAmount: parseFloat(String(loan.amount)) || 0,
        startMonth: loan.startMonth,
        endMonth: loan.endMonth,
        totalMonths,
        elapsedMonths,
        totalPrincipal,
        totalPaid,
        remainingPrincipal,
        progressPercent
      };
    });
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

        if (amount <= 0) {
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
