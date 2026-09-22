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
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { MilestoneProgressBar } from "./MilestoneProgressBar";
import { PaydayModal } from "./PaydayModal";
import { QuickAddModal, QuickAddAction } from "./QuickAddModal";
import { UpcomingModal } from "./UpcomingModal";
import {
  UnifiedFinanceData,
  TransactionHistoryItem,
  BillViewModel,
  PaydayExecution
} from "../types/finance";
import { calculateSafeToSpend, calculateDebtRunway } from "../utils/financialAnalytics";

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
  onCommitWallet?: (walletId: string, amount: number) => void;
  onIncrementWallet?: (walletId: string, amount: number) => void;
  onCopySummary: () => void;
  formatDateTime: (dateStr: string) => string;

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
  targetMilestoneFund,
  totalLiquid,
  fundProgressPercent,
  totalPendingReceivables,
  monthIncomeCollected,
  selectedMonth,

  priorityUnpaidSum,
  totalUnpaidCommitments,
  overdueBills = [],
  overdueSum = 0,
  paydayAllocations = {},
  remainingBuffer,
  isViewingCurrentMonth,
  hasExecutedToday = false,
  latestExecution,

  recentTransactions = [],

  onOpenSettings,
  onExecutePaydaySplit,
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
  const carouselRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selectedYear = selectedMonth.split(" ")[1] || "2026";
  const safeToSpend = calculateSafeToSpend(totalLiquid, totalUnpaidCommitments);

  const debtLoans = useMemo(
    () => calculateDebtRunway(globalData, selectedMonth),
    [globalData, selectedMonth]
  );
  const totalDebtPrincipal = useMemo(
    () => debtLoans.reduce((sum, loan) => sum + loan.remainingPrincipal, 0),
    [debtLoans]
  );

  const pdDays = globalData?.settings?.paydayDays?.length
    ? globalData.settings.paydayDays
    : [15, 30];

  const formatOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const totalPaydayAllocated = useMemo(
    () => Object.values(paydayAllocations).reduce((a, b) => a + b, 0),
    [paydayAllocations]
  );

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

    let targetScrollLeft = 0;
    if (slide) {
      const containerRect = container.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();
      // Calculate slide center in scroll coordinates using untransformed slide width
      const slideScrollCenter =
        slideRect.left - containerRect.left + container.scrollLeft + slide.offsetWidth / 2;
      const viewportCenter = container.clientWidth / 2;
      const rawTarget = slideScrollCenter - viewportCenter;
      const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      targetScrollLeft = Math.max(0, Math.min(rawTarget, maxScrollLeft));
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth"
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

  const getCarouselCardClass = (isActive: boolean, interactiveHover?: string) =>
    `w-full h-[156px] sm:h-[160px] bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.35)] rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-[transform,opacity] duration-[220ms] ease-out will-change-[transform,opacity] ${
      isActive
        ? `scale-100 opacity-100 z-10 blur-0 ${interactiveHover || ""}`
        : "scale-[0.94] opacity-80 z-0 blur-[0.75px] hover:opacity-95 cursor-pointer"
    }`;

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in zoom-in-95 duration-400 ease-out">
      {/* 1. FINANCIAL OVERVIEW CAROUSEL STAGE */}
      <div className="w-full space-y-2.5">
        {/* Contained Stage Viewport */}
        <div className="relative rounded-3xl bg-surface-low/30 border border-inverse/[0.06] overflow-hidden">
          {/* Scroll Viewport */}
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory pt-5 pb-11 sm:pt-6 sm:pb-12"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {/* Scroll Track with 7.5% end padding so first and last slides center perfectly */}
            <div
              className="flex items-center"
              style={{ paddingLeft: "7.5%", paddingRight: "7.5%" }}
            >
              {/* SLIDE 1: FINANCIAL OVERVIEW */}
              <div
                ref={(el) => {
                  slideRefs.current[0] = el;
                }}
                className="w-[85%] min-w-[85%] max-w-[85%] flex-shrink-0 snap-center px-1.5 sm:px-2.5"
              >
                <div
                  role={activeSlide !== 0 ? "button" : undefined}
                  tabIndex={activeSlide !== 0 ? 0 : undefined}
                  aria-label="Financial Overview"
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
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-blue-400" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
                        Financial Overview
                      </h2>
                    </div>
                    <span className="text-[10px] text-faint font-mono">{selectedMonth}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center my-auto">
                    <div className="bg-surface/80 border border-inverse/[0.04] rounded-xl p-2.5 sm:p-3">
                      <div className="text-xs font-medium text-muted">Fund Progress</div>
                      <div className="text-sm sm:text-base font-semibold font-mono tracking-tight mt-1 text-strong">
                        {fundProgressPercent}%
                      </div>
                    </div>

                    <div className="bg-surface/80 border border-inverse/[0.04] rounded-xl p-2.5 sm:p-3">
                      <div className="text-xs font-medium text-muted">Pending Inflows</div>
                      <div className="text-sm sm:text-base font-semibold font-mono tracking-tight mt-1 text-amber-300">
                        ₱{totalPendingReceivables.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="bg-surface/80 border border-inverse/[0.04] rounded-xl p-2.5 sm:p-3">
                      <div className="text-xs font-medium text-muted">
                        {selectedMonth.split(" ")[0]} Income
                      </div>
                      <div className="text-sm sm:text-base font-semibold font-mono tracking-tight mt-1 text-emerald-400">
                        ₱{monthIncomeCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SLIDE 2: SAFE TO SPEND */}
              <div
                ref={(el) => {
                  slideRefs.current[1] = el;
                }}
                className="w-[85%] min-w-[85%] max-w-[85%] flex-shrink-0 snap-center px-1.5 sm:px-2.5"
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
                      <ShieldCheck size={16} className="text-emerald-400" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Safe to Spend
                      </h2>
                    </div>
                    {onOpenAnalytics && (
                      <span className="text-[11px] font-medium text-muted group-hover:text-emerald-300 transition flex items-center gap-1">
                        Runway & Details <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </div>

                  <div className="my-auto">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400 tracking-tight">
                      ₱{safeToSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted mt-0.5 sm:mt-1 font-medium">
                      Liquid cash minus all remaining unpaid commitments
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-inverse/[0.04] text-[11px] text-faint">
                    <span className="font-mono">
                      Liquid: ₱{totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
                className="w-[85%] min-w-[85%] max-w-[85%] flex-shrink-0 snap-center px-1.5 sm:px-2.5"
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
                      <CreditCard size={15} className="text-purple-400" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                        Active Debt
                      </h2>
                    </div>
                    <span className="text-[10px] text-faint font-mono">
                      {debtLoans.length} {debtLoans.length === 1 ? "Active Loan" : "Active Loans"}
                    </span>
                  </div>

                  <div className="my-auto">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-strong tracking-tight">
                      {debtLoans.length > 0
                        ? `₱${totalDebtPrincipal.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "100% Debt-Free"}
                    </div>
                    <p className="text-xs text-muted mt-0.5 sm:mt-1 font-medium">
                      {debtLoans.length > 0
                        ? "Total remaining principal across all active installments"
                        : "No active installment debt obligations"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-inverse/[0.04] text-[11px]">
                    <span className="text-faint font-mono">
                      {debtLoans.length > 0 ? `${debtLoans.length} installment plan${debtLoans.length === 1 ? "" : "s"}` : "Zero balance"}
                    </span>
                    {onOpenAnalytics && (
                      <span className="font-medium text-purple-400 flex items-center gap-1 group-hover:text-purple-300 transition">
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
                className="w-[85%] min-w-[85%] max-w-[85%] flex-shrink-0 snap-center px-1.5 sm:px-2.5"
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
                      <Calendar size={15} className="text-emerald-400" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Yearly Overview
                      </h2>
                    </div>
                    <span className="text-[10px] text-faint font-mono">{selectedYear}</span>
                  </div>

                  <div className="my-auto">
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400 tracking-tight">
                      {selectedYear} Summary
                    </div>
                    <p className="text-xs text-muted mt-0.5 sm:mt-1 font-medium">
                      Annual commitment schedule, projected income, and net year cashflow
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-inverse/[0.04] text-[11px]">
                    <span className="text-faint font-mono">12-Month Horizon</span>
                    {onOpenYearlyModal && (
                      <span className="font-medium text-emerald-400 flex items-center gap-1 group-hover:text-emerald-300 transition">
                        Open Annual Summary <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Left Edge Hover Interaction Zone */}
          {activeSlide > 0 && (
            <button
              type="button"
              onClick={() => scrollToSlide(activeSlide - 1)}
              aria-label="Previous slide"
              className="hidden md:flex absolute left-0 top-0 bottom-0 w-12 sm:w-16 items-center justify-start pl-3 z-20 cursor-pointer group/edge bg-transparent hover:bg-gradient-to-r hover:from-surface-elevated/50 hover:to-transparent transition-all duration-200"
            >
              <ChevronLeft
                size={18}
                className="opacity-0 group-hover/edge:opacity-100 text-primary transform -translate-x-1 group-hover/edge:translate-x-0 transition-all duration-200 drop-shadow-sm"
              />
            </button>
          )}

          {/* Desktop Right Edge Hover Interaction Zone */}
          {activeSlide < 3 && (
            <button
              type="button"
              onClick={() => scrollToSlide(activeSlide + 1)}
              aria-label="Next slide"
              className="hidden md:flex absolute right-0 top-0 bottom-0 w-12 sm:w-16 items-center justify-end pr-3 z-20 cursor-pointer group/edge bg-transparent hover:bg-gradient-to-l hover:from-surface-elevated/50 hover:to-transparent transition-all duration-200"
            >
              <ChevronRight
                size={18}
                className="opacity-0 group-hover/edge:opacity-100 text-primary transform translate-x-1 group-hover/edge:translate-x-0 transition-all duration-200 drop-shadow-sm"
              />
            </button>
          )}
        </div>

        {/* Carousel Pagination Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-0.5 pb-1">
          {[0, 1, 2, 3].map((idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to slide ${idx + 1}`}
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

      {/* 2. COMPACT WALLETS & UPCOMING CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Wallets Card */}
        <div
          onClick={onNavigateToWallets}
          className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] hover:border-blue-500/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.35)] rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group active:scale-[0.99] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wallet size={14} className="text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted group-hover:text-primary transition">
                Wallets
              </h3>
            </div>
            <ArrowRight size={13} className="text-faint group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <div className="privacy-blur text-lg sm:text-xl font-bold font-mono text-strong tracking-tight">
              ₱{totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted mt-1 font-medium">
              Across {Object.keys(globalData?.wallets || {}).length} wallets
            </div>
          </div>
        </div>

        {/* Upcoming Card */}
        <div
          onClick={() => setShowUpcomingModal(true)}
          className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] hover:border-amber-500/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.35)] rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group active:scale-[0.99] flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted group-hover:text-primary transition">
                Upcoming
              </h3>
            </div>
            <ArrowRight size={13} className="text-faint group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-lg sm:text-xl font-bold font-mono text-strong tracking-tight">
                ₱{totalUnpaidCommitments.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              {overdueBills.length > 0 && (
                <span className="text-[11px] font-semibold text-orange-400 bg-orange-950/40 border border-orange-800/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle size={12} className="text-orange-400 shrink-0" />
                  {overdueBills.length} overdue
                </span>
              )}
            </div>
            <div className="text-xs text-muted mt-1 font-medium">
              {unpaidCount} payment{unpaidCount === 1 ? "" : "s"} remaining
            </div>
          </div>
        </div>
      </div>

      {/* 3. COMPACT PAYDAY PLAN CARD */}
      <div
        onClick={() => setShowPaydayModal(true)}
        className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] hover:border-emerald-500/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.35)] rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group active:scale-[0.99] flex items-center justify-between"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Banknote size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Payday Plan
              </h3>
              {hasExecutedToday && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  ✓ Distributed
                </span>
              )}
            </div>
            <div className="text-xs text-muted mt-0.5 font-medium">
              Auto-distribute to wallets • {pdDays.map(formatOrdinal).join(" & ")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm sm:text-base text-primary">
            ₱{totalPaydayAllocated.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <ArrowRight size={14} className="text-faint group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>

      {/* 4. GOALS */}
      <ErrorBoundary>
        <MilestoneProgressBar
          currentBalance={globalData?.wallets?.[globalData?.settings?.milestoneWallet || "maribank"] || 0}
          targetFund={targetMilestoneFund}
          goalName={globalData?.settings?.goalName}
          onConfigureGoal={() => onOpenSettings("baselines")}
        />
      </ErrorBoundary>

      {/* 5. RECENT ACTIVITY */}
      <ErrorBoundary>
        <div className="bg-surface-elevated/90 backdrop-blur-xl border border-inverse/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.35)] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
              <History size={13} className="text-purple-400" /> Recent Activity
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
                <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-inverse/[0.04] group hover:border-inverse/[0.08] transition">
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

      {/* 6. COPY SUMMARY BUTTON */}
      <button onClick={onCopySummary} className="w-full bg-surface-elevated/90 hover:bg-inverse/[0.06] border border-inverse/[0.06] text-primary font-semibold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition text-xs shadow-md">
        <Copy size={14} /> Copy Summary
      </button>

      {/* 7. QUICK ADD FLOATING BUTTON */}
      <button
        onClick={() => setShowQuickAdd(true)}
        aria-label="Quick Add"
        title="Quick Add (+)"
        className="fixed bottom-20 right-5 sm:right-8 z-40 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition-all"
      >
        <Plus size={22} className="stroke-[2.5]" />
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
      <PaydayModal
        isOpen={showPaydayModal}
        onClose={() => setShowPaydayModal(false)}
        paydayDays={globalData.settings?.paydayDays}
        paydayAllocations={paydayAllocations}
        remainingBuffer={remainingBuffer}
        customWallets={globalData?.settings?.customWallets}
        walletLabels={globalData?.settings?.walletLabels}
        onConfigureBaselines={() => onOpenSettings("baselines")}
        onExecutePaydaySplit={onExecutePaydaySplit}
        disabled={!isViewingCurrentMonth || hasExecutedToday}
        latestExecution={latestExecution}
        onUndoSplit={onUndoPaydaySplit}
      />

      {/* QUICK ADD MODAL */}
      <QuickAddModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSelectAction={handleQuickAddAction}
      />
    </div>
  );
};
