import React from "react";
import { Zap, Banknote, AlertCircle, ArrowRight } from "lucide-react";
import { Bill } from "../types/finance";

interface ExecutionFlowCardProps {
  priorityUnpaidSum: number;
  totalUnpaidCommitments: number;
  overdueBills: Bill[];
  overdueSum: number;
  targetMayaAllocation: number;
  targetMariBankAllocation: number;
  targetGCashAllocation: number;
  targetGoTymeAllocation: number;
  remainingBuffer: number;
  onExecutePaydaySplit: () => void;
}

export const ExecutionFlowCard: React.FC<ExecutionFlowCardProps> = ({
  priorityUnpaidSum,
  totalUnpaidCommitments,
  overdueBills,
  overdueSum,
  targetMayaAllocation,
  targetMariBankAllocation,
  targetGCashAllocation,
  targetGoTymeAllocation,
  remainingBuffer,
  onExecutePaydaySplit
}) => {
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      {/* IMMEDIATE ACTIONS CARD */}
      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3.5">
            <Zap size={14} className="text-amber-400 fill-amber-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Immediate Actions
            </h2>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#14141a] border border-white/[0.04]">
              <span className="text-zinc-400 font-medium no-privacy-blur">Top Priority Unpaid</span>
              <span className="font-mono font-bold text-blue-400">
                ₱{fmt(priorityUnpaidSum)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#14141a] border border-white/[0.04]">
              <span className="text-zinc-400 font-medium no-privacy-blur">Total Commitments Left</span>
              <span className="font-mono font-bold text-rose-400">
                ₱{fmt(totalUnpaidCommitments)}
              </span>
            </div>

            {overdueBills.length > 0 && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-orange-950/20 border border-orange-800/30 text-orange-300">
                <span className="flex items-center gap-1.5 no-privacy-blur text-[11px]">
                  <AlertCircle size={13} className="text-orange-400 shrink-0" />
                  {overdueBills.length} Overdue Commitment{overdueBills.length > 1 ? "s" : ""}
                </span>
                <span className="font-mono font-bold text-[11px] text-orange-300">
                  ₱{fmt(overdueSum)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PAYDAY FLOW CARD */}
      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3.5">
            <Banknote size={14} className="text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Payday Flow (15th & 30th)
            </h2>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-white/[0.03]">
              <span className="text-zinc-400 no-privacy-blur">Maya (Bills & Utilities)</span>
              <span className="font-mono font-semibold text-zinc-200">₱{fmt(targetMayaAllocation)}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.03]">
              <span className="text-zinc-400 no-privacy-blur">MariBank (Japan / Loan Fund)</span>
              <span className="font-mono font-semibold text-zinc-200">₱{fmt(targetMariBankAllocation)}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.03]">
              <span className="text-zinc-400 no-privacy-blur">GCash (UnoBank / Payoff)</span>
              <span className="font-mono font-semibold text-zinc-200">₱{fmt(targetGCashAllocation)}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-white/[0.03]">
              <span className="text-zinc-400 no-privacy-blur">GoTyme (Transit / Daily)</span>
              <span className="font-mono font-semibold text-zinc-200">₱{fmt(targetGoTymeAllocation)}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 text-emerald-400 font-medium">
              <span className="no-privacy-blur">Remaining Buffer</span>
              <span className="font-mono font-bold">₱{fmt(remainingBuffer)}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onExecutePaydaySplit}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20 no-privacy-blur"
        >
          <span>Auto-Distribute to Wallets</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
};