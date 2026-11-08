import React from "react";
import { Plus, X } from "lucide-react";
import { ReceivableCategory, ReceivableFrequency } from "../types/finance";
import { formatOrdinal } from "../utils/displayHelpers";
import { formatPHP, roundMoney } from "../utils/currency";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

export interface NewReceivableForm {
  name: string;
  amount: string;
  category: ReceivableCategory;
  wallet: string;
  frequency: ReceivableFrequency;
  biMonthlyDays: number[];
  monthlyDay: number;
  date: string;
}

interface ReceivableAddModalProps {
  newReceivable: NewReceivableForm;
  categoriesList: string[];
  allWallets: { id: string; label: string }[];
  onChange: React.Dispatch<React.SetStateAction<NewReceivableForm>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ReceivableAddModal({
  newReceivable,
  categoriesList,
  allWallets,
  onChange,
  onClose,
  onSubmit,
}: ReceivableAddModalProps) {
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      variant="floating"
      ariaLabel="Add New Inflow"
    >
      <div className={`${entryDialogStyles.card} max-w-md mx-auto`}>
        <div className={entryDialogStyles.header}>
          <div className="flex items-center gap-3">
            <div className={entryDialogStyles.icon}>
              <Plus size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-strong leading-tight">Add New Inflow</h3>
              <p className="text-[11px] text-muted font-medium">Log a receivable or salary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={entryDialogStyles.close}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Inflow Name
            </label>
            <input
              type="text"
              value={newReceivable.name}
              onChange={(e) => onChange({ ...newReceivable, name: e.target.value })}
              autoFocus
              placeholder="e.g. Salary, Client Payment"
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                {newReceivable.frequency === "Bi-monthly" ? "Amount per payday (₱)" : "Amount (₱)"}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={newReceivable.amount}
                onChange={(e) => onChange({ ...newReceivable, amount: e.target.value })}
                min="0.01"
                placeholder="0.00"
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-emerald-500"
                required
              />
              {newReceivable.frequency === "Bi-monthly" && (
                <p className="mt-1 text-xs text-muted">Monthly total: {formatPHP(roundMoney(Number(newReceivable.amount)) * 2)}</p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Category
              </label>
              <select
                value={newReceivable.category}
                onChange={(e) =>
                  onChange({ ...newReceivable, category: e.target.value as ReceivableCategory })
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
                value={newReceivable.wallet}
                onChange={(e) => onChange({ ...newReceivable, wallet: e.target.value })}
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-primary uppercase font-semibold outline-none focus:border-emerald-500"
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
                value={newReceivable.frequency}
                onChange={(e) =>
                  onChange({
                    ...newReceivable,
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

            {newReceivable.frequency === "Bi-monthly" && (
              <div className="col-span-1 sm:col-span-2">
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                      First Day
                    </label>
                    <select
                      value={newReceivable.biMonthlyDays?.[0] || 15}
                      onChange={(e) =>
                        onChange({
                          ...newReceivable,
                          biMonthlyDays: [
                            parseInt(e.target.value, 10),
                            newReceivable.biMonthlyDays?.[1] || 30,
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
                      value={newReceivable.biMonthlyDays?.[1] || 30}
                      onChange={(e) =>
                        onChange({
                          ...newReceivable,
                          biMonthlyDays: [
                            newReceivable.biMonthlyDays?.[0] || 15,
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
              </div>
            )}

            {newReceivable.frequency === "Monthly" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                  Day of Month
                </label>
                <select
                  value={newReceivable.monthlyDay}
                  onChange={(e) =>
                    onChange({
                      ...newReceivable,
                      monthlyDay: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {formatOrdinal(d)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {newReceivable.frequency === "By Date" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  value={newReceivable.date}
                  onChange={(e) => onChange({ ...newReceivable, date: e.target.value })}
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
                  required
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition active:scale-[0.98]"
            >
              <Plus size={16} /> Add Inflow
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
