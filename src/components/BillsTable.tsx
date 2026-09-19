import React, { useState, useMemo, useEffect, useRef } from "react";
import { Check, Circle, Edit2, Save, Trash2, Plus, Calendar, Filter, ChevronDown, RotateCcw, X } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { LoanProgressBadge } from "./LoanProgressBadge";
import { Bill, BillViewModel, BillType, EditFormData, CustomWallet } from "../types/finance";
import { formatDaysRemaining } from "../utils/dateHelpers";

const BILL_TYPES = ["All", "Bill", "Subscription", "Loan / Installment"];

type BillSortOption = "default" | "dueSoon" | "dueDate" | "amountDesc" | "amountAsc" | "nameAsc" | "unpaidFirst";

interface BillsTableProps {
  activeBills: BillViewModel[];
  selectedMonth: string;
  onToggleStatus: (bill: BillViewModel, skipWalletMutation?: boolean) => void;
  onAddBill: (bill: { name: string; amount: number; dueDay: string; type: BillType; startMonth: string; endMonth: string; wallet?: string }) => Bill;
  onDeleteBill: (id: string) => void;
  onSaveEdit: (category: "bills", scope?: "monthOnly" | "default") => void;
  onResetMonthOverride: (billId: string) => void;
  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;
  
  customWallets?: CustomWallet[];
  walletLabels?: Record<string, string>;
  defaultWallet?: string;
  highlightOverdue?: boolean;
}

export const BillsTable: React.FC<BillsTableProps> = React.memo(({
  activeBills, selectedMonth, onToggleStatus, onAddBill, onDeleteBill, onSaveEdit, onResetMonthOverride,
  editingId, setEditingId, editForm, setEditForm, customWallets, defaultWallet = "main", highlightOverdue = false
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newBill, setNewBill] = useState({ name: "", amount: "", dueDay: "1", type: "Bill" as BillType, startMonth: selectedMonth, endMonth: selectedMonth, wallet: defaultWallet });
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<BillSortOption>("default");
  const [pendingPriorPayment, setPendingPriorPayment] = useState<{ bill: Bill; month: string } | null>(null);
  const [editScope, setEditScope] = useState<"monthOnly" | "default">("monthOnly");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setNewBill(p => ({ ...p, startMonth: selectedMonth, endMonth: selectedMonth })); }, [selectedMonth]);
  useEffect(() => { setNewBill(p => ({ ...p, wallet: defaultWallet })); }, [defaultWallet]);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowFilterDropdown(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBills = useMemo(() => {
    let result = selectedFilter === "All" ? activeBills : activeBills.filter(b => b.type === selectedFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(b => b.name.toLowerCase().includes(q));
    }
    return result;
  }, [activeBills, selectedFilter, searchQuery]);

  const sortedBills = useMemo(() => {
    const result = [...filteredBills];
    switch (sortBy) {
      case "dueSoon":
        result.sort((a, b) => {
          const dayDelta = a.daysLeft - b.daysLeft;
          if (dayDelta !== 0) return dayDelta;
          return b.amount - a.amount;
        });
        break;
      case "dueDate":
        result.sort((a, b) => {
          const dayDelta = (parseInt(a.dueDay, 10) || 1) - (parseInt(b.dueDay, 10) || 1);
          if (dayDelta !== 0) return dayDelta;
          return a.name.localeCompare(b.name);
        });
        break;
      case "amountDesc":
        result.sort((a, b) => {
          const amountDelta = b.amount - a.amount;
          if (amountDelta !== 0) return amountDelta;
          return a.name.localeCompare(b.name);
        });
        break;
      case "amountAsc":
        result.sort((a, b) => {
          const amountDelta = a.amount - b.amount;
          if (amountDelta !== 0) return amountDelta;
          return a.name.localeCompare(b.name);
        });
        break;
      case "nameAsc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "unpaidFirst":
        result.sort((a, b) => {
          const paidDelta = Number(a.paid) - Number(b.paid);
          if (paidDelta !== 0) return paidDelta;
          const dayDelta = (parseInt(a.dueDay, 10) || 1) - (parseInt(b.dueDay, 10) || 1);
          if (dayDelta !== 0) return dayDelta;
          return a.name.localeCompare(b.name);
        });
        break;
      case "default":
      default:
        break;
    }
    return result;
  }, [filteredBills, sortBy]);

  const firstHalfBills = useMemo(() => sortedBills.filter(b => (parseInt(b.dueDay, 10) || 1) <= 15), [sortedBills]);
  const secondHalfBills = useMemo(() => sortedBills.filter(b => (parseInt(b.dueDay, 10) || 1) > 15), [sortedBills]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBill.name.trim();
    const amount = parseFloat(newBill.amount);
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    const createdBill = onAddBill({ name, amount, dueDay: newBill.dueDay, type: newBill.type, startMonth: newBill.startMonth, endMonth: newBill.endMonth, wallet: newBill.wallet });
    setNewBill({ name: "", amount: "", dueDay: "1", type: "Bill", startMonth: selectedMonth, endMonth: selectedMonth, wallet: defaultWallet });
    setIsAdding(false);

    if (createdBill.type === "Loan / Installment" && createdBill.startMonth === selectedMonth) {
      setPendingPriorPayment({ bill: createdBill, month: selectedMonth });
    }
  };

  const handleStartEdit = (bill: BillViewModel) => {
    setEditingId(bill.id);
    setEditScope("monthOnly");
    setEditForm({ ...bill, monthAmount: bill.amount, baseAmount: bill.baseAmount !== undefined ? bill.baseAmount : bill.amount });
  };

  const handleCancelEdit = () => { setEditingId(null); setEditForm({}); };

  const handleScopeChange = (scope: "monthOnly" | "default") => {
    setEditScope(scope);
    if (scope === "default") setEditForm(prev => ({ ...prev, amount: prev.baseAmount !== undefined ? prev.baseAmount : prev.amount }));
    else setEditForm(prev => ({ ...prev, amount: typeof prev.monthAmount === "number" ? prev.monthAmount : parseFloat(String(prev.monthAmount || 0)) }));
  };

  const renderMobileRow = (bill: BillViewModel) => (
    <div key={bill.id} className={`p-3 rounded-xl border transition-all ${bill.paid ? "bg-fill-subtle/40 border-strong/60 opacity-40" : "bg-surface-sunken border-strong/80 shadow-sm"} ${highlightOverdue && (bill.daysLeft ?? 0) < 0 && !bill.paid ? 'ring-2 ring-orange-500/50' : ''}`}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => onToggleStatus(bill)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left focus:outline-none group">
      <div className="shrink-0">
              {bill.paid ? <span className="w-5 h-5 rounded-full bg-blue-950/70 border border-blue-500/50 text-blue-400 flex items-center justify-center"><Check size={11} className="stroke-[3]" /></span> : <span className="w-5 h-5 rounded-full bg-rose-950/40 border border-rose-500/40 text-rose-400 flex items-center justify-center"><Circle size={7} className="fill-rose-400/40" /></span>}
            </div>
      <span className="privacy-blur text-xs font-semibold text-strong truncate group-hover:text-blue-400 transition-colors">{bill.name}</span>
            {bill.isOverridden && <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1 rounded shrink-0">adj</span>}
    </button>
          <span className={`font-mono text-xs font-bold shrink-0 ${bill.paid ? "text-blue-400" : "text-strong"}`}>₱{bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-start justify-between pl-7 text-[10px] text-muted">
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded font-medium ${bill.type === "Subscription" ? "bg-purple-950/80 text-purple-300 border border-purple-800/40" : bill.type === "Loan / Installment" ? "bg-amber-950/80 text-amber-300 border border-amber-800/40" : "bg-blue-950/80 text-blue-300 border border-blue-800/40"}`}>{bill.type}</span>
              {bill.wallet && <span className="bg-fill-strong/80 text-secondary border border-strong/40 px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">{customWallets?.find(cw => cw.id === bill.wallet)?.label || bill.wallet}</span>}
              {bill.dueDay && <span className="font-mono">Day {bill.dueDay}</span>}
              {bill.paid ? (
                <span className="px-2 py-0.5 rounded font-semibold tracking-wide bg-emerald-950/30 text-emerald-400/80 border border-emerald-800/30">Settled</span>
              ) : (
                <span className={`px-2 py-0.5 rounded font-semibold tracking-wide ${formatDaysRemaining(bill.daysLeft).tone === "urgent" ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse" : formatDaysRemaining(bill.daysLeft).tone === "overdue" ? "bg-rose-600/25 text-rose-300 border border-rose-500/40" : formatDaysRemaining(bill.daysLeft).tone === "warning" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-slate-800 text-slate-400 border border-slate-700/60"}`}>{formatDaysRemaining(bill.daysLeft).text}</span>
              )}
            </div>
            {bill.type === "Loan / Installment" && <div className="mt-1"><LoanProgressBadge startMonth={bill.startMonth} endMonth={bill.endMonth} targetMonthForDue={bill.targetMonthForDue} isPaid={bill.paid} monthlyAmount={bill.baseAmount} totalPaid={bill.totalLoanPaid} /></div>}
          </div>
          <button onClick={() => handleStartEdit(bill)} className="px-2 py-0.5 text-muted hover:text-amber-300 bg-fill-strong/70 hover:bg-fill-strong border border-strong/40 rounded-md transition flex items-center gap-1 text-[10px] shrink-0 mt-1">
            <Edit2 size={9} /><span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderDesktopRow = (bill: BillViewModel) => (
    <tr key={bill.id} className={`group transition-all duration-150 ${bill.paid ? "opacity-40" : "hover:bg-inverse/[0.02]"} ${highlightOverdue && (bill.daysLeft ?? 0) < 0 && !bill.paid ? 'bg-orange-900/10' : ''}`}>
      <td className="py-2.5 px-2 align-top pt-3">
        <button onClick={() => onToggleStatus(bill)} className="flex items-center gap-1.5 focus:outline-none">
          {bill.paid ? <span className="flex items-center justify-center gap-1 w-[85px] text-blue-400 text-[11px] font-semibold bg-blue-950/40 px-2 py-1 rounded-lg border border-blue-600/30 transition-all hover:bg-blue-900/50"><Check size={11} className="stroke-[3]" /> Paid</span> : <span className="flex items-center justify-center gap-1 w-[85px] text-rose-400 text-[11px] font-medium bg-rose-950/30 px-2 py-1 rounded-lg border border-rose-800/30 transition-all hover:bg-rose-900/40"><Circle size={9} className="fill-rose-500/20" /> Pending</span>}
        </button>
      </td>
      <td className="py-2.5 px-2 align-top pt-3 text-primary truncate font-medium">
        <div className="flex flex-col">
          <span className="privacy-blur cursor-pointer hover:text-blue-400 transition-colors" onClick={() => onToggleStatus(bill)}>{bill.name}</span>
          {bill.isOverridden && <span className="text-[9px] font-mono text-amber-400 flex items-center gap-1">• {selectedMonth.split(" ")[0]} bill adjusted</span>}
        </div>
      </td>
      <td className={`py-2.5 px-2 align-top pt-3 text-right font-mono font-semibold ${bill.paid ? "text-blue-400" : "text-strong"}`}>
        ₱{bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </td>
      <td className="py-2.5 px-2 align-top text-muted text-[11px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${bill.type === "Subscription" ? "bg-purple-950/70 text-purple-300 border border-purple-800/40" : bill.type === "Loan / Installment" ? "bg-amber-950/70 text-amber-300 border border-amber-800/40" : "bg-blue-950/70 text-blue-300 border border-blue-800/40"}`}>{bill.type}</span>
            {bill.wallet && <span className="bg-fill-strong/80 text-secondary border border-strong/40 px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">{customWallets?.find(cw => cw.id === bill.wallet)?.label || bill.wallet}</span>}
            {bill.dueDay && <span className="text-[11px] text-muted font-mono">Day {bill.dueDay}</span>}
            {bill.paid ? (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-emerald-950/30 text-emerald-400/80 border border-emerald-800/30">Settled</span>
            ) : (
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide ${formatDaysRemaining(bill.daysLeft).tone === "urgent" ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse" : formatDaysRemaining(bill.daysLeft).tone === "overdue" ? "bg-rose-600/25 text-rose-300 border border-rose-500/40" : formatDaysRemaining(bill.daysLeft).tone === "warning" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-slate-800 text-slate-400 border border-slate-700/60"}`}>{formatDaysRemaining(bill.daysLeft).text}</span>
            )}
          </div>
          {bill.type === "Loan / Installment" && <div className="mt-1"><LoanProgressBadge startMonth={bill.startMonth} endMonth={bill.endMonth} targetMonthForDue={bill.targetMonthForDue} isPaid={bill.paid} monthlyAmount={bill.baseAmount} totalPaid={bill.totalLoanPaid} /></div>}
        </div>
      </td>
      <td className="py-2.5 px-2 align-top text-center whitespace-nowrap pt-2">
        <div className="inline-flex items-center gap-1 bg-surface-high p-1 rounded-lg border border-inverse/[0.05]">
          <button onClick={() => handleStartEdit(bill)} className="px-2 py-1 text-muted hover:text-amber-300 hover:bg-inverse/[0.05] rounded-md text-[10px] flex items-center transition">
            <Edit2 size={10} className="mr-1"/> Edit
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-surface border border-border-default rounded-2xl p-4 sm:p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 shrink-0">
          <Calendar size={13} className="text-blue-400" /> {selectedMonth} Commitments
        </h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-[10px] text-faint font-mono hidden sm:inline">{activeBills.filter(b => b.paid).length}/{activeBills.length} Paid</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 w-20 sm:w-28 px-2.5 rounded-xl border border-border-default bg-inverse/[0.04] text-[11px] text-strong placeholder:text-faint outline-none focus:border-blue-500/50 transition-all"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as BillSortOption)}
            aria-label="Sort commitments"
            className="h-7 px-2 rounded-xl border border-border-default bg-inverse/[0.04] text-[11px] text-muted outline-none focus:border-blue-500/50 cursor-pointer max-w-[100px] truncate"
          >
            <option value="default">Sort</option>
            <option value="dueSoon">Due Soon</option>
            <option value="dueDate">Due Date</option>
            <option value="amountDesc">Amt: High → Low</option>
            <option value="amountAsc">Amt: Low → High</option>
            <option value="nameAsc">Name: A → Z</option>
            <option value="unpaidFirst">Unpaid First</option>
          </select>
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowFilterDropdown(prev => !prev)} className={`h-7 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${selectedFilter !== "All" ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-inverse/[0.04] border-border-default text-muted hover:text-primary"}`}>
              <Filter size={11} className={selectedFilter !== "All" ? "text-blue-400" : "text-muted"} />
              <span className="text-[11px] hidden sm:inline">{selectedFilter === "All" ? "Filter" : selectedFilter}</span>
              <ChevronDown size={10} className="text-faint" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-1.5 w-44 bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                {BILL_TYPES.map(type => (
                  <button key={type} onClick={() => { setSelectedFilter(type); setShowFilterDropdown(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${selectedFilter === type ? "bg-blue-600/20 text-blue-400 font-semibold" : "text-secondary hover:bg-inverse/[0.06]"}`}>
                    <span>{type}</span>{selectedFilter === type && <Check size={11} className="text-blue-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE LIST */}
      <div className="block md:hidden space-y-3">
        {filteredBills.length === 0 ? (
          <div className="py-6 text-center text-faint text-xs italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found{searchQuery ? ` matching "${searchQuery}"` : ""}.</div>
        ) : (
          <>
            {firstHalfBills.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-faint px-1">Days 1–15</div>
                {firstHalfBills.map(bill => renderMobileRow(bill))}
              </div>
            )}
            {secondHalfBills.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-faint px-1">Days 16–31</div>
                {secondHalfBills.map(bill => renderMobileRow(bill))}
              </div>
            )}
          </>
        )}
      </div>

      {/* DESKTOP LIST */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs table-fixed">
          <colgroup><col style={{ width: "14%" }} /><col style={{ width: "24%" }} /><col style={{ width: "18%" }} /><col style={{ width: "32%" }} /><col style={{ width: "12%" }} /></colgroup>
          <thead>
            <tr className="text-faint border-b border-inverse/[0.05] text-[11px]">
              <th className="py-2.5 px-2 font-semibold">Status</th><th className="py-2.5 px-2 font-semibold">Commitment</th><th className="py-2.5 px-2 font-semibold text-right">Amount</th><th className="py-2.5 px-2 font-semibold">Type & Due Date</th><th className="py-2.5 px-2 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          {filteredBills.length === 0 ? (
            <tbody>
              <tr><td colSpan={5} className="py-6 text-center text-faint italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found{searchQuery ? ` matching "${searchQuery}"` : ""}.</td></tr>
            </tbody>
          ) : (
            <>
              {firstHalfBills.length > 0 && (
                <tbody className="divide-y divide-white/[0.03]">
                  <tr><td colSpan={5} className="pt-3 pb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-faint">Days 1–15</td></tr>
                  {firstHalfBills.map(bill => renderDesktopRow(bill))}
                </tbody>
              )}
              {secondHalfBills.length > 0 && (
                <tbody className="divide-y divide-white/[0.03]">
                  <tr><td colSpan={5} className="pt-3 pb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-faint">Days 16–31</td></tr>
                  {secondHalfBills.map(bill => renderDesktopRow(bill))}
                </tbody>
              )}
            </>
          )}
        </table>
      </div>

      <button onClick={() => setIsAdding(true)} className="w-full mt-3.5 py-3.5 border border-dashed border-inverse/[0.15] hover:border-blue-500/50 hover:bg-blue-500/10 text-muted hover:text-blue-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
        <Plus size={15} /> Add New Commitment
      </button>

      {/* EDIT MODAL */}
      {editingId && activeBills.some(b => b.id === editingId) && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) handleCancelEdit(); }}>
          <div className="bg-surface-elevated border border-border-default rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><Edit2 size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Edit Commitment</h3><p className="text-[11px] text-muted font-medium">{editForm.name}</p></div>
              </div>
              <button onClick={handleCancelEdit} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <div className="space-y-4">
              <div className="flex bg-surface-lowest border border-strong rounded-xl p-1 shadow-inner">
                <button type="button" onClick={() => handleScopeChange("monthOnly")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${editScope === "monthOnly" ? "bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30" : "text-faint hover:text-secondary"}`}>{selectedMonth.split(" ")[0]} Only</button>
                <button type="button" onClick={() => handleScopeChange("default")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${editScope === "default" ? "bg-blue-500/20 text-blue-300 shadow-sm border border-blue-500/30" : "text-faint hover:text-secondary"}`}>Default Base</button>
              </div>
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Commitment Name</label>
                <input type="text" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500 disabled:opacity-50" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Amount (₱)</label>
                  <input type="number" inputMode="decimal" step="0.01" value={editForm.amount ?? ""} onChange={(e) => { const val = parseFloat(e.target.value) || 0; setEditForm(prev => ({ ...prev, amount: val, ...(editScope === "monthOnly" ? { monthAmount: val } : { baseAmount: val }) })); }} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Wallet Route</label>
                  <select value={editForm.wallet || defaultWallet} onChange={(e) => setEditForm({ ...editForm, wallet: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-blue-300 uppercase font-semibold outline-none focus:border-blue-500 disabled:opacity-50">
                    {customWallets?.map(cw => <option key={cw.id} value={cw.id}>{cw.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Type</label>
                  <select value={editForm.type || "Bill"} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as BillType })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500 disabled:opacity-50">
                    <option value="Bill">Bill</option><option value="Subscription">Subscription</option><option value="Loan / Installment">Loan / Installment</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Due Date</label>
                  <select value={editForm.dueDay || "1"} onChange={(e) => setEditForm({ ...editForm, dueDay: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500 disabled:opacity-50">
                    {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Day {d}</option>)}
                  </select>
                </div>
              </div>
              {editForm.type === "Loan / Installment" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Start Month</label>
                    <select value={editForm.startMonth || selectedMonth} onChange={(e) => setEditForm({ ...editForm, startMonth: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none disabled:opacity-50">
                      {ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">End Month</label>
                    <select value={editForm.endMonth || selectedMonth} onChange={(e) => setEditForm({ ...editForm, endMonth: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none disabled:opacity-50">
                      {ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
                <button onClick={() => { onDeleteBill(editingId); handleCancelEdit(); }} className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                {activeBills.find(b => b.id === editingId)?.isOverridden && <button onClick={() => { onResetMonthOverride(editingId); handleCancelEdit(); }} className="px-4 py-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold rounded-xl text-xs flex items-center justify-center transition shadow-sm"><RotateCcw size={14} className="mr-1.5" /> Reset</button>}
                <button onClick={() => { onSaveEdit("bills", editScope); handleCancelEdit(); }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition active:scale-[0.98]"><Save size={16} /> Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {isAdding && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) setIsAdding(false); }}>
          <div className="bg-surface-elevated border border-border-default rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><Plus size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Add New Commitment</h3><p className="text-[11px] text-muted font-medium">Add a recurring bill or loan</p></div>
              </div>
              <button onClick={() => setIsAdding(false)} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Commitment Name</label>
                <input type="text" value={newBill.name} onChange={(e) => setNewBill({ ...newBill, name: e.target.value })} autoFocus placeholder="e.g. Internet Bill" className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Amount (₱)</label>
                  <input type="number" inputMode="decimal" step="0.01" value={newBill.amount} onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })} placeholder="0.00" className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-blue-500" required />
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Wallet Route</label>
                  <select value={newBill.wallet} onChange={(e) => setNewBill({ ...newBill, wallet: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-blue-300 uppercase font-semibold outline-none focus:border-blue-500">
                    {customWallets?.map(cw => <option key={cw.id} value={cw.id}>{cw.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Type</label>
                  <select value={newBill.type} onChange={(e) => setNewBill({ ...newBill, type: e.target.value as BillType })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500">
                    <option value="Bill">Bill</option><option value="Subscription">Subscription</option><option value="Loan / Installment">Loan / Installment</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Due Date</label>
                  <select value={newBill.dueDay} onChange={(e) => setNewBill({ ...newBill, dueDay: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500">
                    {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Day {d}</option>)}
                  </select>
                </div>
              </div>
              {newBill.type === "Loan / Installment" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Start Month</label>
                    <select value={newBill.startMonth} onChange={(e) => setNewBill({ ...newBill, startMonth: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500">
                      {ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">End Month</label>
                    <select value={newBill.endMonth} onChange={(e) => setNewBill({ ...newBill, endMonth: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500">
                      {ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition active:scale-[0.98]"><Plus size={16} /> Add Commitment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRIOR PAYMENT PROMPT MODAL */}
      {pendingPriorPayment && (
        <div className="fixed inset-0 z-[250] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-elevated border border-border-default rounded-3xl p-6 w-full max-w-sm shadow-[0_0_60px_rgba(0,0,0,0.8)] space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-strong leading-tight">Was this payment already made?</h3>
              <p className="text-[11px] text-muted">
                {pendingPriorPayment.bill.name} starts in {pendingPriorPayment.month}. This marks the bill as already paid for this month without changing your wallet balance.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPendingPriorPayment(null)}
                className="flex-1 py-2.5 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl text-secondary transition"
              >
                Leave Unpaid
              </button>
              <button
                onClick={() => {
                  const billView: BillViewModel = {
                    ...pendingPriorPayment.bill,
                    baseAmount: pendingPriorPayment.bill.amount,
                    paid: false,
                    targetMonthForDue: pendingPriorPayment.month,
                    daysLeft: 0,
                    isOverridden: false
                  };
                  onToggleStatus(billView, true);
                  setPendingPriorPayment(null);
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-xl text-white shadow-lg shadow-blue-900/20 transition"
              >
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
