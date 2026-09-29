import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  History,
  ArrowDownLeft,
  Calendar,
  Receipt,
  Search,
  BookOpen
} from "lucide-react";
import { TransactionHistoryItem } from "../types/finance";
import { formatMonthYear } from "../utils/dateHelpers";

export interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: TransactionHistoryItem[];
  walletLabels?: Record<string, string>;
  formatDateTime?: (dateStr: string) => string;
  onOpenManualLedger?: () => void;
}

const PAGE_SIZE = 50;

export const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
  isOpen,
  onClose,
  transactions,
  walletLabels,
  formatDateTime = (d: string) => d,
  onOpenManualLedger
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<"all" | "inflow" | "expense" | "bill">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [displayLimit, setDisplayLimit] = useState<number>(PAGE_SIZE);

  // Reset pagination limit when filters change
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [selectedMonth, selectedType, searchQuery]);

  // Derive unique months (YYYY-MM) present in transactions, sorted newest first
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    transactions.forEach(tx => {
      if (tx.date && tx.date.length >= 7) {
        const yyyyMm = tx.date.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(yyyyMm)) {
          monthSet.add(yyyyMm);
        }
      }
    });

    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  // Format YYYY-MM into friendly readable label e.g. "September 2026"
  const getMonthLabel = (yyyyMm: string): string => {
    const [yStr, mStr] = yyyyMm.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!y || !m) return yyyyMm;
    const d = new Date(y, m - 1, 1);
    return formatMonthYear(d);
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Month filter
      if (selectedMonth !== "ALL") {
        if (!tx.date || !tx.date.startsWith(selectedMonth)) {
          return false;
        }
      }

      // Type filter
      if (selectedType !== "all") {
        if (tx.type !== selectedType) {
          return false;
        }
      }

      // Search query filter (merchant/title, category, wallet)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = tx.title?.toLowerCase().includes(query);
        const categoryMatch = tx.category?.toLowerCase().includes(query);
        const walletLabel = walletLabels?.[tx.wallet || ""] || tx.wallet || "";
        const walletMatch = walletLabel.toLowerCase().includes(query);
        if (!titleMatch && !categoryMatch && !walletMatch) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, selectedMonth, selectedType, searchQuery, walletLabels]);

  // Counts for filter pills
  const typeCounts = useMemo(() => {
    const counts = { all: transactions.length, inflow: 0, expense: 0, bill: 0 };
    transactions.forEach(tx => {
      if (tx.type === "inflow") counts.inflow++;
      else if (tx.type === "expense") counts.expense++;
      else if (tx.type === "bill") counts.bill++;
    });
    return counts;
  }, [transactions]);

  // Summary calculations for filtered view
  const summary = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    filteredTransactions.forEach(tx => {
      if (tx.amount > 0) inflows += tx.amount;
      else outflows += Math.abs(tx.amount);
    });
    return { inflows, outflows, net: inflows - outflows };
  }, [filteredTransactions]);

  if (!isOpen) return null;

  const visibleTransactions = filteredTransactions.slice(0, displayLimit);
  const hasMore = filteredTransactions.length > displayLimit;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Transaction History"
    >
      <div className="bg-surface-elevated border border-inverse/[0.08] rounded-t-3xl sm:rounded-3xl w-full max-w-2xl mx-auto shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <History size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-strong uppercase tracking-wider">
                Transaction History
              </h2>
              <p className="text-[11px] text-muted">
                {filteredTransactions.length === transactions.length
                  ? `${transactions.length} total records`
                  : `Showing ${filteredTransactions.length} of ${transactions.length} records`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenManualLedger && (
              <button
                type="button"
                onClick={onOpenManualLedger}
                aria-label="Manage Ledger"
                className="px-2.5 py-1.5 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-secondary rounded-xl text-xs font-semibold transition border border-inverse/[0.06] flex items-center gap-1.5"
              >
                <BookOpen size={13} className="text-purple-400" />
                <span className="hidden sm:inline">Manage</span> Ledger
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close transaction history"
              className="text-faint hover:text-strong p-2 rounded-full hover:bg-inverse/[0.05] transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-inverse/[0.06] space-y-3 bg-surface-sunken/40">
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search description, category, wallet..."
                aria-label="Search transactions"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface-input border border-strong rounded-xl pl-9 pr-3 py-2 text-xs text-strong placeholder:text-muted outline-none focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-strong text-xs"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Month Filter Dropdown */}
            <div className="w-full sm:w-48 shrink-0">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                aria-label="Filter by month"
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">All Months ({transactions.length})</option>
                {availableMonths.map(ym => (
                  <option key={ym} value={ym}>
                    {getMonthLabel(ym)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type Segmented Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
            <button
              type="button"
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border whitespace-nowrap ${
                selectedType === "all"
                  ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                  : "bg-surface-input border-strong text-muted hover:text-primary"
              }`}
            >
              All ({typeCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("inflow")}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border whitespace-nowrap flex items-center gap-1 ${
                selectedType === "inflow"
                  ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                  : "bg-surface-input border-strong text-muted hover:text-emerald-400"
              }`}
            >
              <ArrowDownLeft size={12} /> Inflows ({typeCounts.inflow})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("expense")}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border whitespace-nowrap flex items-center gap-1 ${
                selectedType === "expense"
                  ? "bg-rose-600 text-white border-rose-500 shadow-sm"
                  : "bg-surface-input border-strong text-muted hover:text-rose-400"
              }`}
            >
              <Receipt size={12} /> Expenses ({typeCounts.expense})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("bill")}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border whitespace-nowrap flex items-center gap-1 ${
                selectedType === "bill"
                  ? "bg-amber-600 text-white border-amber-500 shadow-sm"
                  : "bg-surface-input border-strong text-muted hover:text-amber-400"
              }`}
            >
              <Calendar size={12} /> Bills ({typeCounts.bill})
            </button>
          </div>

          {/* Financial Summary Strip */}
          {filteredTransactions.length > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
              <div className="bg-surface/60 border border-inverse/[0.04] rounded-xl py-1.5 px-2">
                <span className="text-[10px] text-faint block uppercase">Inflows</span>
                <span className="privacy-blur font-bold font-mono text-emerald-400">
                  +₱{summary.inflows.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-surface/60 border border-inverse/[0.04] rounded-xl py-1.5 px-2">
                <span className="text-[10px] text-faint block uppercase">Outflows</span>
                <span className="privacy-blur font-bold font-mono text-strong">
                  −₱{summary.outflows.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-surface/60 border border-inverse/[0.04] rounded-xl py-1.5 px-2">
                <span className="text-[10px] text-faint block uppercase">Net Flow</span>
                <span
                  className={`privacy-blur font-bold font-mono ${
                    summary.net >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {summary.net >= 0 ? "+" : "−"}₱
                  {Math.abs(summary.net).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Transaction List */}
        <div className="overflow-y-auto p-4 sm:p-5 space-y-2 flex-1 min-h-[240px]">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-faint text-xs italic flex flex-col items-center justify-center gap-2">
              <History size={24} className="opacity-30" />
              <span>
                {transactions.length === 0
                  ? "No transactions recorded yet."
                  : "No transactions match your current filters."}
              </span>
              {(selectedMonth !== "ALL" || selectedType !== "all" || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth("ALL");
                    setSelectedType("all");
                    setSearchQuery("");
                  }}
                  className="mt-2 text-blue-400 hover:underline text-xs not-italic font-semibold"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              {visibleTransactions.map(tx => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-inverse/[0.04] group hover:border-inverse/[0.08] transition shadow-sm"
                >
                  <div className="flex items-center gap-3.5 overflow-hidden flex-1">
                    <div
                      className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${
                        tx.type === "inflow"
                          ? "transaction-inflow-icon"
                          : tx.type === "bill"
                          ? "transaction-bill-icon"
                          : "bg-fill border-strong text-muted"
                      }`}
                    >
                      {tx.type === "inflow" ? (
                        <ArrowDownLeft size={15} />
                      ) : tx.type === "bill" ? (
                        <Calendar size={15} />
                      ) : (
                        <Receipt size={15} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="privacy-blur text-[13px] font-semibold text-strong truncate">
                        {tx.title}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted mt-1">
                        <span className="bg-fill-strong/80 px-1.5 py-0.5 rounded text-secondary font-medium truncate max-w-[110px]">
                          {tx.category || tx.type}
                        </span>
                        <span className="privacy-blur uppercase text-blue-400/90 font-bold tracking-wider truncate max-w-[100px]">
                          {walletLabels?.[tx.wallet || ""] || tx.wallet}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-3">
                    <span
                      className={`privacy-blur text-[13px] font-bold font-mono ${
                        tx.amount > 0 ? "text-emerald-400" : "text-strong"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : tx.amount < 0 ? "−" : ""}₱
                      {Math.abs(tx.amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2
                      })}
                    </span>
                    <span className="text-[10px] text-faint font-medium mt-1 whitespace-nowrap">
                      {formatDateTime(tx.date)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Bounded Rendering / Load More Button */}
              {hasMore ? (
                <div className="pt-3 pb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => prev + PAGE_SIZE)}
                    className="px-5 py-2.5 bg-surface-high hover:bg-inverse/[0.08] text-primary border border-inverse/[0.08] rounded-xl text-xs font-semibold transition shadow-sm"
                  >
                    Load More ({filteredTransactions.length - displayLimit} remaining)
                  </button>
                </div>
              ) : (
                filteredTransactions.length > PAGE_SIZE && (
                  <div className="py-2 text-center text-[11px] text-faint">
                    Showing all {filteredTransactions.length} transactions
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
