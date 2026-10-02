import React, { useState, useMemo } from "react";
import { X, Sparkles, ShieldCheck, CreditCard, TrendingUp, Target } from "lucide-react";
import { parseMonthKey } from "../utils/dateHelpers";
import { UnifiedFinanceData } from "../types/finance";
import { DEFAULT_TARGET_FUND } from "../constants/config";
import {
  calculateCashflowMomentum,
  calculateDebtRunway,
  calculateSafeToSpend,
  calculateMonthlyDepositNeeded
} from "../utils/financialAnalytics";
import { Modal } from "./ui/Modal";

type AnalyticsTab = "overview" | "cashflow" | "debt" | "goals";

interface FinancialAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  selectedMonth: string;
  totalLiquid: number;
  totalUnpaidCommitments: number;
}

export const FinancialAnalyticsModal: React.FC<FinancialAnalyticsModalProps> = ({
  isOpen,
  onClose,
  globalData,
  selectedMonth,
  totalLiquid,
  totalUnpaidCommitments
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");

  const safeToSpend = calculateSafeToSpend(totalLiquid, totalUnpaidCommitments);
  const now = new Date();
  const currentMonthDate = parseMonthKey(selectedMonth);
  const isCurrentActiveMonth = now.getFullYear() === currentMonthDate.getFullYear() && now.getMonth() === currentMonthDate.getMonth();
  const totalDaysInMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate();
  const remainingDays = isCurrentActiveMonth ? Math.max(1, totalDaysInMonth - now.getDate() + 1) : totalDaysInMonth;

  const milestoneWalletKey = globalData?.settings?.milestoneWallet || 'maribank';
  const maribankBal = globalData?.wallets?.[milestoneWalletKey] || 0;
  const targetFund = globalData?.settings?.targetFund ?? globalData?.targetFund ?? DEFAULT_TARGET_FUND;
  const walletLabel = globalData?.settings?.walletLabels?.[milestoneWalletKey] || "MariBank";
  const monthlyDepositNeeded = calculateMonthlyDepositNeeded(targetFund, maribankBal);

  const debtLoans = useMemo(
    () => calculateDebtRunway(globalData, selectedMonth),
    [globalData, selectedMonth]
  );

  const sparklineData = useMemo(
    () => calculateCashflowMomentum(globalData, selectedMonth),
    [globalData, selectedMonth]
  );

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="floating"
      ariaLabel="Financial Intelligence Modal"
    >
      <div
        className="bg-surface-elevated border border-inverse/[0.09] rounded-3xl p-5 sm:p-6 w-full max-w-2xl space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)] max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-strong">
              Financial Intelligence & Runway ({selectedMonth})
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close analytics modal"
            className="text-faint hover:text-strong p-1 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-4 border-b border-inverse/[0.06] overflow-x-auto whitespace-nowrap hide-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${
              activeTab === "overview"
                ? "text-strong border-b-2 border-emerald-500"
                : "text-faint hover:text-secondary"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cashflow")}
            className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${
              activeTab === "cashflow"
                ? "text-strong border-b-2 border-blue-500"
                : "text-faint hover:text-secondary"
            }`}
          >
            Cashflow
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("debt")}
            className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${
              activeTab === "debt"
                ? "text-strong border-b-2 border-purple-500"
                : "text-faint hover:text-secondary"
            }`}
          >
            Debt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("goals")}
            className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${
              activeTab === "goals"
                ? "text-strong border-b-2 border-amber-500"
                : "text-faint hover:text-secondary"
            }`}
          >
            Goals
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-semibold text-faint tracking-wider flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-400" /> Safe to Spend
                </span>
                <span className="text-[10px] text-faint font-mono">{remainingDays}d left in month</span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">
                ₱{safeToSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-faint mt-1 font-mono">
                Liquid Cash minus all remaining unpaid commitments
              </div>
            </div>
          </div>
        )}

        {activeTab === "cashflow" && (
          <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-secondary flex items-center gap-1.5">
                <TrendingUp size={13} className="text-emerald-400" />
                6-Month Cashflow Momentum (Inflow vs. Commitments)
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5 pt-2 items-end h-28">
              {sparklineData.map((d, i) => {
                const maxVal = Math.max(...sparklineData.map(x => Math.max(x.inflow, x.bills)), 60000);
                const inflowHeight = Math.max(12, (d.inflow / maxVal) * 100);
                const billsHeight = Math.max(12, (d.bills / maxVal) * 100);

                return (
                  <div key={i} className={`flex flex-col items-center gap-1.5 h-full justify-end p-1 rounded-xl transition ${d.isCurrent ? "bg-inverse/[0.08] border border-inverse/[0.12]" : ""}`}>
                    <div className="w-full flex items-end justify-center gap-1 h-16">
                      <div
                        className="w-2.5 bg-emerald-500/80 rounded-t-sm shadow-[0_0_8px_rgba(16,185,129,0.3)] transition-all"
                        style={{ height: `${inflowHeight}%` }}
                        title={`Inflow: ₱${d.inflow.toLocaleString()}`}
                      />
                      <div
                        className="w-2.5 bg-rose-500/80 rounded-t-sm shadow-[0_0_8px_rgba(244,63,94,0.3)] transition-all"
                        style={{ height: `${billsHeight}%` }}
                        title={`Commitments: ₱${d.bills.toLocaleString()}`}
                      />
                    </div>
                    <span className={`text-[10px] font-mono ${d.isCurrent ? "text-strong font-bold" : "text-faint"}`}>
                      {d.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "debt" && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <CreditCard size={13} className="text-purple-400" />
                Active Debt Freedom Runway
              </span>
              <span className="text-[10px] text-faint font-mono">
                {debtLoans.length} Active Installments
              </span>
            </div>

            {debtLoans.length === 0 ? (
              <div className="bg-surface-sunken border border-inverse/[0.05] rounded-xl p-4 text-center text-xs text-faint">
                No active loans or installments for this period.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {debtLoans.map(loan => (
                  <div key={loan.id} className="bg-surface-sunken border border-inverse/[0.05] rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <span className="privacy-blur font-semibold text-strong">{loan.name}</span>
                        <span className="text-[10px] text-faint block font-mono">
                          ₱{loan.monthlyAmount.toLocaleString("en-US")}/mo • Ends {loan.endMonth}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-xs text-purple-300 font-semibold">
                          Month {loan.elapsedMonths} of {loan.totalMonths}
                        </span>
                        <span className="text-[10px] text-faint block">
                          ₱{loan.remainingPrincipal.toLocaleString("en-US")} left
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-inverse/[0.05] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                        style={{ width: `${loan.progressPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "goals" && (
          <div className="space-y-4">
            <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                  <Target size={13} />
                  <span>{globalData?.settings?.goalName || "Milestone Goal"}</span>
                </div>
                <span className="text-[10px] font-mono text-muted bg-inverse/[0.05] px-2 py-0.5 rounded-full border border-inverse/[0.08]">
                  {walletLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="bg-surface border border-inverse/[0.05] rounded-xl p-3">
                  <div className="text-[10px] text-faint uppercase font-semibold">
                    {walletLabel} Balance
                  </div>
                  <div className="text-base font-bold font-mono text-strong mt-0.5">
                    ₱{maribankBal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    <span className="text-[11px] text-faint font-normal block sm:inline sm:ml-1">
                      / ₱{targetFund.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="bg-surface border border-inverse/[0.05] rounded-xl p-3">
                  <div className="text-[10px] text-faint uppercase font-semibold">
                    Monthly Deposit Needed
                  </div>
                  <div className="text-base font-bold font-mono text-blue-400 mt-0.5">
                    ₱{monthlyDepositNeeded.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-faint mt-1 font-mono">
                    Remaining amount needed to reach your target.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-inverse/[0.08] hover:bg-inverse/[0.12] text-strong text-xs font-semibold py-2.5 rounded-xl transition"
        >
          Done
        </button>
      </div>
    </Modal>
  );
};
