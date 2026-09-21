import React from "react";
import { Plus, X } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { BillType, CustomWallet } from "../types/finance";

interface NewBillForm {
  name: string;
  amount: string;
  dueDay: string;
  type: BillType;
  startMonth: string;
  endMonth: string;
  wallet: string;
}

interface BillAddModalProps {
  newBill: NewBillForm;
  setNewBill: React.Dispatch<React.SetStateAction<NewBillForm>>;
  customWallets?: CustomWallet[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export const BillAddModal: React.FC<BillAddModalProps> = ({
  newBill,
  setNewBill,
  customWallets,
  onSubmit,
  onCancel,
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
          <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Plus size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-strong leading-tight">
              Add New Commitment
            </h3>
            <p className="text-[11px] text-muted font-medium">
              Add a recurring bill or loan
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
            Commitment Name
          </label>
          <input
            type="text"
            value={newBill.name}
            onChange={(e) =>
              setNewBill({ ...newBill, name: e.target.value })
            }
            autoFocus
            placeholder="e.g. Internet Bill"
            className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
            required
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
              value={newBill.amount}
              onChange={(e) =>
                setNewBill({ ...newBill, amount: e.target.value })
              }
              placeholder="0.00"
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-strong outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Wallet Route
            </label>
            <select
              value={newBill.wallet}
              onChange={(e) =>
                setNewBill({ ...newBill, wallet: e.target.value })
              }
              className="w-full bg-surface-inputborder border-strong rounded-xl px-3 py-2.5 text-xs text-blue-300 uppercase font-semibold outline-none focus:border-blue-500"
            >
              {customWallets?.map((cw) => (
                <option key={cw.id} value={cw.id}>
                  {cw.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Type
            </label>
            <select
              value={newBill.type}
              onChange={(e) =>
                setNewBill({
                  ...newBill,
                  type: e.target.value as BillType,
                })
              }
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
            >
              <option value="Bill">Bill</option>
              <option value="Subscription">Subscription</option>
              <option value="Loan / Installment">
                Loan / Installment
              </option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Due Date
            </label>
            <select
              value={newBill.dueDay}
              onChange={(e) =>
                setNewBill({ ...newBill, dueDay: e.target.value })
              }
              className="w-full bg-surface-inputborder border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>
                  Day {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {newBill.type === "Loan / Installment" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Start Month
              </label>
              <select
                value={newBill.startMonth}
                onChange={(e) =>
                  setNewBill({
                    ...newBill,
                    startMonth: e.target.value,
                  })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
              >
                {ALL_MONTH_YEAR_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                End Month
              </label>
              <select
                value={newBill.endMonth}
                onChange={(e) =>
                  setNewBill({
                    ...newBill,
                    endMonth: e.target.value,
                  })
                }
                className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
              >
                {ALL_MONTH_YEAR_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-4 border-t border-inverse/[0.04]">
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition active:scale-[0.98]"
          >
            <Plus size={16} /> Add Commitment
          </button>
        </div>
      </form>
    </div>
  </div>
);
