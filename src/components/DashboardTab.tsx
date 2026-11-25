import { formatPHP } from "../utils/currency";
import { walletSavingsTotals } from "../utils/walletSavings";
import { budgetCash } from "../utils/budgeting";
import { GuideButton } from "./ContextGuideControls";
import { formatHistoryDate } from "../utils/transactionDates";
import { InflowIncomeNotes } from "./InflowIncomeNotes";
import type { InflowIncomeReport } from "../utils/inflowIncome";
import React, { useState, useRef, useMemo } from "react";
import {
  History,
  ArrowDownLeft,
  Calendar,
  Receipt,
  Copy,
  TrendingUp,
  ShieldCheck,
  CreditCard,
  Wallet,
  AlertCircle,
  Banknote,
  ArrowRight,
  Plus,
  ChevronRight,
  CircleHelp,
  CheckCircle2
} from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { MilestoneProgressBar } from "./MilestoneProgressBar";
import { PaydayModal } from "./PaydayModal";
import { QuickAddModal, QuickAddAction } from "./QuickAddModal";
import { UpcomingModal } from "./UpcomingModal";
import { Modal } from "./ui/Modal";
import {
  UnifiedFinanceData,
  TransactionHistoryItem,
  BillViewModel,
  PaydayExecution, FinanceTransitionCommitter, ReceivedIncomeDraft
} from "../types/finance";
import { calculateSafeToSpend } from "../utils/financialAnalytics";
import { reconcileWalletBalances, validateActiveWalletAssignment } from "../utils/financeHelpers";

import { reconcileDebt } from "../utils/debtReconciliation";

const carouselSlideClass = "flex w-full shrink-0 snap-center";

interface DashboardTabProps {
  globalData: UnifiedFinanceData;
  commitBudgetTransition?: FinanceTransitionCommitter;
  onBudgetMessage?: (message: string) => void;
  distributionDraft?: ReceivedIncomeDraft;
  onDistributionClose?: () => void;
  targetMilestoneFund: number;
  totalLiquid: number;
  fundProgressPercent: string;
  totalPendingReceivables: number;
  monthIncomeCollected: number;
  incomeReport?: InflowIncomeReport;
  selectedMonth: string;

  // Execution Flow
  priorityUnpaidSum: number;
  totalUnpaidCommitments: number;
  overdueBills: BillViewModel[];
  overdueSum: number;
  paydayAllocations: Record<string, number>;
  isViewingCurrentMonth: boolean;
  latestExecution?: PaydayExecution;

  // Transactions
  recentTransactions: TransactionHistoryItem[];

  // Actions
  onOpenSettings: (tab: "general" | "baselines" | "sync" | "wallets") => void;
  onConfigureGoal?: () => void;
  onStartTour?: () => void;
  onUndoPaydaySplit: (executionId: string) => void;
  onJumpToOverdue: () => void;
  onCommitWallet?: (walletId: string, amount: number) => void;
  onIncrementWallet?: (walletId: string, amount: number) => void;
  onCopySummary: () => void;
  formatDateTime: (dateStr: string, loggedAt?: string | number) => string;

  // Navigation callbacks
  onNavigateToWallets?: () => void;
  onNavigateToOps?: (tab?: "bills" | "inflows" | "gigs") => void;
  onNavigateToExpenses?: () => void;
  onOpenAnalytics?: () => void;
  onOpenYearlyModal?: () => void;
  onOpenLedger?: () => void;
  activeBills?: BillViewModel[];
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  globalData,
  commitBudgetTransition, onBudgetMessage, distributionDraft, onDistributionClose,
  targetMilestoneFund,
  totalLiquid,
  fundProgressPercent,
  totalPendingReceivables,
  monthIncomeCollected,
  incomeReport,
  selectedMonth,

  priorityUnpaidSum,
  totalUnpaidCommitments,
  overdueBills = [],
  overdueSum = 0,
  paydayAllocations = {},
  isViewingCurrentMonth,
  latestExecution,

  recentTransactions = [],

  onOpenSettings,
  onConfigureGoal,
  onStartTour,
  onUndoPaydaySplit,
  onJumpToOverdue,
  onCopySummary,
  formatDateTime,

  onNavigateToWallets,
  onNavigateToOps,
  onNavigateToExpenses,
  onOpenAnalytics,
  onOpenYearlyModal,
  onOpenLedger,
  activeBills
}) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [showPaydayModal, setShowPaydayModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selectedYear = selectedMonth.split(" ")[1] || "2026";
  const savingsTotals = useMemo(() => walletSavingsTotals(globalData), [globalData]);
  const safeToSpend = calculateSafeToSpend(savingsTotals.available, totalUnpaidCommitments);
  const reconciled = useMemo(() => reconcileWalletBalances(globalData), [globalData]);

  const debt = useMemo(() => reconcileDebt(globalData, selectedMonth), [globalData, selectedMonth]);
  const debtLoans = debt.activeLoans;
  const totalDebtPrincipal = debt.remainingScheduled;

  const unpaidCount = useMemo(() => {
    if (activeBills && activeBills.length > 0) {
      return activeBills.filter(b => !b.paid).length;
    }
    return overdueBills.length;
  }, [activeBills, overdueBills]);

  const handleCarouselScroll = () => {
    const container = carouselRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const viewportCenter = containerRect.left + container.clientWidth / 2;

    let closestIndex = 0;
    let minDistance = Infinity;

    slideRefs.current.forEach((slide, idx) => {
      if (!slide) return;
      const slideRect = slide.getBoundingClientRect();
      const slideCenter = slideRect.left + slideRect.width / 2;
      const distance = Math.abs(slideCenter - viewportCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (closestIndex !== activeSlide) {
      setActiveSlide(closestIndex);
    }
  };

  const scrollToSlide = (index: number) => {
    const container = carouselRef.current;
    if (!container) return;
    const clampedIndex = Math.max(0, Math.min(index, 3));
    const slide = slideRefs.current[clampedIndex];

    if (!slide) return;
    const targetScrollLeft = slide.offsetLeft;

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        left: targetScrollLeft,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "instant" : "smooth"
      });
    } else {
      container.scrollLeft = targetScrollLeft;
    }
    setActiveSlide(clampedIndex);
  };

  const handleQuickAddAction = (action: QuickAddAction) => {
    switch (action) {
      case "expense":
        onNavigateToExpenses?.();
        break;
      case "bill":
        onNavigateToOps?.("bills");
        break;
      case "inflow":
        onNavigateToOps?.("inflows");
        break;
      case "gig":
        onNavigateToOps?.("gigs");
        break;
      case "wallet":
        onNavigateToWallets?.();
        break;
    }
  };

  const gettingStartedSteps = ([
    {
      action: "wallet",
      complete: reconciled.activeWallets.some(wallet => wallet.balance > 0 && validateActiveWalletAssignment(wallet.id, globalData.settings, globalData.wallets).ok),
      title: "Start with a wallet",
      description: "Use an existing wallet or add an account, then enter its current balance.",
      icon: Wallet,
      available: onNavigateToWallets,
    },
    {
      action: "expense",
      complete: (globalData.library.expenses?.length ?? 0) > 0,
      title: "Record your first expense",
      description: "Choose Scan or Manual, review the details, and save to the wallet you paid from.",
      icon: Receipt,
      available: onNavigateToExpenses,
    },
    {
      action: "inflow",
      complete: (globalData.library.receivables?.length ?? 0) > 0,
      title: "Track incoming money",
      description: "Add a client payment, salary, sale, or allowance. Amount and date can wait.",
      icon: ArrowDownLeft,
      available: onNavigateToOps,
    },
    {
      action: "bill",
      complete: (globalData.library.bills?.length ?? 0) > 0,
      title: "Set up a commitment",
      description: "Choose Add New Commitment to track a bill, subscription, or installment.",
      icon: Calendar,
      available: onNavigateToOps,
    },
  ] as const).filter(step => step.available);

  const getCarouselCardClass = (isActive: boolean, interactiveHover?: string) =>
    `min-w-0 flex-1 min-h-[156px] sm:min-h-[160px] dashboard-material rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-3 transition-colors ${
      isActive
        ? interactiveHover || ""
        : "cursor-pointer"
    }`;

  return (
    <div data-guide-screen="dashboard" className="space-y-5 sm:space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
        <div className="flex justify-end"><GuideButton screen="dashboard" name="Dashboard" /></div>
      {/* 1. FINANCIAL OVERVIEW CAROUSEL STAGE */}
      <div className="w-full space-y-2.5">
        {/* Contained Stage Viewport */}
        <div className="relative py-2 sm:py-3">
          {/* Scroll Viewport */}
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="w-full overflow-x-auto overflow-y-hidden rounded-3xl snap-x snap-mandatory shadow-sm"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="relative flex gap-4">
              {/* SLIDE 1: FINANCIAL OVERVIEW */}
              <div
                ref={(el) => {
                  slideRefs.current[0] = el;
                }}
                className={carouselSlideClass}
              >
                <div
                  role={activeSlide !== 0 ? "button" : undefined}
                  tabIndex={activeSlide !== 0 ? 0 : undefined}
                  data-guide-target="overview" aria-label="Financial Overview"
                  onClick={() => {
                    if (activeSlide !== 0) scrollToSlide(0);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && activeSlide !== 0) {
                      e.preventDefault();
                      scrollToSlide(0);
                    }
                  }}
                  className={getCarouselCardClass(activeSlide === 0)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-blue-400" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                        Financial Overview
                      </h2>
                    </div>
                    <span className="text-[10px] text-faint font-mono">{selectedMonth}</span>
                  </div>

                  <div className="grid divide-y divide-subtle sm:my-auto sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:text-center">
                    <div className="flex min-w-0 items-center justify-between gap-3 py-3 sm:block sm:px-4">
                      <div className="text-xs font-medium text-muted">Fund Progress</div>
                      <div className="text-sm sm:text-base font-semibold font-mono tracking-tight text-right sm:mt-1 sm:text-center text-strong">
                        {fundProgressPercent}%
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center justify-between gap-3 py-3 sm:block sm:px-4">
                      <div className="text-xs font-medium text-muted">Pending Inflows</div>
                      <div className="text-sm sm:text-base font-semibold font-mono tracking-tight text-right sm:mt-1 sm:text-center text-warning">
                        ₱{totalPendingReceivables.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 sm:block sm:px-4">
                      <div className="text-xs font-medium text-muted">
                        {selectedMonth.split(" ")[0]} Income
                      </div>
                      <div className="text-sm sm:text-base font-semibold font-mono tracking-tight text-right sm:mt-1 sm:text-center text-positive">
                        ₱{monthIncomeCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                      {incomeReport && <div className="col-span-2"><InflowIncomeNotes report={incomeReport} /></div>}
                    </div>
                  </div>
                </div>
              </div>

              {/* SLIDE 2: SAFE TO SPEND */}
              <div
                ref={(el) => {
                  slideRefs.current[1] = el;
                }}
                className={carouselSlideClass}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Safe to Spend, View Runway and Details"
                  onClick={() => {
                    if (activeSlide !== 1) {
                      scrollToSlide(1);
                    } else if (onOpenAnalytics) {
                      onOpenAnalytics();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (activeSlide !== 1) {
                        scrollToSlide(1);
                      } else if (onOpenAnalytics) {
                        onOpenAnalytics();
                      }
                    }
                  }}
                  className={getCarouselCardClass(
                    activeSlide === 1,
                    onOpenAnalytics ? "cursor-pointer hover:border-emerald-500/30 group" : ""
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-positive" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-positive">
                        Safe to Spend
                      </h2>
                    </div>
                    {onOpenAnalytics && (
                      <span className="text-[11px] font-medium text-muted group-hover:text-positive transition flex items-center gap-1">
                        Runway & Details <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </div>

                  <div className="my-auto">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-positive tracking-tight">
                      ₱{safeToSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted mt-0.5 sm:mt-1 font-medium">
                      Cash after savings minus all remaining unpaid commitments
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2 border-t border-inverse/[0.04] text-[11px] text-faint">
                    <span className="font-mono">
                      After savings: ₱{savingsTotals.available.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="font-mono">
                      Commitments: ₱{totalUnpaidCommitments.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* SLIDE 3: ACTIVE DEBT */}
              <div
                ref={(el) => {
                  slideRefs.current[2] = el;
                }}
                className={carouselSlideClass}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Active Debt, View Debt Runway"
                  onClick={() => {
                    if (activeSlide !== 2) {
                      scrollToSlide(2);
                    } else if (onOpenAnalytics) {
                      onOpenAnalytics();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (activeSlide !== 2) {
                        scrollToSlide(2);
                      } else if (onOpenAnalytics) {
                        onOpenAnalytics();
                      }
                    }
                  }}
                  className={getCarouselCardClass(
                    activeSlide === 2,
                    onOpenAnalytics ? "cursor-pointer hover:border-purple-500/30 group" : ""
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <CreditCard size={15} className="text-violet-accent" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-violet-accent">
                        Active Debt
                      </h2>
                    </div>
                    <span className="text-[10px] text-faint font-mono">
                      {debt.isComplete ? `${debtLoans.length} ${debtLoans.length === 1 ? "Active Loan" : "Active Loans"}` : "Review loan history"}
                    </span>
                  </div>

                  <div className="my-auto">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-strong tracking-tight">
                      {!debt.isComplete ? "Review needed" : debtLoans.length > 0
                        ? `₱${totalDebtPrincipal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "100% Debt-Free"}
                    </div>
                    <p className="text-xs text-muted mt-0.5 sm:mt-1 font-medium">
                      {!debt.isComplete ? "Some records need review before calculating debt" : debtLoans.length > 0
                        ? "Remaining scheduled payments, including archived debt"
                        : "No active installment debt obligations"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2 border-t border-inverse/[0.04] text-[11px]">
                    <span className="text-faint font-mono">
                      {debt.completedLoans.length} completed • {debt.totalPaid.toLocaleString("en-PH", { style: "currency", currency: "PHP" })} {!debt.isComplete ? "known paid" : debt.approximate ? "estimated paid" : "recorded paid"}
                    </span>
                    {onOpenAnalytics && (
                      <span className="font-medium text-violet-accent flex items-center gap-1 group-hover:text-violet-accent transition">
                        View Debt Runway <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SLIDE 4: YEARLY OVERVIEW */}
              <div
                ref={(el) => {
                  slideRefs.current[3] = el;
                }}
                className={carouselSlideClass}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Yearly Overview, Open Annual Summary"
                  onClick={() => {
                    if (activeSlide !== 3) {
                      scrollToSlide(3);
                    } else if (onOpenYearlyModal) {
                      onOpenYearlyModal();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (activeSlide !== 3) {
                        scrollToSlide(3);
                      } else if (onOpenYearlyModal) {
                        onOpenYearlyModal();
                      }
                    }
                  }}
                  className={getCarouselCardClass(
                    activeSlide === 3,
                    onOpenYearlyModal ? "cursor-pointer hover:border-emerald-500/30 group" : ""
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Calendar size={15} className="text-positive" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-positive">
                        Yearly Overview
                      </h2>
                    </div>
                    <span className="text-[10px] text-faint font-mono">{selectedYear}</span>
                  </div>

                  <div className="my-auto">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-positive tracking-tight">
                      {selectedYear} Summary
                    </div>
                    <p className="text-xs text-muted mt-0.5 sm:mt-1 font-medium">
                      Annual commitment schedule, projected income, and net year cashflow
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2 border-t border-inverse/[0.04] text-[11px]">
                    <span className="text-faint font-mono">12-Month Horizon</span>
                    {onOpenYearlyModal && (
                      <span className="font-medium text-positive flex items-center gap-1 group-hover:text-positive transition">
                        Open Annual Summary <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-0.5 pb-1">
          {[0, 1, 2, 3].map((idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to slide ${idx + 1}`}
              aria-current={activeSlide === idx ? "true" : undefined}
              onClick={() => scrollToSlide(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeSlide === idx
                  ? "w-5 bg-blue-500"
                  : "w-1.5 bg-inverse/20 hover:bg-inverse/40"
              }`}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        data-guide-interactive="open" data-guide-target="wallets" onClick={onNavigateToWallets}
        className="group block w-full dashboard-material rounded-3xl p-5 text-left transition hover:border-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:p-6"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Wallet size={16} /> Wallets
          </span>
          <ArrowRight size={16} className="text-muted transition group-hover:translate-x-0.5" />
        </span>
        <span className="privacy-blur mt-3 block font-mono text-3xl font-bold tracking-tight text-strong sm:text-4xl">
          ₱{totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
        <span className="mt-2 block text-xs text-muted">
          Total cash across {Object.keys(globalData.wallets || {}).length} wallets
          {!reconciled.isComplete && " • ⚠️ Corrupted balances detected"}
        </span>
        {(savingsTotals.savings > 0 || savingsTotals.needsReview) && <span className="privacy-blur mt-2 block text-xs text-muted">Savings {formatPHP(savingsTotals.savings)} · Available {formatPHP(savingsTotals.available)}{savingsTotals.needsReview ? " · Savings need review" : ""}</span>}
      </button>

      <section aria-labelledby="dashboard-goals">
        <h2 id="dashboard-goals" className="mb-2 px-1 text-sm font-semibold text-primary">Goals</h2>
        <ErrorBoundary>
          <MilestoneProgressBar
            currentBalance={globalData?.wallets?.[globalData?.settings?.milestoneWallet || "maribank"] || 0}
            targetFund={targetMilestoneFund}
            goalName={globalData?.settings?.goalName}
            onConfigureGoal={onConfigureGoal}
          />
        </ErrorBoundary>
      </section>

      <section aria-labelledby="dashboard-quick-actions" className="dashboard-material rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="dashboard-quick-actions" className="text-sm font-semibold text-primary" data-guide-target="quick-actions">Quick Actions</h2>
          <button type="button" onClick={() => setShowQuickAdd(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-fill px-2.5 text-xs font-medium text-primary transition hover:bg-fill-strong">
            <Plus size={14} aria-hidden="true" /> Quick Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { action: "expense", label: "Expenses", icon: Receipt, available: onNavigateToExpenses },
            { action: "bill", label: "Commitments", icon: Calendar, available: onNavigateToOps },
            { action: "inflow", label: "Inflows", icon: ArrowDownLeft, available: onNavigateToOps },
            { action: "wallet", label: "Wallets", icon: Wallet, available: onNavigateToWallets },
          ] as const).filter(item => item.available).map(({ action, label, icon: Icon }) => (
            <button key={action} type="button" onClick={() => handleQuickAddAction(action)}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-subtle bg-surface px-3 py-2 text-left text-xs font-medium text-primary transition hover:bg-fill-strong">
              <Icon size={15} className="shrink-0 text-muted" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {gettingStartedSteps.length > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setShowGettingStarted(true)}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted transition hover:bg-fill hover:text-primary"
          >
            <CircleHelp size={15} aria-hidden="true" /> Getting Started
          </button>
        )}
      </section>

      {/* 2. UPCOMING COMMITMENTS */}
      <div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setShowUpcomingModal(true)}
          className="dashboard-material w-full text-left hover:border-amber-500/30 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group active:scale-[0.99] flex flex-col justify-between"
        >
          <span className="flex items-center justify-between mb-2 w-full">
            <span className="flex items-center gap-2">
              <Calendar size={14} className="text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted group-hover:text-primary transition">
                Upcoming
              </span>
            </span>
            <ArrowRight size={13} className="text-faint group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
          </span>
          <span className="block w-full">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-lg sm:text-xl font-bold font-mono text-strong tracking-tight">
                ₱{totalUnpaidCommitments.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              {overdueBills.length > 0 && (
                <span className="chip-amber text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" />
                  {overdueBills.length} overdue
                </span>
              )}
            </span>
            <span className="block text-xs text-muted mt-1 font-medium">
              {unpaidCount} payment{unpaidCount === 1 ? "" : "s"} remaining
            </span>
          </span>
        </button>
      </div>

      <button type="button" aria-haspopup="dialog" data-guide-target="planning" onClick={() => setShowPaydayModal(true)}
        className="dashboard-material flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-left transition hover:border-emerald-500/30 sm:p-5">
        <span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-fill text-positive"><Banknote size={18} /></span><span><span className="block text-xs font-bold uppercase tracking-wider text-positive">Budget Plan</span><span className="mt-1 block text-xs text-muted">Wallet cash · daily spending · savings · allocations</span></span></span>
        <span className="privacy-blur font-mono text-sm font-bold text-primary">₱{budgetCash(globalData).available.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </button>
      {(globalData.settings?.perPayoutSalary ?? 0) <= 0 && (<div className="dashboard-material rounded-2xl p-4 sm:p-5">
        <h2 data-guide-target="planning" className="text-sm font-semibold text-primary">Income at your pace</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">Track client payments, sales, or other money in Inflows. You do not need a monthly salary.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onNavigateToOps && <button type="button" onClick={() => onNavigateToOps("inflows")} className="min-h-11 rounded-xl bg-fill px-3 text-xs font-semibold text-primary hover:bg-fill-strong">Track an inflow</button>}
          <button type="button" onClick={() => onOpenSettings("baselines")} className="min-h-11 rounded-xl px-3 text-xs font-medium text-muted hover:bg-fill">Set up regular pay</button>
        </div>
      </div>)}

      {/* 5. RECENT ACTIVITY */}
      <ErrorBoundary>
        <div className="dashboard-material rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <History size={13} className="text-violet-accent" /> Recent Activity
            </h2>
            {onOpenLedger && (
              <button
                onClick={onOpenLedger}
                className="text-[11px] font-medium text-muted hover:text-primary transition flex items-center gap-1"
              >
                View Ledger <ArrowRight size={11} />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {recentTransactions.length === 0 ? (
              <div className="py-4 text-center text-faint text-xs italic">No transactions yet.</div>
            ) : (
              recentTransactions.slice(0, 5).map((tx: TransactionHistoryItem) => (
                <div key={tx.id} className="flex flex-wrap items-center justify-between p-3.5 rounded-xl bg-surface border border-inverse/[0.04] group hover:border-subtle transition">
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${tx.type === "inflow" ? "transaction-inflow-icon" : tx.type === "bill" ? "transaction-bill-icon" : "bg-fill border-strong text-muted"}`}>
                      {tx.type === "inflow" ? <ArrowDownLeft size={14} /> : tx.type === "bill" ? <Calendar size={14} /> : <Receipt size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="privacy-blur text-[13px] font-semibold text-primary truncate">{tx.title}</div>
                      <div className="flex items-center gap-1.5 text-[9px] text-faint mt-0.5">
                        <span className="bg-fill-strong/80 px-1.5 py-0.5 rounded text-secondary font-medium truncate max-w-[90px]">{tx.category || tx.type}</span>
                        <span className="privacy-blur uppercase text-blue-400/80 font-bold truncate max-w-[80px]">{globalData?.settings?.walletLabels?.[tx.wallet || ""] || tx.wallet}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className={`privacy-blur text-[13px] font-bold font-mono ${tx.amount > 0 ? "text-positive" : "text-strong"}`}>
                      {tx.amount > 0 ? "+" : ""}₱{Math.abs(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="basis-full text-[10px] text-faint mt-1 text-right">{formatHistoryDate(tx, formatDateTime)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </ErrorBoundary>

      {/* 6. COPY SUMMARY BUTTON */}
      <button onClick={onCopySummary} className="w-full bg-surface-elevated/90 hover:bg-inverse/[0.06] border border-subtle text-primary font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md">
        <Copy size={14} /> Copy Summary
      </button>

      {/* UPCOMING MODAL */}
      <UpcomingModal
        isOpen={showUpcomingModal}
        onClose={() => setShowUpcomingModal(false)}
        overdueBills={overdueBills}
        overdueSum={overdueSum}
        totalUnpaidCommitments={totalUnpaidCommitments}
        priorityUnpaidSum={priorityUnpaidSum}
        activeBills={activeBills}
        selectedMonth={selectedMonth}
        onViewAllCommitments={() => onNavigateToOps?.("bills")}
        onJumpToOverdue={onJumpToOverdue}
      />

      {/* PAYDAY MODAL */}
      {(showPaydayModal || distributionDraft) && <PaydayModal key={distributionDraft?.receiptId ?? "manual"}
        isOpen
        onClose={() => { setShowPaydayModal(false); onDistributionClose?.(); }}
        globalData={globalData} selectedMonth={selectedMonth} commitBudgetTransition={commitBudgetTransition} onBudgetMessage={onBudgetMessage}
        initialReceipt={distributionDraft} unpaidCommitments={totalUnpaidCommitments} distributionDisabled={!isViewingCurrentMonth}
        paydayDays={globalData.settings?.paydayDays}
        paydayAllocations={paydayAllocations}
        onConfigureSavings={() => onOpenSettings("wallets")}
        onConfigureBaselines={() => onOpenSettings("baselines")}
        latestExecution={latestExecution}
        onUndoSplit={onUndoPaydaySplit}
      />}

      <Modal
        isOpen={showGettingStarted}
        onClose={() => setShowGettingStarted(false)}
        ariaLabelledBy="getting-started-title"
        manageFocus
      >
        <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-subtle bg-surface-modal p-5 shadow-xl sm:max-h-[calc(100dvh-3rem)] sm:p-6">
          <h2 id="getting-started-title" className="text-lg font-semibold text-strong">Getting Started</h2>
          <p className="mt-1 text-sm text-muted">Start with one wallet and one expense. Checkmarks reflect your current balances and saved records. Try the other tools when you need them.</p>
          {onStartTour && <button type="button" onClick={() => { setShowGettingStarted(false); onStartTour(); }}
            className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">
            Take a quick tour
          </button>}
          <ol className="my-4 divide-y divide-subtle overflow-hidden rounded-2xl bg-surface">
            {gettingStartedSteps.map(({ action, complete, title, description, icon: Icon }) => (
              <li key={action}>
                <button
                  type="button"
                  onClick={() => {
                    setShowGettingStarted(false);
                    handleQuickAddAction(action);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-fill focus-visible:outline-offset-[-2px]"
                >
                  {complete ? <CheckCircle2 size={17} className="shrink-0 text-emerald-500" aria-hidden="true" /> : <Icon size={17} className="shrink-0 text-muted" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-primary">{title}</span>
                    <span className="sr-only">{complete ? action === "wallet" ? "Balance ready" : "Already added" : "Not added yet"}</span>
                    <span className="mt-0.5 block text-xs text-muted">{description}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setShowGettingStarted(false)} className="min-h-11 w-full rounded-xl bg-fill px-4 text-sm font-medium text-primary transition hover:bg-fill-strong">
            Done
          </button>
        </div>
      </Modal>

      {/* QUICK ADD MODAL */}
      <QuickAddModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSelectAction={handleQuickAddAction}
      />
    </div>
  );
};
