import React, { useMemo, useEffect, useRef } from "react";
import { X, Sparkles, ShieldCheck, Flame, CreditCard, Plane, TrendingUp } from "lucide-react";
import { parseMonthKey, getAdjacentMonth } from "../utils/dateHelpers";
import { UnifiedFinanceData } from "../types/finance";

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
  const modalBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const safeToSpend = Math.max(0, totalLiquid - totalUnpaidCommitments);
  const now = new Date();
  const currentMonthDate = parseMonthKey(selectedMonth);
  const isCurrentActiveMonth = now.getFullYear() === currentMonthDate.getFullYear() && now.getMonth() === currentMonthDate.getMonth();
  const totalDaysInMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate();
  const remainingDays = isCurrentActiveMonth ? Math.max(1, totalDaysInMonth - now.getDate() + 1) : totalDaysInMonth;
  const dailyBurnRate = safeToSpend / remainingDays;

  const maribankBal = globalData?.wallets?.maribank || 0;
  const targetFund = globalData?.settings?.targetFund ?? globalData?.targetFund ?? 80000;
  const phpToJpyRate = globalData?.settings?.phpToJpyRate ?? 2.71;
  const jpyEquivalent = Math.round(maribankBal * phpToJpyRate);
  const targetJpy = Math.round(targetFund * phpToJpyRate);
  const requiredAdbDailyPace = Math.max(0, (targetFund - maribankBal) / Math.max(1, remainingDays));

  const debtLoans = useMemo(() => {
    const bills = globalData?.library?.bills || [];
    const logs = globalData?.logs || {};

    return bills.filter(b => b.type === "Loan / Installment" && b.startMonth && b.endMonth).map(loan => {
      const start = parseMonthKey(loan.startMonth!);
      const end = parseMonthKey(loan.endMonth!);
      const totalMonths = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
      
      let elapsedMonths = 0;
      let ptr = loan.startMonth!;
      let failsafe = 0;
      while (parseMonthKey(ptr) <= currentMonthDate && failsafe < 120) {
        if (logs[ptr]?.billsPaid?.includes(loan.id)) {
          elapsedMonths++;
        }
        if (ptr === loan.endMonth) break;
        ptr = getAdjacentMonth(ptr, 1);
        failsafe++;
      }

      const totalPrincipal = (parseFloat(String(loan.amount)) || 0) * totalMonths;
      const totalPaid = (parseFloat(String(loan.amount)) || 0) * elapsedMonths;
      const remainingPrincipal = Math.max(0, totalPrincipal - totalPaid);
      const progressPercent = Math.min(100, (elapsedMonths / totalMonths) * 100);

      return {
        id: loan.id,
        name: loan.name,
        monthlyAmount: parseFloat(String(loan.amount)) || 0,
        startMonth: loan.startMonth,
        endMonth: loan.endMonth,
        totalMonths,
        elapsedMonths,
        totalPrincipal,
        totalPaid,
        remainingPrincipal,
        progressPercent
      };
    });
  }, [globalData, currentMonthDate]);

  const sparklineData = useMemo(() => {
    const months = [];
    const bills = globalData?.library?.bills || [];
    const receivables = globalData?.library?.receivables || [];
    const logs = globalData?.logs || {};

    for (let i = -3; i <= 2; i++) {
      const mKey = getAdjacentMonth(selectedMonth, i);
      const mDate = parseMonthKey(mKey);
      const mLog = logs[mKey] || { billsPaid: [], recsCollected: {} };

      const totalBills = bills.filter(b => {
        const start = parseMonthKey(b.startMonth || "August 2026");
        if (mDate < start) return false;
        if (b.type === "Loan / Installment" && b.endMonth && mDate > parseMonthKey(b.endMonth)) return false;
        return true;
      }).reduce((sum, b) => sum + (parseFloat(String(b.amount)) || 0), 0);

      const totalInflow = receivables.reduce((sum, r) => {
        const amt = parseFloat(String(r.amount)) || 0;
        const recLog = mLog.recsCollected?.[r.id];
        if (recLog?.collected || recLog?.amountReceived) {
          return sum + (parseFloat(String(recLog.amountReceived)) || amt);
        }
        return sum + amt;
      }, 0);

      months.push({
        month: mKey.split(" ")[0].slice(0, 3),
        isCurrent: mKey === selectedMonth,
        inflow: totalInflow,
        bills: totalBills
      });
    }
    return months;
  }, [globalData, selectedMonth]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Financial Intelligence Modal"
      onClick={(e) => {
        if (modalBoxRef.current && !modalBoxRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        ref={modalBoxRef}
        className="bg-[#121217] border border-white/[0.09] rounded-3xl p-5 sm:p-6 w-full max-w-2xl space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)] max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Financial Intelligence & Runway ({selectedMonth})
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close analytics modal"
            className="text-zinc-500 hover:text-white p-1 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-400" /> Safe to Spend
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{remainingDays}d left in month</span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-2">
              ₱{safeToSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1 font-mono">
              Liquid Cash minus all remaining unpaid commitments
            </div>
          </div>

          <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider flex items-center gap-1">
                <Flame size={12} className="text-amber-400" /> Daily Discretionary Pace
              </span>
              <span className="text-[10px] text-amber-400 font-mono">Max Burn Rate</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-300 mt-2">
              ₱{dailyBurnRate.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-zinc-500">/ day</span>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1 font-mono">
              Daily budget to stay strictly surplus-positive
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
              <Plane size={13} />
              <span>Japan Visa ADB & Yen Equivalent</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/[0.08]">
              1 PHP ≈ {phpToJpyRate} JPY
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">MariBank Yen Balance</div>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                ¥{jpyEquivalent.toLocaleString("en-US")} <span className="text-[11px] text-zinc-500 font-normal">/ ¥{targetJpy.toLocaleString()}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Daily Deposit Pace Needed</div>
              <div className="text-base font-bold font-mono text-blue-400 mt-0.5">
                ₱{requiredAdbDailyPace.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-[11px] text-zinc-500 font-normal">/ day</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <CreditCard size={13} className="text-purple-400" />
              Active Debt Freedom Runway
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {debtLoans.length} Active Installments
            </span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {debtLoans.map(loan => (
              <div key={loan.id} className="bg-[#0a0a0d] border border-white/[0.05] rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-white">{loan.name}</span>
                    <span className="text-[10px] text-zinc-500 block font-mono">
                      ₱{loan.monthlyAmount.toLocaleString("en-US")}/mo • Ends {loan.endMonth}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs text-purple-300 font-semibold">
                      Month {loan.elapsedMonths} of {loan.totalMonths}
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      ₱{loan.remainingPrincipal.toLocaleString("en-US")} left
                    </span>
                  </div>
                </div>

                <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${loan.progressPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-emerald-400" />
              6-Month Cashflow Momentum (Inflow vs. Commitments)
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1.5 pt-2 items-end h-24">
            {sparklineData.map((d, i) => {
              const maxVal = Math.max(...sparklineData.map(x => Math.max(x.inflow, x.bills)), 60000);
              const inflowHeight = Math.max(12, (d.inflow / maxVal) * 100);
              const billsHeight = Math.max(12, (d.bills / maxVal) * 100);

              return (
                <div key={i} className={`flex flex-col items-center gap-1.5 h-full justify-end p-1 rounded-xl transition ${d.isCurrent ? "bg-white/[0.08] border border-white/[0.12]" : ""}`}>
                  <div className="w-full flex items-end justify-center gap-1 h-14">
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
                  <span className={`text-[10px] font-mono ${d.isCurrent ? "text-white font-bold" : "text-zinc-500"}`}>
                    {d.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold py-2.5 rounded-xl transition"
        >
          Done
        </button>
      </div>
    </div>
  );
};
