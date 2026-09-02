import React, { useState, useMemo, useEffect, useRef } from "react";
import { X, Calendar, ChevronDown, Check } from "lucide-react";
import { MONTH_LIST, YEAR_LIST } from "../constants/config";
import { parseMonthKey } from "../utils/dateHelpers";
import { UnifiedFinanceData } from "../types/finance";

interface YearlyOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  selectedYear?: string;
}

export const YearlyOverviewModal: React.FC<YearlyOverviewModalProps> = ({
  isOpen,
  onClose,
  globalData,
  selectedYear = "2026"
}) => {
  const [activeYear, setActiveYear] = useState(selectedYear);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedYear) setActiveYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setShowYearDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const yearlyStats = useMemo(() => {
    const bills = globalData?.library?.bills || [];
    const receivables = globalData?.library?.receivables || [];
    const logs = globalData?.logs || {};

    let totalYearCommitments = 0;
    let totalYearPaid = 0;
    let totalYearProjectedIncome = 0;
    let totalYearCollected = 0;

    MONTH_LIST.forEach(month => {
      const monthKey = `${month} ${activeYear}`;
      const monthDate = parseMonthKey(monthKey);
      const mLog = logs[monthKey] || { billsPaid: [], recsCollected: {} };

      bills.forEach(b => {
        const start = parseMonthKey(b.startMonth || "August 2026");
        if (monthDate >= start) {
          if (b.type !== "Loan / Installment" || !b.endMonth || monthDate <= parseMonthKey(b.endMonth)) {
            const amt = parseFloat(String(b.amount)) || 0;
            totalYearCommitments += amt;
            if (mLog.billsPaid?.includes(b.id)) {
              totalYearPaid += amt;
            }
          }
        }
      });

      receivables.forEach(r => {
        const amt = parseFloat(String(r.amount)) || 0;
        if (r.frequency === "Monthly" || r.frequency === "Bi-monthly") {
          if (monthDate >= parseMonthKey(r.startMonth || "August 2026")) {
            totalYearProjectedIncome += amt;
          }
        } else if (r.frequency === "By Date" && r.date) {
          const rDate = new Date(r.date.replace(/-/g, "/"));
          if (rDate.getFullYear().toString() === activeYear && MONTH_LIST[rDate.getMonth()] === month) {
            totalYearProjectedIncome += amt;
          }
        }

        const recLog = mLog.recsCollected?.[r.id];
        if (recLog?.amountReceived) {
          totalYearCollected += parseFloat(String(recLog.amountReceived)) || 0;
        }
      });
    });

    return {
      totalYearCommitments,
      totalYearPaid,
      totalYearProjectedIncome,
      totalYearCollected,
      netYearBalance: totalYearProjectedIncome - totalYearCommitments
    };
  }, [globalData, activeYear]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (modalBoxRef.current && !modalBoxRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        ref={modalBoxRef}
        className="bg-[#121217] border border-white/[0.09] rounded-3xl p-5 sm:p-6 w-full max-w-lg space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)] max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Calendar size={16} className="text-blue-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Yearly Overview
            </h3>

            <div className="relative" ref={yearDropdownRef}>
              <button
                onClick={() => setShowYearDropdown(prev => !prev)}
                className="h-7 px-2.5 rounded-xl bg-[#0a0a0d] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono font-bold text-blue-400 flex items-center gap-1.5 transition"
              >
                <span>{activeYear}</span>
                <ChevronDown size={11} className="text-zinc-500" />
              </button>

              {showYearDropdown && (
                <div className="absolute left-0 mt-1.5 w-28 bg-[#181822]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl p-1 z-30 space-y-0.5 max-h-48 overflow-y-auto">
                  {YEAR_LIST.map(y => (
                    <button
                      key={y}
                      onClick={() => { setActiveYear(y); setShowYearDropdown(false); }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition flex items-center justify-between ${
                        activeYear === y
                          ? "bg-blue-600/20 text-blue-400 font-bold"
                          : "text-zinc-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span>{y}</span>
                      {activeYear === y && <Check size={11} className="text-blue-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4">
            <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
              {activeYear} Commitments
            </div>
            <div className="text-base font-bold font-mono text-rose-400 mt-1">
              ₱{yearlyStats.totalYearCommitments.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1 font-mono">
              Paid: ₱{yearlyStats.totalYearPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4">
            <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
              {activeYear} Projected Inflows
            </div>
            <div className="text-base font-bold font-mono text-emerald-400 mt-1">
              ₱{yearlyStats.totalYearProjectedIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1 font-mono">
              Collected: ₱{yearlyStats.totalYearCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium">Net Projected {activeYear} Surplus:</span>
            <span className={`font-mono font-bold text-sm ${yearlyStats.netYearBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ₱{yearlyStats.netYearBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
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
