import React, { useRef } from "react";
import { Edit2, Plus, Save, Trash2, X, ChevronDown } from "lucide-react";
import {
  EditFormData,
  ReceivableCategory,
  ReceivableFrequency,
  CustomWallet,
  Deduction,
  DeductionType,
} from "../types/finance";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { getMonthKey } from "../utils/dateHelpers";
import { formatOrdinal } from "../utils/displayHelpers";
import {
  calculateDeductionAmount,
  calculateNetSalary,
} from "../utils/financeHelpers";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

interface ReceivableEditModalProps {
  editingId: string;
  editForm: EditFormData;
  categoriesList: string[];
  allWallets: CustomWallet[];
  onChange: React.Dispatch<React.SetStateAction<EditFormData>>;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  selectedMonth?: string;
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
  selectedMonth,
}) => {
  const amountRef = useRef<HTMLInputElement>(null);
  const currentGross =
    editForm.grossAmount !== undefined
      ? editForm.grossAmount
      : (editForm.amount ?? 0);

  const currentDeductions: Deduction[] = (editForm.deductions ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    value: Number(d.value) || 0,
  }));

  const totalDeductions = Math.min(
    currentGross,
    currentDeductions.reduce(
      (sum, d) => sum + calculateDeductionAmount(currentGross, d),
      0
    )
  );

  const netAmount = calculateNetSalary(currentGross, currentDeductions);

  const handleGrossChange = (valStr: string) => {
    const amountUnspecified = !valStr.trim();
    const parsed = amountUnspecified ? 0 : parseFloat(valStr);
    const nextGross = isNaN(parsed) ? 0 : Math.max(0, parsed);
    const nextNet = calculateNetSalary(nextGross, currentDeductions);
    onChange({
      ...editForm,
      amountUnspecified: amountUnspecified || undefined,
      grossAmount: nextGross,
      deductions: currentDeductions,
      amount: nextNet,
    });
  };

  const handleAddDeduction = () => {
    const newDeduction: Deduction = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `deduction-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: "",
      type: "fixed",
      value: 0,
    };
    const nextDeductions = [...currentDeductions, newDeduction];
    const nextNet = calculateNetSalary(currentGross, nextDeductions);
    onChange({
      ...editForm,
      grossAmount: currentGross,
      deductions: nextDeductions,
      amount: nextNet,
    });
  };

  const handleUpdateDeduction = (id: string, updates: Partial<Deduction>) => {
    const nextDeductions = currentDeductions.map((d) =>
      d.id === id ? { ...d, ...updates } : d
    );
    const nextNet = calculateNetSalary(currentGross, nextDeductions);
    onChange({
      ...editForm,
      grossAmount: currentGross,
      deductions: nextDeductions,
      amount: nextNet,
    });
  };

  const handleRemoveDeduction = (id: string) => {
    const nextDeductions = currentDeductions.filter((d) => d.id !== id);
    const nextNet = calculateNetSalary(currentGross, nextDeductions);
    onChange({
      ...editForm,
      grossAmount: currentGross,
      deductions: nextDeductions,
      amount: nextNet,
    });
  };

  const handleSave = () => {
    onSave();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      variant="floating"
      ariaLabel="Edit Inflow"
      manageFocus
      initialFocusRef={amountRef}
    >
      <div className={`${entryDialogStyles.card} max-w-md mx-auto`}>
        <div className={entryDialogStyles.header}>
          <div className="flex items-center gap-3">
            <div className={entryDialogStyles.icon}>
              <Edit2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-strong leading-tight">Edit Inflow</h3>
              <p className="text-[11px] text-muted font-medium">{editForm.name}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cancel inflow edit"
            onClick={onCancel}
            className={entryDialogStyles.close}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
            <div>
              <label
                htmlFor="gross-amount-input"
                className="text-[10px] text-faint uppercase font-semibold mb-1.5 block"
              >
                {editForm.frequency === "Bi-monthly" ? "Gross Monthly Amount (₱)" : "Gross Amount (₱)"}
              </label>
              <div className="relative"><span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-faint">₱</span>
              <input
                ref={amountRef}
                id="gross-amount-input"
                aria-label="Gross Amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={editForm.amountUnspecified ? "" : editForm.grossAmount !== undefined ? editForm.grossAmount : (editForm.amount ?? "")}
                onChange={(e) => handleGrossChange(e.target.value)}
                placeholder="—"
                className={entryDialogStyles.amount}
              /></div>
            </div>

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

          {/* GROSS & DEDUCTIONS SECTION */}
          <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 space-y-4">
            <details className="group rounded-xl border border-subtle bg-surface-low p-3">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
                <span>Deductions ({currentDeductions.length})</span>
                <span className="flex min-w-0 items-center gap-2"><span className="privacy-blur break-all font-mono text-muted">{editForm.amountUnspecified ? "—" : `-₱${totalDeductions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span><ChevronDown size={14} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" /></span>
              </summary>
              <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Optional adjustments</span>
                <button
                  type="button"
                  onClick={handleAddDeduction}
                  className="flex items-center gap-1 text-[11px] font-semibold text-positive hover:text-strong transition"
                >
                  <Plus size={12} /> Add Deduction
                </button>
              </div>

              {currentDeductions.length === 0 ? (
                <div className="text-[11px] text-faint py-2.5 px-3 rounded-xl bg-surface-lowest border border-inverse/[0.05]">
                  No deductions configured. Net equals gross.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentDeductions.map((deduction) => (
                    <div
                      key={deduction.id}
                      data-testid={`deduction-row-${deduction.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-[375px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] bg-surface-lowest p-2 rounded-xl border border-inverse/[0.05] sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto]"
                    >
                      <input
                        type="text"
                        placeholder="Deduction Name (e.g. Tax)"
                        value={deduction.name}
                        onChange={(e) =>
                          handleUpdateDeduction(deduction.id, {
                            name: e.target.value,
                          })
                        }
                        aria-label="Deduction name"
                        className="col-span-2 min-w-0 bg-surface-input min-[375px]:col-span-3 sm:col-span-1 border border-strong rounded-lg px-2.5 py-1.5 text-xs text-strong outline-none focus:border-emerald-500"
                      />
                      <select
                        value={deduction.type}
                        onChange={(e) =>
                          handleUpdateDeduction(deduction.id, {
                            type: e.target.value as DeductionType,
                          })
                        }
                        aria-label="Deduction type"
                        className="col-span-2 min-w-0 w-full bg-surface-input border border-strong rounded-lg px-2 py-1.5 text-xs text-strong outline-none focus:border-emerald-500 cursor-pointer min-[375px]:col-span-1"
                      >
                        <option value="fixed">Fixed ₱</option>
                        <option value="percentage">Percent</option>
                      </select>
                      <div className="min-w-0">
                        <input
                          type="number"
                          min="0"
                          step={deduction.type === "percentage" ? "0.1" : "0.01"}
                          placeholder="0"
                          value={deduction.value}
                          onChange={(e) =>
                            handleUpdateDeduction(deduction.id, {
                              value: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          aria-label="Deduction value"
                          className="w-full bg-surface-input border border-strong rounded-lg px-2 py-1.5 text-xs text-strong font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDeduction(deduction.id)}
                        aria-label={`Remove ${deduction.name || "deduction"}`}
                        className="text-faint hover:text-rose-400 p-1.5 rounded-lg transition"
                        title="Remove deduction"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </details>

            {/* Live calculation display */}
            <div className="pt-2 border-t border-inverse/[0.05]">
              <div className="bg-surface-lowest border border-inverse/[0.05] rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-faint uppercase font-semibold">
                    Gross
                  </div>
                  <div
                    data-testid="receivable-gross-display"
                    className="text-xs font-mono font-bold text-strong mt-0.5"
                  >
                    {editForm.amountUnspecified ? "—" : `₱${currentGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-faint uppercase font-semibold">
                    Total Deductions
                  </div>
                  <div
                    data-testid="receivable-deductions-display"
                    className="text-xs font-mono font-bold text-negative mt-0.5"
                  >
                    {editForm.amountUnspecified ? "—" : `-₱${totalDeductions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-positive uppercase font-bold">
                    Net Expected / Usable
                  </div>
                  <div
                    data-testid="receivable-net-display"
                    className="text-xs font-mono font-bold text-positive mt-0.5"
                  >
                    {editForm.amountUnspecified ? "—" : `₱${netAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Category
              </label>
              <select
                aria-label="Category"
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
                aria-label="Destination Wallet"
                value={editForm.wallet || allWallets[0]?.id || "main"}
                onChange={(e) =>
                  onChange({ ...editForm, wallet: e.target.value })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-primary uppercase font-semibold outline-none focus:border-emerald-500"
              >
                {allWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
                {editForm.wallet && !allWallets.some(w => w.id === editForm.wallet) && (
                  <option key={editForm.wallet} value={editForm.wallet} disabled>
                    {editForm.wallet} (Archived / Inactive)
                  </option>
                )}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Frequency
              </label>
              <select
                aria-label="Frequency"
                value={editForm.frequency || "By Date"}
                onChange={(e) =>
                  onChange({
                    ...editForm,
                    frequency: e.target.value as ReceivableFrequency,
                    ...(e.target.value === "No Specific Date" ? { startMonth: editForm.startMonth || selectedMonth || getMonthKey(new Date()) } : {}),
                  })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500"
              >
                <option value="By Date">Specific Date</option>
                <option value="No Specific Date">One-time — No Specific Date</option>
                <option value="Monthly">Monthly</option>
                <option value="Bi-monthly">Bi-Monthly</option>
              </select>
            </div>

            {editForm.frequency === "No Specific Date" && (
              <div>
                <label className="text-xs text-muted" htmlFor="inflow-start-month">Start month</label>
                <select id="inflow-start-month" value={editForm.startMonth || ""} onChange={e => onChange({ ...editForm, startMonth: e.target.value })} className="mt-1 w-full rounded-xl border border-strong bg-surface-input px-3 py-2.5 text-xs text-primary">
                  <option value="">Choose a start month</option>
                  {editForm.startMonth && !ALL_MONTH_YEAR_OPTIONS.includes(editForm.startMonth) && <option value={editForm.startMonth}>{editForm.startMonth}</option>}
                  {ALL_MONTH_YEAR_OPTIONS.map(month => <option key={month} value={month}>{month}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">One payment, no due date. The start month is locked after receipt history is recorded.</p>
              </div>
            )}

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
              onClick={handleSave}
              className={`${entryDialogStyles.primary} flex-1`}
            >
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
