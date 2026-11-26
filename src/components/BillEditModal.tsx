import React, { useId, useRef } from "react";
import { Edit2, Save, Trash2, RotateCcw, X } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { BillType, BillViewModel, CustomWallet, EditFormData } from "../types/finance";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

interface BillEditModalProps {
  editingId: string;
  activeBills: BillViewModel[];
  selectedMonth: string;
  editForm: EditFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormData>>;
  editScope: "monthOnly" | "default";
  onScopeChange: (scope: "monthOnly" | "default") => void;
  onReviewPriorPayments?: () => void;
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
  onReviewPriorPayments,
  onDeleteBill,
  onResetMonthOverride,
  onSaveEdit,
  customWallets,
  defaultWallet,
}) => {
  const formId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  return (
  <Modal
    isOpen={true}
    onClose={onCancel}
    variant="floating"
    ariaLabel="Edit Commitment"
    manageFocus
    initialFocusRef={amountRef}
  >
    <div className={`${entryDialogStyles.card} max-w-md mx-auto`}>
            <div className={entryDialogStyles.header}>
              <div className="flex items-center gap-3">
                <div className={entryDialogStyles.icon}><Edit2 size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Edit Commitment</h3><p className="text-[11px] text-muted font-medium">{editForm.name}</p></div>
              </div>
              <button type="button" aria-label="Cancel commitment edit" onClick={onCancel} className={entryDialogStyles.close}><X size={16}/></button>
            </div>
            <form onSubmit={event => { event.preventDefault(); onSaveEdit("bills", editScope); }} className="space-y-4">
              <div className="flex bg-surface-lowest border border-strong rounded-xl p-1 shadow-inner">
                <button type="button" aria-pressed={editScope === "monthOnly"} onClick={() => onScopeChange("monthOnly")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${editScope === "monthOnly" ? "chip-amber shadow-sm" : "text-faint hover:text-secondary"}`}>{selectedMonth.split(" ")[0]} Only</button>
                <button type="button" aria-pressed={editScope === "default"} onClick={() => onScopeChange("default")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${editScope === "default" ? "chip-blue shadow-sm" : "text-faint hover:text-secondary"}`}>Default Base</button>
              </div>
              <p id={`${formId}-scope-help`} className="text-xs text-muted">{editScope === "monthOnly" ? "This month only leaves your default amount unchanged." : "Default Base updates your recurring amount. Monthly overrides stay separate."}</p>
              <div>
                <label htmlFor={`${formId}-amount`} className="mb-1.5 block text-[10px] font-semibold uppercase text-faint">Amount (₱)</label>
                <div className="relative"><span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-faint">₱</span>
                  <input ref={amountRef} id={`${formId}-amount`} aria-describedby={`${formId}-scope-help`} type="number" inputMode="decimal" step="0.01" value={editForm.amount ?? ""} onChange={(e) => { const val = e.target.value === "" ? undefined : parseFloat(e.target.value); setEditForm(prev => ({ ...prev, amount: val, ...(editScope === "monthOnly" ? { monthAmount: val } : { baseAmount: val }) })); }} placeholder="0.00" className={entryDialogStyles.amount} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Commitment Name</label>
                <input type="text" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500 disabled:opacity-50" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Wallet Route</label>
                  <select value={editForm.wallet || defaultWallet} onChange={(e) => setEditForm({ ...editForm, wallet: e.target.value })} disabled={editScope === "monthOnly"} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-primary uppercase font-semibold outline-none focus:border-blue-500 disabled:opacity-50">
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
                {onReviewPriorPayments && (
                  <button type="button" onClick={onReviewPriorPayments} className="rounded-xl bg-inverse/[0.05] px-3 py-2 text-xs">Review prior payments</button>
                )}
                <button type="button" aria-label="Delete commitment" onClick={() => { onDeleteBill(editingId); onCancel(); }} className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                {activeBills.find(b => b.id === editingId)?.isOverridden && <button type="button" onClick={() => { onResetMonthOverride(editingId); onCancel(); }} className="px-4 py-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold rounded-xl text-xs flex items-center justify-center transition shadow-sm"><RotateCcw size={14} className="mr-1.5" /> Reset</button>}
                <button
                  type="submit"
                  className={`${entryDialogStyles.primary} flex-1`}
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </form>
          </div>
  </Modal>
  );
};
