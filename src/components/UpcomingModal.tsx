import React, { useEffect, useRef } from "react";
import { X, Calendar, AlertCircle, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { BillViewModel } from "../types/finance";

interface UpcomingModalProps {
  isOpen: boolean;
  onClose: () => void;
  overdueBills: BillViewModel[];
  overdueSum: number;
  totalUnpaidCommitments: number;
  priorityUnpaidSum: number;
  activeBills?: BillViewModel[];
  selectedMonth: string;
  onViewAllCommitments: () => void;
  onJumpToOverdue?: () => void;
}

export const UpcomingModal: React.FC<UpcomingModalProps> = ({
  isOpen,
  onClose,
  overdueBills = [],
  overdueSum = 0,
  totalUnpaidCommitments = 0,
  priorityUnpaidSum = 0,
  activeBills = [],
  selectedMonth,
  onViewAllCommitments,
  onJumpToOverdue
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

  if (!isOpen) return null;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });

  // Get unpaid bills sorted by daysLeft / dueDay
  const unpaidBills = activeBills.filter(b => !b.paid);
  const totalUnpaidCount = unpaidBills.length > 0 ? unpaidBills.length : overdueBills.length;

  // The most relevant/urgent upcoming items to display (up to 3)
  const urgentBills = overdueBills.length > 0
    ? overdueBills.slice(0, 3)
    : unpaidBills.slice(0, 3);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upcoming Commitments Modal"
      onClick={(e) => {
        if (modalBoxRef.current && !modalBoxRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        ref={modalBoxRef}
        className="bg-surface-modal border border-inverse/[0.1] rounded-3xl p-5 sm:p-6 w-full max-w-md space-y-4 shadow-2xl animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-strong">
              Upcoming Commitments
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close upcoming modal"
            className="text-faint hover:text-strong p-1.5 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Urgency Summary Cards */}
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="bg-surface-low border border-inverse/[0.05] rounded-2xl p-3">
            <span className="text-muted text-[11px] font-medium block">Total Unpaid</span>
            <span className="text-base font-bold font-mono text-strong mt-0.5 block">
              ₱{fmt(totalUnpaidCommitments)}
            </span>
            <span className="text-[10px] text-faint mt-0.5 block">
              {totalUnpaidCount} payment{totalUnpaidCount === 1 ? "" : "s"} left
            </span>
          </div>

          <div className="bg-surface-low border border-inverse/[0.05] rounded-2xl p-3">
            <span className="text-muted text-[11px] font-medium block">Top Priority</span>
            <span className="text-base font-bold font-mono text-blue-400 mt-0.5 block">
              ₱{fmt(priorityUnpaidSum || totalUnpaidCommitments)}
            </span>
            <span className="text-[10px] text-faint mt-0.5 block">
              Immediate obligation
            </span>
          </div>
        </div>

        {/* Overdue Alert Banner if applicable */}
        {overdueBills.length > 0 && (
          <div
            onClick={() => {
              onJumpToOverdue?.();
              onClose();
            }}
            className={`p-3 rounded-2xl bg-orange-950/25 border border-orange-800/40 text-orange-300 flex items-center justify-between text-xs transition ${onJumpToOverdue ? "cursor-pointer hover:bg-orange-950/40" : ""}`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-orange-400 shrink-0" />
              <div>
                <span className="font-semibold block">
                  {overdueBills.length} Overdue Commitment{overdueBills.length > 1 ? "s" : ""}
                </span>
                <span className="text-[10px] text-orange-300/80">
                  Totaling ₱{fmt(overdueSum)} • Tap to jump to overdue
                </span>
              </div>
            </div>
            {onJumpToOverdue && <ArrowRight size={13} className="text-orange-400 shrink-0" />}
          </div>
        )}

        {/* Urgent Items List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium px-0.5">
            <span>{overdueBills.length > 0 ? "Overdue Items" : "Upcoming Due Soonest"}</span>
            <span className="text-faint">{selectedMonth}</span>
          </div>

          <div className="space-y-1.5 bg-surface-low border border-inverse/[0.05] rounded-2xl p-3">
            {urgentBills.length === 0 ? (
              <div className="py-3 text-center text-xs text-faint flex items-center justify-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>All commitments for this month are settled!</span>
              </div>
            ) : (
              urgentBills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between py-1.5 border-b border-inverse/[0.03] last:border-0 text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-medium text-primary truncate block">
                      {bill.name}
                    </span>
                    <span className="text-[10px] text-faint flex items-center gap-1">
                      <Clock size={10} />
                      Due on the {bill.dueDay}
                      {bill.daysLeft !== undefined && (
                        <span className={bill.daysLeft < 0 ? "text-orange-400 font-semibold" : ""}>
                          {bill.daysLeft < 0 ? ` (${Math.abs(bill.daysLeft)}d overdue)` : ` (${bill.daysLeft}d left)`}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className={`font-mono font-semibold shrink-0 ${bill.daysLeft !== undefined && bill.daysLeft < 0 ? "text-orange-300" : "text-strong"}`}>
                    ₱{fmt(bill.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={() => {
            onViewAllCommitments();
            onClose();
          }}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20"
        >
          <span>View All Commitments</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
