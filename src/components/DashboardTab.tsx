import React from "react";
import { History, ArrowDownLeft, Calendar, Receipt, Copy } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { MilestoneProgressBar } from "./MilestoneProgressBar";
import { MetricsSummaryGrid } from "./MetricsSummaryGrid";
import { ExecutionFlowCard } from "./ExecutionFlowCard";
import { WalletGrid } from "./WalletGrid";
import {
  UnifiedFinanceData,
  TransactionHistoryItem,
  BillViewModel,
  PaydayExecution
} from "../types/finance";

interface DashboardTabProps {
  globalData: UnifiedFinanceData;
  targetMilestoneFund: number;
  totalLiquid: number;
  fundProgressPercent: string;
  totalPendingReceivables: number;
  monthIncomeCollected: number;
  selectedMonth: string;

  // Execution Flow
  priorityUnpaidSum: number;
  totalUnpaidCommitments: number;
  overdueBills: BillViewModel[];
  overdueSum: number;
  paydayAllocations: Record<string, number>;
  remainingBuffer: number;
  isViewingCurrentMonth: boolean;
  hasExecutedToday?: boolean;
  latestExecution?: PaydayExecution;

  // Transactions
  recentTransactions: TransactionHistoryItem[];

  // Actions
  onOpenSettings: (tab: "general" | "baselines" | "sync") => void;
  onExecutePaydaySplit: () => void;
  onUndoPaydaySplit: (executionId: string) => void;
  onJumpToOverdue: () => void;
  onCommitWallet: (walletId: string, amount: number) => void;
  onIncrementWallet: (walletId: string, amount: number) => void;
  onCopySummary: () => void;
  formatDateTime: (dateStr: string) => string;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  globalData,
  targetMilestoneFund,
  totalLiquid,
  fundProgressPercent,
  totalPendingReceivables,
  monthIncomeCollected,
  selectedMonth,

  priorityUnpaidSum,
  totalUnpaidCommitments,
  overdueBills,
  overdueSum,
  paydayAllocations,
  remainingBuffer,
  isViewingCurrentMonth,
  hasExecutedToday,
  latestExecution,

  recentTransactions,

  onOpenSettings,
  onExecutePaydaySplit,
  onUndoPaydaySplit,
  onJumpToOverdue,
  onCommitWallet,
  onIncrementWallet,
  onCopySummary,
  formatDateTime,
}) => {
  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
      <ErrorBoundary>
        <MilestoneProgressBar
          currentBalance={globalData?.wallets?.[globalData?.settings?.milestoneWallet || "maribank"] || 0}
          targetFund={targetMilestoneFund}
          goalName={globalData?.settings?.goalName}
          onConfigureGoal={() => onOpenSettings("baselines")}
        />
      </ErrorBoundary>
      <ErrorBoundary>
        <MetricsSummaryGrid
          totalLiquid={totalLiquid}
          fundProgressPercent={fundProgressPercent}
          totalPendingReceivables={totalPendingReceivables}
          monthIncomeCollected={monthIncomeCollected}
          selectedMonth={selectedMonth}
        />
      </ErrorBoundary>
      <ErrorBoundary>
        <ExecutionFlowCard
          paydayDays={globalData.settings?.paydayDays}
          priorityUnpaidSum={priorityUnpaidSum}
          totalUnpaidCommitments={totalUnpaidCommitments}
          overdueBills={overdueBills}
          overdueSum={overdueSum}
          paydayAllocations={paydayAllocations}
          onConfigureBaselines={() => onOpenSettings("baselines")}
          remainingBuffer={remainingBuffer}
          customWallets={globalData?.settings?.customWallets}
          onExecutePaydaySplit={onExecutePaydaySplit}
          disabled={!isViewingCurrentMonth || hasExecutedToday}
          onClickOverdue={onJumpToOverdue}
          latestExecution={latestExecution}
          onUndoSplit={onUndoPaydaySplit}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <div className="bg-surface-low border border-inverse/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <History size={13} className="text-purple-400" /> Recent Transactions
            </h2>
          </div>
          <div className="space-y-2">
            {recentTransactions.length === 0 ? (
              <div className="py-4 text-center text-faint text-xs italic">No transactions yet.</div>
            ) : (
              recentTransactions.map((tx: TransactionHistoryItem) => (
                <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-inverse/[0.04] group hover:border-inverse/[0.08] transition">
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${tx.type === 'inflow' ? 'transaction-inflow-icon' : tx.type === 'bill' ? 'transaction-bill-icon' : 'bg-fill border-strong text-muted'}`}>
                      {tx.type === 'inflow' ? <ArrowDownLeft size={14}/> : tx.type === 'bill' ? <Calendar size={14}/> : <Receipt size={14}/>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="privacy-blur text-[13px] font-semibold text-primary truncate">{tx.title}</div>
                      <div className="flex items-center gap-1.5 text-[9px] text-faint mt-0.5">
                        <span className="bg-fill-strong/80 px-1.5 py-0.5 rounded text-secondary font-medium truncate max-w-[90px]">{tx.category || tx.type}</span>
                        <span className="privacy-blur uppercase text-blue-400/80 font-bold truncate max-w-[80px]">{globalData?.settings?.walletLabels?.[tx.wallet || ''] || tx.wallet}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className={`privacy-blur text-[13px] font-bold font-mono ${tx.amount > 0 ? "text-emerald-400" : "text-strong"}`}>
                      {tx.amount > 0 ? "+" : ""}₱{Math.abs(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-faint mt-0.5 whitespace-nowrap">{formatDateTime(tx.date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </ErrorBoundary>

      <ErrorBoundary>
        <WalletGrid
          wallets={globalData?.wallets || {}}
          milestoneWallet={globalData?.settings?.milestoneWallet}
          savingsWallet={globalData?.settings?.savingsWallet}
          customWallets={globalData?.settings?.customWallets}
          onCommit={onCommitWallet}
          onIncrement={onIncrementWallet}
        />
      </ErrorBoundary>
      <button onClick={onCopySummary} className="w-full bg-surface-elevated/90 hover:bg-inverse/[0.06] border border-inverse/[0.06] text-primary font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md">
        <Copy size={14} /> Copy Summary
      </button>
    </div>
  );
};
