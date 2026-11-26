import React, { useId, useRef } from "react";
import { Plus, X } from "lucide-react";
import { ALL_MONTH_YEAR_OPTIONS } from "../constants/config";
import { BillType, CustomWallet } from "../types/finance";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

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
}) => {
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  return <Modal
    isOpen={true}
    onClose={onCancel}
    variant="floating"
    ariaLabel="Add New Commitment"
    manageFocus
    initialFocusRef={nameRef}
  >
    <div className={`${entryDialogStyles.card} max-w-md mx-auto`}>
      <div className={entryDialogStyles.header}>
        <div className="flex items-center gap-3">
          <div className={entryDialogStyles.icon}>
            <Plus size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-strong leading-tight">
              Add New Commitment
            </h3>
            <p className="text-[11px] text-muted font-medium">
              Track a bill, subscription, or installment
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Cancel new commitment"
          onClick={onCancel}
          className={entryDialogStyles.close}
        >
          <X size={16} />
        </button>
      </div>

      <p id={`${formId}-help`} className="mb-4 text-xs text-muted">Adding a commitment sets up what you owe. Money is deducted when you record a payment.</p>
      <form aria-describedby={`${formId}-help`} onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-amount`} className="mb-1.5 block text-[10px] font-semibold uppercase text-faint">Amount (₱)</label>
          <div className="relative"><span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-faint">₱</span>
            <input id={`${formId}-amount`} type="number" inputMode="decimal" step="0.01" value={newBill.amount} onChange={e => setNewBill({ ...newBill, amount: e.target.value })} placeholder="0.00" className={entryDialogStyles.amount} required />
          </div>
        </div>
        <div>
          <label htmlFor={`${formId}-name`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
            Commitment Name
          </label>
          <input id={`${formId}-name`}
            type="text"
            value={newBill.name}
            onChange={(e) =>
              setNewBill({ ...newBill, name: e.target.value })
            }
            ref={nameRef}
            placeholder="e.g. Internet Bill"
            className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${formId}-wallet`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Pay from wallet
            </label>
            <select id={`${formId}-wallet`}
              value={newBill.wallet}
              onChange={(e) =>
                setNewBill({ ...newBill, wallet: e.target.value })
              }
              aria-describedby={`${formId}-wallet-help`}
              className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-primary uppercase font-semibold outline-none focus:border-blue-500"
            >
              {customWallets?.map((cw) => (
                <option key={cw.id} value={cw.id}>
                  {cw.label}
                </option>
              ))}
            </select>
            <p id={`${formId}-wallet-help`} className="mt-1 text-xs text-muted">Choose the wallet you normally use to pay this commitment.</p>
          </div>

          <div>
            <label htmlFor={`${formId}-type`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Type
            </label>
            <select id={`${formId}-type`}
              value={newBill.type}
              onChange={(e) =>
                setNewBill({
                  ...newBill,
                  type: e.target.value as BillType,
                })
              }
              className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
            >
              <option value="Bill">Bill</option>
              <option value="Subscription">Subscription</option>
              <option value="Loan / Installment">
                Loan / Installment
              </option>
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-dueDay`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
              Due day each month
            </label>
            <select id={`${formId}-dueDay`}
              value={newBill.dueDay}
              onChange={(e) =>
                setNewBill({ ...newBill, dueDay: e.target.value })
              }
              className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
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
              <label htmlFor={`${formId}-startMonth`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                Start Month
              </label>
              <select id={`${formId}-startMonth`}
                value={newBill.startMonth}
                onChange={(e) =>
                  setNewBill({
                    ...newBill,
                    startMonth: e.target.value,
                  })
                }
                className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
              >
                {ALL_MONTH_YEAR_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${formId}-endMonth`} className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                End Month
              </label>
              <select id={`${formId}-endMonth`}
                value={newBill.endMonth}
                onChange={(e) =>
                  setNewBill({
                    ...newBill,
                    endMonth: e.target.value,
                  })
                }
                className="min-h-11 w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-blue-500"
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
            className={`${entryDialogStyles.primary} w-full`}
          >
            <Plus size={16} /> Add Commitment
          </button>
        </div>
      </form>
    </div>
  </Modal>;
};
