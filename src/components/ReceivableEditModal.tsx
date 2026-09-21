import React from "react";
import { Edit2, Save, Trash2, X } from "lucide-react";
import {
  EditFormData,
  ReceivableCategory,
  ReceivableFrequency,
  CustomWallet,
} from "../types/finance";
import { formatOrdinal } from "../utils/displayHelpers";

interface ReceivableEditModalProps {
  editingId: string;
  editForm: EditFormData;
  categoriesList: string[];
  allWallets: CustomWallet[];
  onChange: React.Dispatch<React.SetStateAction<EditFormData>>;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
}

export const ReceivableEditModal: React.FC<ReceivableEditModalProps> = ({
  editingId,
  editForm,
  categoriesList,
  allWallets,
  onChange,
  onCancel,
  onDelete,
  onSave,
}) => {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-surface-elevated border border-border-default rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Edit2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-strong leading-tight">Edit Inflow</h3>
              <p className="text-[11px] text-muted font-medium">{editForm.name}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Inflow Name
            </label>
            <input
              type="text"
              value={editForm.name || ""}
              onChange={(e) => onChange({ ...editForm, name: e.target.value })}
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Amount (₱)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={editForm.amount ?? ""}
                onChange={(e) =>
                  onChange({
                    ...editForm,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Category
              </label>
              <select
                value={editForm.category || "Salary"}
                onChange={(e) =>
                  onChange({
                    ...editForm,
                    category: e.target.value as ReceivableCategory,
                  })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
              >
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Destination Wallet
              </label>
              <select
                value={editForm.wallet || allWallets[0]?.id || "main"}
                onChange={(e) =>
                  onChange({ ...editForm, wallet: e.target.value })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-blue-300 uppercase font-semibold outline-none focus:border-emerald-500"
              >
                {allWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Frequency
              </label>
              <select
                value={editForm.frequency || "By Date"}
                onChange={(e) =>
                  onChange({
                    ...editForm,
                    frequency: e.target.value as ReceivableFrequency,
                  })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
              >
                <option value="By Date">Specific Date</option>
                <option value="Monthly">Monthly</option>
                <option value="Bi-monthly">Bi-Monthly</option>
              </select>
            </div>

            {editForm.frequency === "Bi-monthly" && (
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                    First Day
                  </label>
                  <select
                    value={editForm.biMonthlyDays?.[0] || 15}
                    onChange={(e) =>
                      onChange({
                        ...editForm,
                        biMonthlyDays: [
                          parseInt(e.target.value, 10),
                          editForm.biMonthlyDays?.[1] || 30,
                        ].sort((a, b) => a - b),
                      })
                    }
                    className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {formatOrdinal(d)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                    Second Day
                  </label>
                  <select
                    value={editForm.biMonthlyDays?.[1] || 30}
                    onChange={(e) =>
                      onChange({
                        ...editForm,
                        biMonthlyDays: [
                          editForm.biMonthlyDays?.[0] || 15,
                          parseInt(e.target.value, 10),
                        ].sort((a, b) => a - b),
                      })
                    }
                    className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {formatOrdinal(d)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {editForm.frequency === "Monthly" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                  Monthly Day
                </label>
                <select
                  value={editForm.monthlyDay || 15}
                  onChange={(e) =>
                    onChange({
                      ...editForm,
                      monthlyDay: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editForm.frequency === "By Date" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                  Specific Date
                </label>
                <input
                  type="date"
                  value={editForm.date || ""}
                  onChange={(e) =>
                    onChange({ ...editForm, date: e.target.value })
                  }
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
            <button
              onClick={() => {
                onDelete(editingId);
                onCancel();
              }}
              className="p-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center justify-center shadow-sm"
            >
              <Trash2 size={16} />
            </button>

            <button
              onClick={() => {
                onSave();
                onCancel();
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition active:scale-[0.98]"
            >
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
