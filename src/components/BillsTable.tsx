import React, { useState, useMemo, useEffect, useRef } from "react";
import { Check, Circle, Edit2, Save, Trash2, Plus, Calendar, Filter, ChevronDown, RotateCcw, X } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { LoanProgressBadge } from "./LoanProgressBadge";
import { BillMobileRow } from "./BillMobileRow";
import { BillDesktopRow } from "./BillDesktopRow";
import { BillEditModal } from "./BillEditModal";
import { BillAddModal } from "./BillAddModal";
import { BillPriorPaymentModal } from "./BillPriorPaymentModal";
import { Bill, BillViewModel, BillType, EditFormData, CustomWallet } from "../types/finance";
import { formatDaysRemaining } from "../utils/dateHelpers";

const BILL_TYPES = ["All", "Bill", "Subscription", "Loan / Installment"];

type BillSortOption = "default" | "dueSoon" | "dueDate" | "amountDesc" | "amountAsc" | "nameAsc" | "unpaidFirst";

interface BillsTableProps {
  activeBills: BillViewModel[];
  selectedMonth: string;
  onToggleStatus: (bill: BillViewModel, skipWalletMutation?: boolean) => void;
  onAddBill: (bill: { name: string; amount: number; dueDay: string; type: BillType; startMonth: string; endMonth: string; wallet?: string }) => Bill | null;
  onDeleteBill: (id: string) => void;
  onSaveEdit: (category: "bills", scope?: "monthOnly" | "default") => boolean;
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
    if (!createdBill) return;
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
   <BillMobileRow
     bill={bill}
     customWallets={customWallets}
     highlightOverdue={highlightOverdue}
     onToggleStatus={onToggleStatus}
     onEdit={handleStartEdit}
   />
 );

  const renderDesktopRow = (bill: BillViewModel) => (
    <BillDesktopRow
      bill={bill}
      selectedMonth={selectedMonth}
      customWallets={customWallets}
      highlightOverdue={highlightOverdue}
      onToggleStatus={onToggleStatus}
      onEdit={handleStartEdit}
    />
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
       <BillEditModal
         editingId={editingId}
         activeBills={activeBills}
         selectedMonth={selectedMonth}
         editForm={editForm}
         setEditForm={setEditForm}
         editScope={editScope}
         onScopeChange={handleScopeChange}
         onCancel={handleCancelEdit}
         onDeleteBill={onDeleteBill}
         onResetMonthOverride={onResetMonthOverride}
         onSaveEdit={onSaveEdit}
         customWallets={customWallets}
         defaultWallet={defaultWallet}
       />
     )}

     {/* ADD MODAL */}
     {isAdding && (
       <BillAddModal
         newBill={newBill}
         setNewBill={setNewBill}
         customWallets={customWallets}
         onSubmit={handleAddSubmit}
         onCancel={() => setIsAdding(false)}
       />
     )}

      {/* PRIOR PAYMENT PROMPT MODAL */}
      {pendingPriorPayment && (
        <BillPriorPaymentModal
          pendingPriorPayment={pendingPriorPayment}
          setPendingPriorPayment={setPendingPriorPayment}
          onToggleStatus={onToggleStatus}
        />
      )}
    </div>
  );
});
