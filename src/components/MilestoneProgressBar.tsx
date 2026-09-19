import React from "react";
import { FUND_MILESTONES } from "../constants/config";

interface MilestoneProgressBarProps {
  currentBalance?: number;
  targetFund?: number;
  goalName?: string;
  onConfigureGoal?: () => void;
}

export const MilestoneProgressBar: React.FC<MilestoneProgressBarProps> = React.memo(({
  currentBalance = 0,
  targetFund = 0,
  goalName,
  onConfigureGoal
}) => {
  const hasGoal = !!goalName && targetFund > 0;
  const percentage = hasGoal ? Math.min(100, Math.max(0, (currentBalance / targetFund) * 100)) : 0;
  const fundProgressPercent = percentage.toFixed(1);

  return (
    <div
      onClick={!hasGoal ? onConfigureGoal : undefined}
      className={`bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.5)] rounded-2xl p-4 sm:p-5 transition-all ${!hasGoal && onConfigureGoal ? "cursor-pointer hover:border-blue-500/30" : ""}`}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span className="privacy-blur text-[11px] font-semibold tracking-wider text-muted uppercase">
            {goalName || 'Tap to set a goal...'}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-faint font-mono">₱</span>
          <span className="text-sm sm:text-base font-bold text-strong font-mono tracking-tight">
            {currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] font-semibold font-mono chip-blue px-2 py-0.5 rounded-full ml-1">
            {fundProgressPercent}%
          </span>
        </div>
      </div>

      <div className="w-full bg-surface-lowest rounded-full h-2.5 p-0.5 border border-inverse/[0.04] relative overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="relative w-full h-4 mt-2">
        {FUND_MILESTONES.filter(m => m <= targetFund).map(m => {
          const leftPct = Math.min(100, (m / targetFund) * 100);
          const reached = currentBalance >= m;
          const translate = leftPct < 4 ? "0%" : leftPct > 96 ? "-100%" : "-50%";
          return (
            <span
              key={m}
              className={`absolute top-0 text-[10px] font-mono tracking-tight transition-colors duration-300 ${
                reached ? "text-emerald-400 font-semibold" : "text-disabled"
              }`}
              style={{ left: `${leftPct}%`, transform: `translateX(${translate})` }}
            >
              {m >= 1000 ? `${(m / 1000).toLocaleString("en-US")}k` : m}
            </span>
          );
        })}
      </div>
    </div>
  );
});
