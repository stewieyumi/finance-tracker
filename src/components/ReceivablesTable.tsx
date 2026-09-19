import React, { useState, useMemo, useEffect, useRef } from "react";
import { Check, Hourglass, Edit2, Save, Trash2, Plus, ArrowDownLeft, Filter, ChevronDown, Calendar, X, CreditCard } from "lucide-react";
import { Receivable, ReceivableViewModel, ReceivableCategory, ReceivableFrequency, EditFormData, CustomWallet } from "../types/finance";

interface ReceivablesTableProps {
  inflowsLabel?: string;
  inflowCategories?: string[];
  walletLabels?: Record<string, string>;
  
  customWallets?: CustomWallet[];
  activeReceivables: ReceivableViewModel[];
  selectedMonth: string;
  onToggleStatus: (rec: ReceivableViewModel) => void;
  onAddPayment: (rec: ReceivableViewModel, amt: number) => void;
  onAddReceivable: (rec: { name: string; amount: number; category: ReceivableCategory; frequency: ReceivableFrequency; biMonthlyDays?: number[]; monthlyDay?: number; date?: string; wallet?: string; }) => void;
  onDeleteReceivable: (id: string) => void;
  onSaveEdit: (category: "receivables") => void;
  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;
}


const formatOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};


const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${monthNames[mIndex] || parts[1]} ${day}`;
};

export const ReceivablesTable: React.FC<ReceivablesTableProps> = React.memo(({
  inflowsLabel, inflowCategories, walletLabels, customWallets, activeReceivables, selectedMonth,
  onToggleStatus, onAddPayment, onAddReceivable, onDeleteReceivable, onSaveEdit, editingId, setEditingId, editForm, setEditForm
}) => {
  const categoriesList = inflowCategories?.length ? inflowCategories : ["Salary", "Shoot", "Edit", "Payment", "Other"];
  const filterList = ["All", ...categoriesList];
  const allWallets = useMemo(() => customWallets || [], [customWallets]);

  const [isAdding, setIsAdding] = useState(false);
  const [newReceivable, setNewReceivable] = useState({ name: "", amount: "", category: "Shoot" as ReceivableCategory, frequency: "By Date" as ReceivableFrequency, biMonthlyDays: [15, 30], monthlyDay: 15, date: "", wallet: customWallets?.[0]?.id || "main" });
  const [selectedFilter, setSelectedFilter] = useState<"All" | ReceivableCategory>("All");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [payPopoverId, setPayPopoverId] = useState<string | null>(null);
  const [customPayAmount, setCustomPayAmount] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowFilterDropdown(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredReceivables = useMemo(() => {
    if (selectedFilter === "All") return activeReceivables;
    return activeReceivables.filter(r => r.category === selectedFilter);
  }, [activeReceivables, selectedFilter]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReceivable.name || !newReceivable.amount) return;
    onAddReceivable({
      name: newReceivable.name, amount: parseFloat(newReceivable.amount) || 0, category: newReceivable.category, frequency: newReceivable.frequency,
      biMonthlyDays: newReceivable.frequency === "Bi-monthly" ? newReceivable.biMonthlyDays : undefined, monthlyDay: newReceivable.frequency === "Monthly" ? newReceivable.monthlyDay : undefined,
      date: newReceivable.frequency === "By Date" ? newReceivable.date : undefined, wallet: newReceivable.wallet
    });
    setNewReceivable({ name: "", amount: "", category: "Shoot", frequency: "By Date", biMonthlyDays: [15, 30], monthlyDay: 15, date: "", wallet: customWallets?.[0]?.id || "main" });
    setIsAdding(false);
  };

  const handleStartEdit = (rec: ReceivableViewModel) => { setEditingId(rec.id); setEditForm({ ...rec }); setPayPopoverId(null); };
  const handleCancelEdit = () => { setEditingId(null); setEditForm({}); };
  const handleQuickAddHalf = (rec: ReceivableViewModel) => { onAddPayment(rec, (rec.amount || 0) / 2); setPayPopoverId(null); };
  const handleCustomPaySubmit = (rec: ReceivableViewModel) => { const val = parseFloat(customPayAmount); if (val > 0) { onAddPayment(rec, val); setCustomPayAmount(""); setPayPopoverId(null); } };

  return (
    <div className="bg-surface border border-border-default rounded-2xl p-4 sm:p-5 shadow-xl w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2"><ArrowDownLeft size={13} className="text-emerald-400" />{selectedMonth} {inflowsLabel || 'Receivables & Inflows'}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint font-mono hidden sm:inline">{activeReceivables.filter(r => r.collected).length}/{activeReceivables.length} Received</span>
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowFilterDropdown(prev => !prev)} className={`h-7 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${selectedFilter !== "All" ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400" : "bg-inverse/[0.04] border-border-default text-muted hover:text-primary"}`}>
              <Filter size={11} className={selectedFilter !== "All" ? "text-emerald-400" : "text-muted"} />
              <span className="text-[11px]">{selectedFilter === "All" ? "Filter" : selectedFilter}</span>
              <ChevronDown size={10} className="text-faint" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-1.5 w-40 bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                {filterList.map(cat => (
                  <button key={cat} onClick={() => { setSelectedFilter(cat); setShowFilterDropdown(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${selectedFilter === cat ? "bg-emerald-600/20 text-emerald-400 font-semibold" : "text-secondary hover:bg-inverse/[0.06]"}`}>
                    <span>{cat}</span>{selectedFilter === cat && <Check size={11} className="text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE LIST */}
      <div className="block lg:hidden space-y-2 mb-3">
        {filteredReceivables.length === 0 ? (
          <div className="py-6 text-center text-faint text-xs italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} receivables found.</div>
        ) : filteredReceivables.map(rec => {
          const isBiMonthly = rec.frequency === "Bi-monthly";
          const received = rec.amountReceived || 0;
          return (
            <div key={rec.id} className={`p-3 rounded-xl border transition-all ${rec.collected ? "bg-fill-subtle/40 border-strong/60 opacity-50" : "bg-surface-sunken border-strong/80 shadow-sm"}`}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => onToggleStatus(rec)} className="shrink-0 focus:outline-none">
                      {rec.collected ? <span className="w-4 h-4 rounded-full chip-emerald flex items-center justify-center"><Check size={9} className="stroke-[3]" /></span> : <span className="w-4 h-4 rounded-full chip-amber flex items-center justify-center"><Hourglass size={8} /></span>}
                    </button>
                    <span className="privacy-blur text-xs font-semibold text-strong truncate">{rec.name}</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono text-xs font-bold shrink-0 ${rec.collected ? "text-emerald-400" : "text-strong"}`}>₱{rec.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    {!rec.collected && isBiMonthly && <div className="text-[9px] text-faint font-mono">(₱{(rec.amount / 2).toLocaleString()}/payout)</div>}
                    {!rec.collected && received > 0 && <div className="text-[9px] text-cyan-400 font-mono">+₱{received.toLocaleString("en-US")} rec'd</div>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 pl-6 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${rec.category === "Salary" ? "chip-cyan" : rec.category === "Shoot" ? "chip-amber" : rec.category === "Edit" ? "chip-purple" : "chip-neutral"}`}>{rec.category || "Other"}</span>
                    {rec.wallet && <span className="chip-wallet px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">{allWallets.find(w => w.id === rec.wallet)?.label || rec.wallet}</span>}
                    {isBiMonthly && <span>Bi-Monthly ({rec.biMonthlyDays && rec.biMonthlyDays.length > 0 ? rec.biMonthlyDays.map(formatOrdinal).join(" & ") : "15th & 30th"})</span>}
                    {rec.frequency === "Monthly" && <span>Day {rec.monthlyDay || 15}</span>}
                    {rec.frequency === "By Date" && rec.date && <span>{formatShortDate(rec.date)}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!rec.collected && (
                      <>
                        {isBiMonthly && <button onClick={() => handleQuickAddHalf(rec)} className="whitespace-nowrap shrink-0 px-1.5 py-0.5 chip-cyan rounded text-[9px] font-medium">+1/2</button>}
                        <button onClick={() => setPayPopoverId(payPopoverId === rec.id ? null : rec.id)} className="whitespace-nowrap shrink-0 px-1.5 py-0.5 chip-emerald rounded text-[9px] font-medium">+₱</button>
                      </>
                    )}
                    <button onClick={() => handleStartEdit(rec)} className="whitespace-nowrap shrink-0 px-2 py-0.5 text-muted hover:text-amber-300 bg-fill-strong/70 rounded text-[10px]">Edit</button>
                  </div>
                </div>
                {payPopoverId === rec.id && (
                  <div className="mt-2 pt-2 border-t border-strong/60 flex items-center gap-1.5">
                    <input type="number" inputMode="decimal" placeholder="₱ Amount" value={customPayAmount} onChange={(e) => setCustomPayAmount(e.target.value)} className="w-24 bg-surface-input border border-strong rounded px-2 py-1 text-xs text-strong font-mono outline-none" />
                    <button onClick={() => handleCustomPaySubmit(rec)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold">Add</button>
                    <button onClick={() => setPayPopoverId(null)} className="p-1 text-muted hover:text-strong"><X size={12} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP LIST */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <table className="w-full table-fixed text-left text-xs min-w-[650px]">
          <thead>
            <tr className="text-muted border-b border-border-subtle text-[11px] uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold w-[15%]">STATUS</th>
              <th className="py-3 px-4 font-semibold w-[25%]">RECEIVABLE</th>
              <th className="py-3 px-4 font-semibold text-right w-[15%]">AMOUNT</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">CATEGORY</th>
              <th className="py-3 px-4 font-semibold text-center w-[15%]">SCHEDULE</th>
              <th className="py-3 px-4 font-semibold text-right w-[15%]">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredReceivables.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-faint italic">No {selectedFilter !== "All" ? selectedFilter.toLowerCase() : ""} receivables found.</td></tr>
            ) : filteredReceivables.map(rec => {
              const isBiMonthly = rec.frequency === "Bi-monthly";
              const received = rec.amountReceived || 0;
              const isPartial = !rec.collected && received > 0;
              return (
                <tr key={rec.id} className={`group transition-all duration-150 ${rec.collected ? "opacity-45" : "hover:bg-inverse/[0.02]"}`}>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <button onClick={() => onToggleStatus(rec)} className="flex items-center gap-1.5 focus:outline-none">
                      {rec.collected ? <span className="flex items-center justify-center gap-1 w-[82px] text-[10px] font-semibold chip-emerald px-2 py-0.5 rounded-lg"><Check size={10} className="stroke-[3]" /> Received</span> : isPartial ? <span className="flex items-center justify-center gap-1 w-[82px] text-[10px] font-semibold chip-cyan px-2 py-0.5 rounded-lg"><CreditCard size={9} /> Partial</span> : <span className="flex items-center justify-center gap-1 w-[82px] text-[10px] font-medium chip-amber px-2 py-0.5 rounded-lg"><Hourglass size={8} /> Pending</span>}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-primary font-medium"><span className="privacy-blur">{rec.name}</span></td>
                  <td className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${rec.collected ? "text-emerald-400" : "text-strong"}`}>
                    <div>
                      <div>₱{rec.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                      {isBiMonthly && <div className="text-[9px] text-faint font-mono font-normal">₱{(rec.amount / 2).toLocaleString()}/payout</div>}
                      {isPartial && <div className="text-[9px] text-cyan-400 font-mono">+₱{received.toLocaleString()} rec'd</div>}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${rec.category === "Salary" ? "chip-cyan" : rec.category === "Shoot" ? "chip-amber" : rec.category === "Edit" ? "chip-purple" : "chip-neutral"}`}>{rec.category || "Other"}</span>
                      {rec.wallet && <span className="chip-wallet px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">{allWallets.find(w => w.id === rec.wallet)?.label || rec.wallet}</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <div className="text-secondary text-xs">
                      {rec.frequency === "Bi-monthly" && <span className="text-secondary font-medium text-[11px]">Bi-Monthly ({rec.biMonthlyDays && rec.biMonthlyDays.length > 0 ? rec.biMonthlyDays.map(formatOrdinal).join(" & ") : "15th & 30th"})</span>}
                      {rec.frequency === "Monthly" && <span className="text-muted text-[11px]">Monthly • Day {rec.monthlyDay || 15}</span>}
                      {rec.frequency === "By Date" && (rec.date ? <span className="inline-flex items-center gap-1 text-secondary font-mono text-[11px]"><Calendar size={10} className="text-faint" />{formatShortDate(rec.date)}</span> : <span className="text-disabled">—</span>)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right relative">
                    <div className="flex flex-wrap items-center gap-1 justify-end">
                      {!rec.collected && (
                        <>
                          {isBiMonthly && <button onClick={() => handleQuickAddHalf(rec)} title="Add 1st/2nd half payment" className="whitespace-nowrap shrink-0 px-1.5 py-0.5 text-[9px] font-mono chip-cyan rounded transition">+1/2</button>}
                          <button onClick={() => setPayPopoverId(payPopoverId === rec.id ? null : rec.id)} title="Add custom payment" className="whitespace-nowrap shrink-0 px-1.5 py-0.5 text-[10px] font-mono chip-emerald rounded transition">+₱</button>
                        </>
                      )}
                      <button onClick={() => handleStartEdit(rec)} className="whitespace-nowrap shrink-0 px-2 py-1 text-muted hover:text-amber-300 hover:bg-inverse/[0.05] rounded-md text-[11px] flex items-center transition"><Edit2 size={10} className="mr-1" /> Edit</button>
                    </div>
                    {payPopoverId === rec.id && (
                      <div className="absolute right-3 top-9 z-20 bg-surface-elevated border border-border-default rounded-xl p-2 shadow-2xl flex items-center gap-1.5">
                        <input type="number" inputMode="decimal" placeholder="+₱" value={customPayAmount} onChange={(e) => setCustomPayAmount(e.target.value)} className="w-20 bg-surface-input border border-strong rounded px-1.5 py-0.5 text-xs text-strong font-mono outline-none text-right" />
                        <button onClick={() => handleCustomPaySubmit(rec)} className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-medium">Add</button>
                        <button onClick={() => setPayPopoverId(null)} className="p-1 text-muted hover:text-strong"><X size={11} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={() => setIsAdding(true)} className="w-full mt-3.5 py-3.5 border border-dashed border-inverse/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-muted hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
        <Plus size={15} /> Add New Inflow
      </button>

      {/* EDIT MODAL */}
      {editingId && activeReceivables.some(r => r.id === editingId) && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) handleCancelEdit(); }}>
          <div className="bg-surface-elevated border border-border-default rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400"><Edit2 size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Edit Inflow</h3><p className="text-[11px] text-muted font-medium">{editForm.name}</p></div>
              </div>
              <button onClick={handleCancelEdit} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Inflow Name</label>
                <input type="text" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Amount (₱)</label>
                  <input type="number" inputMode="decimal" step="0.01" value={editForm.amount ?? ""} onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Category</label>
                  <select value={editForm.category || "Salary"} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ReceivableCategory })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                    {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Destination Wallet</label>
                  <select value={editForm.wallet || customWallets?.[0]?.id || "main"} onChange={(e) => setEditForm({ ...editForm, wallet: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-blue-300 uppercase font-semibold outline-none focus:border-emerald-500">
                    {allWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Frequency</label>
                  <select value={editForm.frequency || "By Date"} onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value as ReceivableFrequency })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                    <option value="By Date">Specific Date</option><option value="Monthly">Monthly</option><option value="Bi-monthly">Bi-Monthly</option>
                  </select>
                </div>
                {editForm.frequency === "Bi-monthly" && (
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">First Day</label>
              <select value={editForm.biMonthlyDays?.[0] || 15} onChange={(e) => setEditForm({ ...editForm, biMonthlyDays: [parseInt(e.target.value, 10), editForm.biMonthlyDays?.[1] || 30].sort((a,b)=>a-b) })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none">
                {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{formatOrdinal(d)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Second Day</label>
              <select value={editForm.biMonthlyDays?.[1] || 30} onChange={(e) => setEditForm({ ...editForm, biMonthlyDays: [editForm.biMonthlyDays?.[0] || 15, parseInt(e.target.value, 10)].sort((a,b)=>a-b) })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none">
                {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{formatOrdinal(d)}</option>)}
              </select>
            </div>
          </div>
        )}
        {editForm.frequency === "Monthly" && (
                  <div className="col-span-1 sm:col-span-2">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Monthly Day</label>
                    <select value={editForm.monthlyDay || 15} onChange={(e) => setEditForm({ ...editForm, monthlyDay: parseInt(e.target.value, 10) })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                      {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Day {d}</option>)}
                    </select>
                  </div>
                )}
                {editForm.frequency === "By Date" && (
                  <div className="col-span-1 sm:col-span-2">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Specific Date</label>
                    <input type="date" value={editForm.date || ""} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
                <button onClick={() => { onDeleteReceivable(editingId); handleCancelEdit(); }} className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                <button onClick={() => { onSaveEdit("receivables"); handleCancelEdit(); }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition active:scale-[0.98]"><Save size={16} /> Save Changes</button>
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
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400"><Plus size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Add New Inflow</h3><p className="text-[11px] text-muted font-medium">Log a receivable or salary</p></div>
              </div>
              <button onClick={() => setIsAdding(false)} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Inflow Name</label>
                <input type="text" value={newReceivable.name} onChange={(e) => setNewReceivable({ ...newReceivable, name: e.target.value })} autoFocus placeholder="e.g. Salary, Client Payment" className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Amount (₱)</label>
                  <input type="number" inputMode="decimal" step="0.01" value={newReceivable.amount} onChange={(e) => setNewReceivable({ ...newReceivable, amount: e.target.value })} placeholder="0.00" className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-emerald-500" required />
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Category</label>
                  <select value={newReceivable.category} onChange={(e) => setNewReceivable({ ...newReceivable, category: e.target.value as ReceivableCategory })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                    {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Destination Wallet</label>
                  <select value={newReceivable.wallet} onChange={(e) => setNewReceivable({ ...newReceivable, wallet: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-blue-300 uppercase font-semibold outline-none focus:border-emerald-500">
                    {allWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Frequency</label>
                  <select value={newReceivable.frequency} onChange={(e) => setNewReceivable({ ...newReceivable, frequency: e.target.value as ReceivableFrequency })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                    <option value="By Date">Specific Date</option><option value="Monthly">Monthly</option><option value="Bi-monthly">Bi-Monthly</option>
                  </select>
                </div>
                {newReceivable.frequency === "Bi-monthly" && (
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">First Day</label>
              <select value={newReceivable.biMonthlyDays?.[0] || 15} onChange={(e) => setNewReceivable({ ...newReceivable, biMonthlyDays: [parseInt(e.target.value, 10), newReceivable.biMonthlyDays?.[1] || 30].sort((a,b)=>a-b) })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none">
                {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{formatOrdinal(d)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Second Day</label>
              <select value={newReceivable.biMonthlyDays?.[1] || 30} onChange={(e) => setNewReceivable({ ...newReceivable, biMonthlyDays: [newReceivable.biMonthlyDays?.[0] || 15, parseInt(e.target.value, 10)].sort((a,b)=>a-b) })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none">
                {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{formatOrdinal(d)}</option>)}
              </select>
            </div>
          </div>
        )}
        {newReceivable.frequency === "Monthly" && (
                  <div className="col-span-1 sm:col-span-2">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Monthly Day</label>
                    <select value={newReceivable.monthlyDay} onChange={(e) => setNewReceivable({ ...newReceivable, monthlyDay: parseInt(e.target.value, 10) })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500">
                      {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>Day {d}</option>)}
                    </select>
                  </div>
                )}
                {newReceivable.frequency === "By Date" && (
                  <div className="col-span-1 sm:col-span-2">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Specific Date</label>
                    <input type="date" value={newReceivable.date} onChange={(e) => setNewReceivable({ ...newReceivable, date: e.target.value })} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition active:scale-[0.98]"><Plus size={16} /> Add Inflow</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
