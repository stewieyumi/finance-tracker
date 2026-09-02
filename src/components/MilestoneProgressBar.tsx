import React from "react";
import { FUND_MILESTONES } from "../constants/config";

interface MilestoneProgressBarProps {
  maribankBalance?: number;
  targetFund?: number;
}

export const MilestoneProgressBar: React.FC<MilestoneProgressBarProps> = React.memo(({
  maribankBalance = 0,
  targetFund = 80000
}) => {
  const percentage = Math.min(100, Math.max(0, (maribankBalance / targetFund) * 100));
  const fundProgressPercent = percentage.toFixed(1);

  return (
    <div className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.5)] rounded-2xl p-4 sm:p-5 transition-all">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Japan ADB Target Milestone
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-zinc-500 font-mono">₱</span>
          <span className="text-sm sm:text-base font-bold text-white font-mono tracking-tight">
            {maribankBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] font-semibold text-blue-400 font-mono bg-blue-950/50 border border-blue-800/40 px-2 py-0.5 rounded-full ml-1">
            {fundProgressPercent}%
          </span>
        </div>
      </div>

      <div className="w-full bg-[#08080a] rounded-full h-2.5 p-0.5 border border-white/[0.04] relative overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 shadow-[0_0_12px_rgba(59,130,246,0.5)] transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="relative w-full h-4 mt-2">
        {FUND_MILESTONES.filter(m => m <= targetFund).map(m => {
          const leftPct = Math.min(100, (m / targetFund) * 100);
          const reached = maribankBalance >= m;
          const translate = leftPct < 4 ? "0%" : leftPct > 96 ? "-100%" : "-50%";
          return (
            <span
              key={m}
              className={`absolute top-0 text-[10px] font-mono tracking-tight transition-colors duration-300 ${
                reached ? "text-emerald-400 font-semibold" : "text-zinc-600"
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
