import React from "react";
import { Zap, Banknote, AlertCircle, ArrowRight, Settings, CheckCircle2 } from "lucide-react";
import { Bill, PaydayExecution } from "../types/finance";

interface ExecutionFlowCardProps {
  priorityUnpaidSum: number;
  totalUnpaidCommitments: number;
  overdueBills: Bill[];
  overdueSum: number;
  paydayAllocations: Record<string, number>;
  onConfigureBaselines: () => void;
  remainingBuffer: number;
  walletLabels?: Record<string, string>;
  
  customWallets?: import("../types/finance").CustomWallet[];
  onExecutePaydaySplit: () => void;
  disabled?: boolean;
  latestExecution?: PaydayExecution;
  onUndoSplit?: (id: string) => void;
  onClickOverdue?: () => void;
}

export const ExecutionFlowCard: React.FC<ExecutionFlowCardProps> = ({
  priorityUnpaidSum,
  totalUnpaidCommitments,
  overdueBills,
  overdueSum,
  paydayAllocations,
  onConfigureBaselines,
  remainingBuffer,
  walletLabels,
  customWallets,
  onExecutePaydaySplit,
  disabled = false,
  latestExecution,
  onUndoSplit,
  onClickOverdue
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
              <button
                onClick={onClickOverdue}
                disabled={!onClickOverdue}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-orange-950/20 border border-orange-800/30 text-orange-300 transition hover:bg-orange-950/35 active:scale-[0.99] disabled:cursor-default"
              >
                <span className="flex items-center gap-1.5 no-privacy-blur text-[11px]">
                  <AlertCircle size={13} className="text-orange-400 shrink-0" />
                  {overdueBills.length} Overdue Commitment{overdueBills.length > 1 ? "s" : ""}
                </span>
                <span className="font-mono font-bold text-[11px] text-orange-300">
                  ₱{fmt(overdueSum)}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PAYDAY FLOW CARD */}
      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <Banknote size={14} className="text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Payday Flow (15th & 30th)
              </h2>
            </div>
            <button onClick={onConfigureBaselines} className="text-zinc-500 hover:text-amber-400 transition" title="Configure Baselines & Routing">
              <Settings size={13} />
            </button>
          </div>

          <div className="space-y-1.5 text-xs">
            {Object.entries(paydayAllocations).filter(([_, amount]) => amount > 0).map(([walletKey, amount]) => (
              <div key={walletKey} className="flex items-center justify-between py-1 border-b border-white/[0.03]">
                <span className="privacy-blur text-zinc-400">{customWallets?.find(w => w.id === walletKey)?.label || walletKey.charAt(0).toUpperCase() + walletKey.slice(1)}</span>
                <span className="font-mono font-semibold text-zinc-200">₱{fmt(amount)}</span>
              </div>
            ))}

            <div className="flex items-center justify-between py-1.5 text-emerald-400 font-medium">
              <span className="no-privacy-blur">Remaining Buffer</span>
              <span className="font-mono font-bold">₱{fmt(remainingBuffer)}</span>
            </div>
          </div>
        </div>

                {latestExecution && onUndoSplit && (
          <div className="mt-3 flex items-center justify-between bg-zinc-900/40 border border-zinc-800/80 p-2.5 rounded-xl">
             <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[11px] text-zinc-300">Distributed {latestExecution.date}</span>
             </div>
             <button onClick={() => onUndoSplit(latestExecution.id)} className="text-[10px] px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-lg transition font-medium">
               Undo
             </button>
          </div>
        )}
        <button
          type="button"
          onClick={onExecutePaydaySplit}
          disabled={disabled}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20 no-privacy-blur"
        >
          <span>{disabled ? "Distribution locked / completed" : "Auto-Distribute to Wallets"}</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
};