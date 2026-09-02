import React, { useState, useMemo, useEffect, useRef } from "react";
import { Check, Circle, Edit2, Save, Trash2, Plus, Calendar, Filter, ChevronDown, RotateCcw } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { LoanProgressBadge } from "./LoanProgressBadge";
import { Bill, BillType, EditFormData } from "../types/finance";

const BILL_TYPES = ["All", "Bill", "Subscription", "Loan / Installment"];

interface ExtendedBill extends Bill {
  baseAmount?: number;
  monthAmount?: number | string;
}

interface BillsTableProps {
  activeBills: ExtendedBill[];
  selectedMonth: string;
  onToggleStatus: (bill: ExtendedBill) => void;
  onAddBill: (bill: { name: string; amount: number; dueDay: string; type: BillType; startMonth: string; endMonth: string }) => void;
  onDeleteBill: (id: string) => void;
  onSaveEdit: (category: "bills", scope?: "monthOnly" | "default") => void;
  onResetMonthOverride: (billId: string) => void;
  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;
}

export const BillsTable: React.FC<BillsTableProps> = React.memo(({
  activeBills,
  selectedMonth,
  onToggleStatus,
  onAddBill,
  onDeleteBill,
  onSaveEdit,
  onResetMonthOverride,
  editingId,
  setEditingId,
  editForm,
  setEditForm
}) => {
  const [newBill, setNewBill] = useState({ name: "", amount: "", dueDay: "1", type: "Bill" as BillType, startMonth: selectedMonth, endMonth: selectedMonth });
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [editScope, setEditScope] = useState<"monthOnly" | "default">("monthOnly");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNewBill(p => ({ ...p, startMonth: selectedMonth, endMonth: selectedMonth }));
  }, [selectedMonth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBills = useMemo(() => {
    if (selectedFilter === "All") return activeBills;
    return activeBills.filter(b => b.type === selectedFilter);
  }, [activeBills, selectedFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBill.name || !newBill.amount) return;
    onAddBill({
      name: newBill.name,
      amount: parseFloat(newBill.amount) || 0,
      dueDay: newBill.dueDay,
      type: newBill.type,
      startMonth: newBill.startMonth,
      endMonth: newBill.endMonth
    });
    setNewBill({ name: "", amount: "", dueDay: "1", type: "Bill", startMonth: selectedMonth, endMonth: selectedMonth });
  };

  const handleStartEdit = (bill: ExtendedBill) => {
    setEditingId(bill.id);
    setEditScope("monthOnly");
    setEditForm({
      ...bill,
      monthAmount: bill.amount,
      baseAmount: bill.baseAmount !== undefined ? bill.baseAmount : bill.amount
    });
  };

  const handleScopeChange = (scope: "monthOnly" | "default") => {
    setEditScope(scope);
    if (scope === "default") {
      setEditForm(prev => ({
        ...prev,
        amount: prev.baseAmount !== undefined ? prev.baseAmount : prev.amount
      }));
    } else {
      setEditForm(prev => ({
        ...prev,
        amount: typeof prev.monthAmount === "number" ? prev.monthAmount : parseFloat(String(prev.monthAmount || 0))
      }));
    }
  };

  return (
    <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
          <Calendar size={13} className="text-blue-400" />
          {selectedMonth} Bills & Fixed Commitments
        </h2>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
            {activeBills.filter(b => b.paid).length}/{activeBills.length} Paid
          </span>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(prev => !prev)}
              aria-label="Filter Bills by type"
              className={`h-7 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                selectedFilter !== "All"
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                  : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"
              }`}
            >
              <Filter size={11} className={selectedFilter !== "All" ? "text-blue-400" : "text-zinc-400"} />
              <span className="text-[11px]">{selectedFilter === "All" ? "Filter" : selectedFilter}</span>
              <ChevronDown size={10} className="text-zinc-500" />
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 mt-1.5 w-44 bg-[#181822]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                {BILL_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => { setSelectedFilter(type); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${
                      selectedFilter === type
                        ? "bg-blue-600/20 text-blue-400 font-semibold"
                        : "text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span>{type}</span>
                    {selectedFilter === type && <Check size={11} className="text-blue-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE CLEAN CARDS (< md) */}
      <div className="block md:hidden space-y-2">
        {filteredBills.length === 0 ? (
          <div className="py-6 text-center text-zinc-500 text-xs italic">
            No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found.
          </div>
        ) : (
          filteredBills.map(bill => {
            const isEditing = editingId === bill.id;
            return (
              <div
                key={bill.id}
                className={`p-3 rounded-xl border transition-all ${
                  bill.paid
                    ? "bg-zinc-950/40 border-zinc-900/60 opacity-40"
                    : "bg-[#14141a] border-zinc-800/80 shadow-sm"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Commitment name"
                      className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white text-xs w-full outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={editForm.amount ?? ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setEditForm(prev => ({
                            ...prev,
                            amount: val,
                            ...(editScope === "monthOnly" ? { monthAmount: val } : { baseAmount: val })
                          }));
                        }}
                        placeholder="₱ Amount"
                        className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs font-mono outline-none"
                      />
                      <select
                        value={editForm.type || "Bill"}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value as BillType })}
                        className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value="Bill">Bill</option>
                        <option value="Subscription">Subscription</option>
                        <option value="Loan / Installment">Loan / Installment</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => handleScopeChange("monthOnly")}
                          className={`px-2 py-0.5 rounded ${editScope === "monthOnly" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-zinc-500"}`}
                        >
                          {selectedMonth.split(" ")[0]} only
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScopeChange("default")}
                          className={`px-2 py-0.5 rounded ${editScope === "default" ? "bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40" : "text-zinc-500"}`}
                        >
                          Default
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button onClick={() => onSaveEdit("bills", editScope)} aria-label="Save changes" className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs"><Save size={12} /></button>
                        {bill.isOverridden && (
                          <button onClick={() => onResetMonthOverride(bill.id)} aria-label="Reset override" className="p-1.5 text-amber-400 bg-amber-950/40 rounded-lg text-xs"><RotateCcw size={12} /></button>
                        )}
                        <button onClick={() => onDeleteBill(bill.id)} aria-label="Delete bill" className="p-1.5 text-zinc-400 hover:text-rose-400 bg-zinc-800 rounded-lg text-xs"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={() => onToggleStatus(bill)} aria-label={`Mark ${bill.name} as ${bill.paid ? "unpaid" : "paid"}`} className="shrink-0 focus:outline-none">
                          {bill.paid ? (
                            <span className="w-5 h-5 rounded-full bg-blue-950/70 border border-blue-500/50 text-blue-400 flex items-center justify-center">
                              <Check size={11} className="stroke-[3]" />
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-rose-950/40 border border-rose-500/40 text-rose-400 flex items-center justify-center">
                              <Circle size={7} className="fill-rose-400/40" />
                            </span>
                          )}
                        </button>
                        <span className="text-xs font-semibold text-zinc-100 truncate">{bill.name}</span>
                        {bill.isOverridden && (
                          <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1 rounded shrink-0">adj</span>
                        )}
                      </div>

                      <span className={`font-mono text-xs font-bold shrink-0 ${bill.paid ? "text-blue-400" : "text-zinc-100"}`}>
                        ₱{bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pl-7 text-[10px] text-zinc-400">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.2 rounded font-medium ${
                          bill.type === "Subscription" ? "bg-purple-950/80 text-purple-300 border border-purple-800/40" :
                          bill.type === "Loan / Installment" ? "bg-amber-950/80 text-amber-300 border border-amber-800/40" :
                          "bg-blue-950/80 text-blue-300 border border-blue-800/40"
                        }`}>{bill.type}</span>
                        {bill.dueDay && <span>• Day {bill.dueDay}</span>}
                        {bill.daysLeft !== undefined && <span className="text-zinc-500 font-mono">({bill.daysLeft}d left)</span>}
                        {bill.type === "Loan / Installment" && bill.endMonth && (
                          <span className="text-amber-400/80 font-mono">→ {bill.endMonth}</span>
                        )}
                      </div>

                      <button
                        onClick={() => handleStartEdit(bill)}
                        aria-label={`Edit ${bill.name}`}
                        className="px-2 py-0.5 text-zinc-400 hover:text-amber-300 bg-zinc-800/70 hover:bg-zinc-700/60 border border-zinc-700/40 rounded-md transition flex items-center gap-1 text-[10px]"
                      >
                        <Edit2 size={9} />
                        <span>Edit</span>
                      </button>
                    </div>

                    {bill.type === "Loan / Installment" && (
                      <LoanProgressBadge
                        startMonth={bill.startMonth}
                        endMonth={bill.endMonth}
                        currentMonth={selectedMonth}
                        monthlyAmount={bill.amount}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (≥ md) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs table-fixed">
          <colgroup>
            <col style={{ width: "14%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "32%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr className="text-zinc-500 border-b border-white/[0.05] text-[11px]">
              <th className="py-2.5 px-2 font-semibold">Status</th>
              <th className="py-2.5 px-2 font-semibold">Commitment</th>
              <th className="py-2.5 px-2 font-semibold text-right">Amount</th>
              <th className="py-2.5 px-2 font-semibold">Type & Due Date</th>
              <th className="py-2.5 px-2 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filteredBills.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-zinc-500 italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} commitments found.</td></tr>
            ) : filteredBills.map((bill) => {
              const isEditing = editingId === bill.id;
              return (
                <tr key={bill.id} className={`group transition-all duration-150 ${bill.paid ? "opacity-40" : "hover:bg-white/[0.02]"}`}>
                  <td className="py-2.5 px-2">
                    <button onClick={() => onToggleStatus(bill)} aria-label={`Toggle status for ${bill.name}`} className="flex items-center gap-1.5 focus:outline-none">
                      {bill.paid ? (
                        <span className="flex items-center justify-center gap-1 w-[85px] text-blue-400 text-[11px] font-semibold bg-blue-950/40 px-2 py-1 rounded-lg border border-blue-600/30 transition-all hover:bg-blue-900/50">
                          <Check size={11} className="stroke-[3]" /> Paid
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 w-[85px] text-rose-400 text-[11px] font-medium bg-rose-950/30 px-2 py-1 rounded-lg border border-rose-800/30 transition-all hover:bg-rose-900/40">
                          <Circle size={9} className="fill-rose-500/20" /> Pending
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 px-2 text-zinc-200 truncate font-medium">
                    {isEditing ? (
                      <input type="text" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs w-full focus:ring-1 focus:ring-blue-500 outline-none" />
                    ) : (
                      <div className="flex flex-col">
                        <span>{bill.name}</span>
                        {bill.isOverridden && (
                          <span className="text-[9px] font-mono text-amber-400 flex items-center gap-1">
                            • {selectedMonth.split(" ")[0]} bill adjusted
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`py-2.5 px-2 text-right font-mono font-semibold ${bill.paid ? "text-blue-400" : "text-zinc-100"}`}>
                    {isEditing ? (
                      <div className="flex flex-col items-end gap-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={editForm.amount ?? ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditForm(prev => ({
                              ...prev,
                              amount: val,
                              ...(editScope === "monthOnly" ? { monthAmount: val } : { baseAmount: val })
                            }));
                          }}
                          className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs w-24 text-right focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <div className="flex gap-1 text-[9px] font-sans">
                          <button
                            type="button"
                            onClick={() => handleScopeChange("monthOnly")}
                            className={`px-1.5 py-0.5 rounded transition ${editScope === "monthOnly" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-zinc-500 hover:text-zinc-300"}`}
                          >
                            {selectedMonth.split(" ")[0]} only
                          </button>
                          <button
                            type="button"
                            onClick={() => handleScopeChange("default")}
                            className={`px-1.5 py-0.5 rounded transition ${editScope === "default" ? "bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40" : "text-zinc-500 hover:text-zinc-300"}`}
                          >
                            Default
                          </button>
                        </div>
                      </div>
                    ) : `₱${bill.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                  </td>
                  <td className="py-2.5 px-2 text-zinc-400 text-[11px]">
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <select value={editForm.type || "Bill"} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as BillType })} className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs w-full">
                          <option value="Bill">Bill</option>
                          <option value="Subscription">Subscription</option>
                          <option value="Loan / Installment">Loan / Installment</option>
                        </select>
                        {editForm.type === "Loan / Installment" && (
                          <div className="grid grid-cols-2 gap-1">
                            <select value={editForm.startMonth || selectedMonth} onChange={(e) => setEditForm({ ...editForm, startMonth: e.target.value })} className="bg-[#0b0b0d] border border-zinc-700 rounded px-1 py-0.5 text-white text-[10px]">{ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                            <select value={editForm.endMonth || selectedMonth} onChange={(e) => setEditForm({ ...editForm, endMonth: e.target.value })} className="bg-[#0b0b0d] border border-zinc-700 rounded px-1 py-0.5 text-white text-[10px]">{ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                          </div>
                        )}
                        <select value={editForm.dueDay || "1"} onChange={(e) => setEditForm({ ...editForm, dueDay: e.target.value })} className="bg-[#0b0b0d] border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs w-full">
                          {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Due on {d}{d===1?"st":d===2?"nd":d===3?"rd":"th"}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            bill.type === "Subscription" ? "bg-purple-950/70 text-purple-300 border border-purple-800/40" :
                            bill.type === "Loan / Installment" ? "bg-amber-950/70 text-amber-300 border border-amber-800/40" :
                            "bg-blue-950/70 text-blue-300 border border-blue-800/40"
                          }`}>{bill.type}</span>
                          {bill.dueDay && <span className="text-[10px] text-zinc-400 font-mono">Day {bill.dueDay}</span>}
                          {bill.type === "Loan / Installment" && bill.endMonth && (
                            <span className="text-[10px] text-amber-400/90 font-mono">→ {bill.endMonth}</span>
                          )}
                          {bill.daysLeft !== undefined && <span className="text-[10px] font-mono text-zinc-500">{bill.daysLeft}d left</span>}
                        </div>
                        {bill.type === "Loan / Installment" && (
                          <LoanProgressBadge
                            startMonth={bill.startMonth}
                            endMonth={bill.endMonth}
                            currentMonth={selectedMonth}
                            monthlyAmount={bill.amount}
                          />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 bg-[#1a1a22] p-1 rounded-lg border border-white/[0.05]">
                      {isEditing ? (
                        <>
                          <button onClick={() => onSaveEdit("bills", editScope)} aria-label="Save bill" className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] transition"><Save size={11}/></button>
                          {bill.isOverridden && (
                            <button onClick={() => onResetMonthOverride(bill.id)} aria-label="Reset override" title="Reset to default amount" className="px-1.5 py-1 text-amber-400 hover:bg-amber-950/40 rounded-md text-[10px] transition"><RotateCcw size={10}/></button>
                          )}
                          <button onClick={() => onDeleteBill(bill.id)} aria-label="Delete bill" className="px-2 py-1 text-zinc-400 hover:text-rose-400 rounded-md text-[10px] transition"><Trash2 size={10}/></button>
                        </>
                      ) : (
                        <button onClick={() => handleStartEdit(bill)} aria-label={`Edit ${bill.name}`} className="px-2 py-1 text-zinc-400 hover:text-amber-300 hover:bg-white/[0.05] rounded-md text-[10px] flex items-center transition">
                          <Edit2 size={10} className="mr-1"/> Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className={`grid grid-cols-1 ${newBill.type === "Loan / Installment" ? "md:grid-cols-[1fr_0.7fr_1.2fr_1.8fr_auto]" : "md:grid-cols-[1.5fr_1fr_1fr_1.5fr_auto]"} gap-2 mt-4 pt-4 border-t border-white/[0.05] items-center`}>
        <input type="text" placeholder="New commitment name..." value={newBill.name} onChange={(e) => setNewBill({ ...newBill, name: e.target.value })} className="bg-[#0b0b0d] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none" />
        <input type="number" inputMode="decimal" placeholder="₱ Amount" value={newBill.amount} onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })} className="bg-[#0b0b0e] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none" />
        <select value={newBill.type} onChange={(e) => setNewBill({ ...newBill, type: e.target.value as BillType, startMonth: selectedMonth, endMonth: selectedMonth })} className="bg-[#0b0b0e] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer">
          <option value="Bill">Bill</option>
          <option value="Subscription">Subscription</option>
          <option value="Loan / Installment">Loan / Installment</option>
        </select>
        <div>
          {newBill.type === "Loan / Installment" ? (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-1">
                <select value={newBill.startMonth} onChange={(e) => setNewBill({ ...newBill, startMonth: e.target.value })} className="bg-[#0b0b0e] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] text-white outline-none cursor-pointer">{ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                <select value={newBill.endMonth} onChange={(e) => setNewBill({ ...newBill, endMonth: e.target.value })} className="bg-[#0b0b0e] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] text-white outline-none cursor-pointer">{ALL_MONTH_YEAR_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <select value={newBill.dueDay} onChange={(e) => setNewBill({ ...newBill, dueDay: e.target.value })} className="bg-[#0b0b0e] border border-white/[0.08] rounded-lg px-2.5 py-1 text-[10px] text-white outline-none cursor-pointer w-full">
                {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Due on {d}{d===1?"st":d===2?"nd":d===3?"rd":"th"}</option>)}
              </select>
            </div>
          ) : (
            <select value={newBill.dueDay} onChange={(e) => setNewBill({ ...newBill, dueDay: e.target.value })} className="bg-[#0b0b0e] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer w-full">
              {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Due on {d}{d===1?"st":d===2?"nd":d===3?"rd":"th"}</option>)}
            </select>
          )}
        </div>
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shadow-lg shadow-blue-600/20 transition">
          <Plus size={13} /> Add Bill
        </button>
      </form>
    </div>
  );
});
