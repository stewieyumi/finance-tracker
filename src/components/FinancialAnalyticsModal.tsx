import { walletSavingsTotals } from "../utils/walletSavings";
import { GuideButton } from "./ContextGuideControls";
import React, { useState, useMemo } from "react";
import { X, Sparkles, ShieldCheck, CreditCard, TrendingUp, Target } from "lucide-react";
import { parseMonthKey } from "../utils/dateHelpers";
import { UnifiedFinanceData } from "../types/finance";
import { DEFAULT_TARGET_FUND } from "../constants/config";
import {
  calculateCashflowMomentum,
  calculateSafeToSpend,
  calculateMonthlyDepositNeeded
} from "../utils/financialAnalytics";
import { reconcileDebt } from "../utils/debtReconciliation";
import { getSafeWalletBalance, resolveActiveWalletDefault } from "../utils/financeHelpers";
import { formatPHP } from "../utils/currency";
import { Modal } from "./ui/Modal";

const debtColors = ["bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-violet-500", "bg-emerald-500"];

type AnalyticsTab = "overview" | "cashflow" | "debt" | "goals";

interface FinancialAnalyticsModalProps {
  isOpen: boolean;
  initialTab?: "overview" | "debt";
  onClose: () => void;
  globalData: UnifiedFinanceData;
  selectedMonth: string;
  totalLiquid: number;
  totalUnpaidCommitments: number;
}

export const FinancialAnalyticsModal: React.FC<FinancialAnalyticsModalProps> = ({
  isOpen,
  initialTab = "overview",
  onClose,
  globalData,
  selectedMonth,
  totalUnpaidCommitments
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);
  const [goalMonths, setGoalMonths] = useState(1);

  const savingsTotals = walletSavingsTotals(globalData);
  const safeToSpend = calculateSafeToSpend(savingsTotals.available, totalUnpaidCommitments);
  const now = new Date();
  const currentMonthDate = parseMonthKey(selectedMonth);
  const isCurrentActiveMonth = now.getFullYear() === currentMonthDate.getFullYear() && now.getMonth() === currentMonthDate.getMonth();
  const totalDaysInMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate();
  const remainingDays = isCurrentActiveMonth ? Math.max(1, totalDaysInMonth - now.getDate() + 1) : totalDaysInMonth;

  const milestoneWalletKey = globalData.settings?.milestoneWallet || resolveActiveWalletDefault(globalData.settings, globalData.wallets);
  const goalBalance = milestoneWalletKey ? getSafeWalletBalance(globalData?.wallets?.[milestoneWalletKey], 0) : 0;
  const targetFund = globalData?.settings?.targetFund ?? globalData?.targetFund ?? DEFAULT_TARGET_FUND;
  const walletLabel = globalData.settings?.customWallets?.find(wallet => wallet.id === milestoneWalletKey)?.label
    || globalData.settings?.walletLabels?.[milestoneWalletKey] || milestoneWalletKey;
  const monthlyDepositNeeded = calculateMonthlyDepositNeeded(targetFund, goalBalance, goalMonths);

  const debt = useMemo(() => reconcileDebt(globalData, selectedMonth), [globalData, selectedMonth]);
  const debtLoans = debt.activeLoans;

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
      <div data-guide-screen={`runway-${activeTab}`}
        className="bg-surface-elevated border border-subtle rounded-3xl p-5 sm:p-6 w-full max-w-2xl space-y-5 shadow-2xl max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-subtle">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h3 data-guide-target="analytics-content" className="text-sm font-bold uppercase tracking-wider text-strong">
              Financial Intelligence & Runway ({selectedMonth})
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1"><GuideButton screen={`runway-${activeTab}`} name="Runway and analytics" />
          <button
            onClick={onClose}
            aria-label="Close analytics modal"
            className="text-faint hover:text-strong p-1 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
          </div>
        </div>

        <div data-guide-target="analytics-tabs" className="flex gap-4 border-b border-subtle overflow-x-auto whitespace-nowrap hide-scrollbar">
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
            <div className="bg-surface-sunken border border-subtle rounded-2xl p-4 flex flex-col justify-between">
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
                Cash after savings minus all remaining unpaid commitments
              </div>
            </div>
          </div>
        )}

        {activeTab === "cashflow" && (
          <div className="bg-surface-sunken border border-subtle rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-secondary flex items-center gap-1.5">
                <TrendingUp size={13} className="text-emerald-400" />
                6-Month Cashflow Momentum (Inflow vs. Commitments)
              </span>
            </div>

            {globalData.library.receivables.some(r => r.frequency === "No Specific Date") && <p className="text-xs text-muted">No-date inflows are excluded from dated projections. Their unpaid balances remain in Pending Inflows.</p>}
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
            <section aria-label="Debt overview" className="debt-summary-card min-w-0 overflow-hidden rounded-3xl border border-subtle p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 font-semibold text-primary"><CreditCard size={15} aria-hidden="true" /> Your installment debt</span>
                <span className="text-muted">{debtLoans.length} active · {debt.completedLoans.length} completed</span>
              </div>
              <dl className="mt-5">
                <dt className="text-xs text-muted">Remaining scheduled payments</dt>
                <dd className="privacy-blur mt-1 break-all font-mono text-3xl font-bold tracking-tight text-strong">{debt.isComplete ? formatPHP(debt.remainingScheduled) : "Review needed"}</dd>
              </dl>
              <dl className="mt-5 grid min-w-0 grid-cols-2 gap-4 border-t border-subtle pt-4 text-xs">
                <div className="min-w-0"><dt className="text-muted">Scheduled in {selectedMonth}</dt><dd className="privacy-blur mt-1 break-all font-mono text-base font-semibold text-primary">{debt.monthlyScheduled === null ? "Review needed" : formatPHP(debt.monthlyScheduled)}</dd></div>
                <div className="min-w-0"><dt className="text-muted">Last planned payment</dt><dd className="mt-1 break-words text-sm font-semibold text-primary">{debt.scheduledFinish ?? (debt.finishStatus === "past-due" ? "Overdue schedule" : debt.finishStatus === "review" ? "Review needed" : "No payments left")}</dd></div>
              </dl>
            </section>
            <p className="text-xs leading-relaxed text-muted">
              Monthly scheduled amounts include payments already settled. The last planned payment includes upcoming plans and assumes the saved schedule is met; it is not a lender payoff quote.
              {debt.finishStatus === "past-due" && " An ended plan still has unpaid installments. Review its payments before estimating a finish date."}
              {debt.approximate && " Includes legacy timing estimates."}
              {!debt.isComplete && " Some schedules or payment history need review."}
            </p>
            {debt.upcomingLoans.length > 0 && <p className="rounded-xl bg-surface-sunken p-3 text-xs text-muted">{debt.upcomingLoans.length} upcoming {debt.upcomingLoans.length === 1 ? "plan" : "plans"} · <span className="privacy-blur font-mono">{debt.upcomingScheduled === null ? "Review needed" : formatPHP(debt.upcomingScheduled)}</span> scheduled separately from active debt.</p>}
            {debt.isComplete && debt.remainingScheduled > 0 && (
              <section aria-label="Active debt breakdown" className="rounded-2xl border border-subtle p-4">
                <h4 className="text-xs font-semibold text-primary">Debt breakdown</h4>
                <div aria-hidden="true" className="mt-3 flex h-2 overflow-hidden rounded-full bg-fill">
                  {debtLoans.map((loan, index) => <span key={loan.id} className={debtColors[index % debtColors.length]} style={{ width: `${(loan.remainingScheduled ?? 0) / debt.remainingScheduled * 100}%` }} />)}
                </div>
                <ul className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-2">
                  {debtLoans.map((loan, index) => <li key={loan.id} className="flex min-w-0 items-start gap-2"><span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${debtColors[index % debtColors.length]}`} /><span className="privacy-blur min-w-0 break-words text-secondary">{loan.name}</span><span className="ml-auto shrink-0 font-mono text-muted">{((loan.remainingScheduled ?? 0) / debt.remainingScheduled * 100).toFixed(1)}%</span></li>)}
                </ul>
              </section>
            )}
            <p className="text-xs text-muted">{debt.isComplete ? "Recorded paid" : "Known paid"}: <span className="privacy-blur font-mono text-primary">{formatPHP(debt.totalPaid)}</span>{debt.approximate ? " · Includes estimates" : ""}</p>
            {debt.loans.some(loan => loan.approximate || loan.issues.length > 0) && (
              <details className="rounded-xl border border-subtle bg-surface-sunken p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-primary">Payment history details ({debt.loans.filter(loan => loan.approximate || loan.issues.length > 0).length})</summary>
                <p className="mt-3 leading-relaxed text-muted">Estimated history uses older saved records. It does not mean a payment is unpaid. Remaining amounts come from the saved schedule and cannot independently verify those payments.</p>
                <ul className="mt-3 space-y-3">
                  {debt.loans.filter(loan => loan.approximate || loan.issues.length > 0).map(loan => (
                    <li key={loan.id} className="min-w-0 rounded-xl border border-subtle bg-surface-low p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="privacy-blur min-w-0 break-words font-semibold text-primary">{loan.name}{loan.archived && " · Archived"}</span><span className={loan.issues.length ? "text-warning" : "text-muted"}>{loan.issues.length ? "History needs review" : "Estimated history"}</span></div>
                      <ul className="privacy-blur mt-2 list-disc space-y-1 break-words pl-4 leading-relaxed text-secondary">
                        {loan.issues.map(issue => <li key={issue}>Review: {issue}</li>)}
                        {loan.estimateNotes.map(note => <li key={note}>{note}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 leading-relaxed text-muted">For missing paid months, use Plan → Commitments → Edit → Review prior payments. Confirm only months you know were paid. This leaves wallets unchanged and does not establish the original payment date. For history conflicts, compare the saved schedule and payments with your records before changing them.</p>
              </details>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <CreditCard size={13} className="text-violet-accent" />
                Active Debt Freedom Runway
              </span>
              <span className="text-[10px] text-faint font-mono">
                {debt.isComplete ? `${debtLoans.length} Active ${debtLoans.length === 1 ? "Installment" : "Installments"}` : "Review loan history"}
              </span>
            </div>

            {debtLoans.length === 0 ? (
              <div className="bg-surface-sunken border border-subtle rounded-xl p-4 text-center text-xs text-faint">
                {debt.isComplete ? "No active loans or installments for this period." : "Debt history needs review before confirming the balance."}
              </div>
            ) : (
              <div className="space-y-2">
                {debtLoans.map(loan => (
                  <div key={loan.id} className="bg-surface-sunken border border-subtle rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap justify-between items-start gap-3 text-xs">
                      <div className="min-w-0 flex-1 break-words">
                        <span className="privacy-blur font-semibold text-strong">{loan.name}{loan.archived && " · Archived"}</span>
                        <span className="text-[10px] text-faint block font-mono">
                          {loan.monthlyAmount === null ? "Scheduled amount needs review" : `${formatPHP(loan.monthlyAmount)}/mo`} • Ends {loan.endMonth}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-xs text-violet-accent font-semibold">
                          {loan.status === "incomplete" ? "History needs review" : `Month ${loan.paidInstallments} of ${loan.totalMonths}`}
                        </span>
                        <span className="text-[10px] text-faint block">
                          {loan.remainingScheduled === null ? "Review needed" : `${formatPHP(loan.remainingScheduled)} left`}
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
            {debt.completedLoans.length > 0 && (
              <details className="rounded-xl bg-surface-sunken p-3 text-xs">
                <summary className="cursor-pointer text-secondary">Completed loans ({debt.completedLoans.length})</summary>
                <ul className="mt-2 space-y-2 text-muted">
                  {debt.completedLoans.map(loan => <li key={loan.id} className="flex flex-wrap justify-between gap-2"><span>{loan.name}{loan.archived && " · Archived"}</span><span className="font-mono">{formatPHP(loan.totalPaid)} recorded paid</span></li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {activeTab === "goals" && targetFund <= 0 && (
          <p className="rounded-xl bg-surface-sunken p-4 text-sm text-muted">
            Set a savings goal to see your monthly deposit pace.
          </p>
        )}

        {activeTab === "goals" && targetFund > 0 && (
          <div className="space-y-4">
            <div className="bg-surface-sunken border border-subtle rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                  <Target size={13} />
                  <span>{globalData?.settings?.goalName || "Milestone Goal"}</span>
                </div>
                <span className="text-[10px] font-mono text-muted bg-inverse/[0.05] px-2 py-0.5 rounded-full border border-subtle">
                  {walletLabel}
                </span>
              </div>

              <label className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                Save over
                <select value={goalMonths} onChange={event => setGoalMonths(Number(event.target.value))}
                  className="rounded-lg border border-strong bg-surface-input px-2 py-1 text-xs text-strong">
                  {[1, 3, 6, 12, 24].map(months => (
                    <option key={months} value={months}>{months} {months === 1 ? "month" : "months"}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="bg-surface border border-subtle rounded-xl p-3">
                  <div className="text-[10px] text-faint uppercase font-semibold">
                    {walletLabel} Balance
                  </div>
                  <div className="text-base font-bold font-mono text-strong mt-0.5">
                    ₱{goalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    <span className="text-[11px] text-faint font-normal block sm:inline sm:ml-1">
                      / ₱{targetFund.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="bg-surface border border-subtle rounded-xl p-3">
                  <div className="text-[10px] text-faint uppercase font-semibold">
                    Monthly Deposit Needed
                  </div>
                  <div className="text-base font-bold font-mono text-blue-400 mt-0.5">
                    ₱{monthlyDepositNeeded.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-faint mt-1 font-mono">
                    Estimated monthly deposit to reach your target.
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
