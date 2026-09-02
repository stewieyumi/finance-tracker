import React from "react";

interface LoanProgressBadgeProps {
  startMonth?: string;
  endMonth?: string;
  currentMonth: string;
  monthlyAmount: number;
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
  currentMonth,
  monthlyAmount
}) => {
  const startNum = monthToNumber(startMonth);
  const endNum = monthToNumber(endMonth);
  const currentNum = monthToNumber(currentMonth);

  if (startNum === null || endNum === null || currentNum === null || endNum < startNum) {
    return null;
  }

  const totalMonths = endNum - startNum + 1;
  const elapsedMonths = Math.min(Math.max(currentNum - startNum + 1, 0), totalMonths);
  const remainingMonths = Math.max(0, totalMonths - elapsedMonths);
  const remainingBalance = remainingMonths * (parseFloat(String(monthlyAmount)) || 0);
  const progressPercent = Math.min(100, Math.round((elapsedMonths / totalMonths) * 100));

  const isCompleted = remainingMonths === 0;

  return (
    <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-col gap-1.5 text-[11px]">
      <div className="flex items-center justify-between text-zinc-400">
        <span>
          {isCompleted ? (
            <span className="text-emerald-400 font-medium">✓ Completed</span>
          ) : (
            <>
              Month <strong className="text-zinc-200">{elapsedMonths}</strong> of {totalMonths}
              <span className="text-zinc-500 ml-1">({remainingMonths} left)</span>
            </>
          )}
        </span>
        <span className="font-mono text-zinc-300">
          ₱{remainingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining
        </span>
      </div>

      <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
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