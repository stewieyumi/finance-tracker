import React from "react";

interface LoanProgressBadgeProps {
  startMonth?: string;
  endMonth?: string;
  targetMonthForDue: string;
  isPaid: boolean;
  monthlyAmount: number;
  totalPaid?: number;
  paidInstallments?: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function monthToNumber(monthStr?: string): number | null {
  if (!monthStr) return null;
  const parts = monthStr.trim().split(" ");
  if (parts.length < 2) return null;
  const monthIndex = MONTH_NAMES.indexOf(parts[0]);
  const year = parseInt(parts[1], 10);
  if (monthIndex === -1 || isNaN(year)) return null;
  return year * 12 + monthIndex;
}

export const LoanProgressBadge: React.FC<LoanProgressBadgeProps> = ({
  startMonth,
  endMonth,
  targetMonthForDue,
  isPaid,
  monthlyAmount,
  totalPaid,
  paidInstallments
}) => {
  const startNum = monthToNumber(startMonth);
  const endNum = monthToNumber(endMonth);
  const targetNum = monthToNumber(targetMonthForDue);

  if (startNum === null || endNum === null || targetNum === null || endNum < startNum) {
    return null;
  }

  const totalMonths = endNum - startNum + 1;

  // Loan progress should reflect actual recorded payments rather than
  // calendar position. This matters when an installment is skipped and
  // a later installment is paid.
  const fallbackElapsed =
    Math.min(
      Math.max(
        targetNum - startNum + (isPaid ? 1 : 0),
        0
      ),
      totalMonths
    );

  const elapsedMonths =
    paidInstallments !== undefined
      ? Math.min(Math.max(paidInstallments, 0), totalMonths)
      : fallbackElapsed;

  const remainingMonths = Math.max(0, totalMonths - elapsedMonths);
  const totalPrincipal = totalMonths * (parseFloat(String(monthlyAmount)) || 0);
  const remainingBalance = totalPaid !== undefined
    ? Math.max(0, totalPrincipal - totalPaid)
    : remainingMonths * (parseFloat(String(monthlyAmount)) || 0);

  const progressPercent = Math.min(
    100,
    Math.round((elapsedMonths / totalMonths) * 100)
  );

  const isCompleted = remainingMonths === 0;

  return (
    <div className="mt-2 pt-2 border-t border-inverse/[0.06] flex flex-col gap-1.5 text-[11px]">
      <div className="flex items-center justify-between text-muted">
        <span>
          {isCompleted ? (
            <span className="text-emerald-400 font-medium">✓ Completed</span>
          ) : (
            <>
              Month <strong className="text-primary">{elapsedMonths}</strong> of {totalMonths}
              <span className="text-faint ml-1">({remainingMonths} left)</span>
            </>
          )}
        </span>
        <span className="font-mono text-secondary">
          ₱{remainingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining
        </span>
      </div>

      <div className="w-full bg-fill-strong/80 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isCompleted ? "bg-emerald-400" : "bg-blue-500"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
};