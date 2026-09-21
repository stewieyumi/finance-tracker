import React from "react";
import { Edit2, Save, Trash2, RotateCcw, X } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { BillType, BillViewModel, CustomWallet, EditFormData } from "../types/finance";

interface BillEditModalProps {
  editingId: string;
  activeBills: BillViewModel[];
  selectedMonth: string;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;
  editScope: "monthOnly" | "default";
  onScopeChange: (scope: "monthOnly" | "default") => void;
  onCancel: () => void;
  onDeleteBill: (id: string) => void;
  onResetMonthOverride: (billId: string) => void;
  onSaveEdit: (category: "bills", scope?: "monthOnly" | "default") => boolean;
  customWallets?: CustomWallet[];
  defaultWallet: string;
}

export const BillEditModal: React.FC<BillEditModalProps> = ({
  editingId,
  activeBills,
  selectedMonth,
  editForm,
  setEditForm,
  editScope,
  onScopeChange,
  onCancel,
  onDeleteBill,
  onResetMonthOverride,
  onSaveEdit,
  customWallets,
  defaultWallet,
}) => (
  <div
    className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    onClick={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}
  >
<div className="bg-surface-elevated border border-border-default rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><Edit2 size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Edit Commitment</h3><p className="text-[11px] text-muted font-medium">{editForm.name}</p></div>
              </div>
              <button onClick={onCancel} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <div className="space-y-4">
              <div className="flex bg-surface-lowest border border-strong rounded-xl p-1 shadow-inner">
                <button type="button" onClick={() => onScopeChange("monthOnly")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${editScope === "monthOnly" ? "bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30" : "text-faint hover:text-secondary"}`}>{selectedMonth.split(" ")[0]} Only</button>
                <button type="button" onClick={() => onScopeChange("default")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${editScope === "default" ? "bg-blue-500/20 text-blue-300 shadow-sm border border-blue-500/30" : "text-faint hover:text-secondary"}`}>Default Base</button>
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
                <button onClick={() => { onDeleteBill(editingId); onCancel(); }} className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                {activeBills.find(b => b.id === editingId)?.isOverridden && <button onClick={() => { onResetMonthOverride(editingId); onCancel(); }} className="px-4 py-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold rounded-xl text-xs flex items-center justify-center transition shadow-sm"><RotateCcw size={14} className="mr-1.5" /> Reset</button>}
                <button
                  onClick={() => {
                    onSaveEdit("bills", editScope);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition active:scale-[0.98]"
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
);
