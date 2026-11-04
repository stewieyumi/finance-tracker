import React, { useState } from "react";
import { getMonthRange, parseMonthKey } from "../utils/dateHelpers";
import { Bill, BillViewModel } from "../types/finance";
import { Modal } from "./ui/Modal";

type PendingPriorPayment = {
  bill: Bill;
  month: string;
};

interface BillPriorPaymentModalProps {
  pendingPriorPayment: PendingPriorPayment;
  setPendingPriorPayment: React.Dispatch<React.SetStateAction<PendingPriorPayment | null>>;
  onConfirmPriorBillPayments?: (billId: string, months: string[]) => void;
  onToggleStatus: (bill: BillViewModel, paid: boolean) => void;
}

export const BillPriorPaymentModal: React.FC<BillPriorPaymentModalProps> = ({
  pendingPriorPayment,
  setPendingPriorPayment,
  onToggleStatus,
  onConfirmPriorBillPayments,
}) => {
  const { bill, month } = pendingPriorPayment;
  const months = getMonthRange(bill.startMonth || month, month).filter(candidate =>
    !bill.endMonth || parseMonthKey(candidate) <= parseMonthKey(bill.endMonth)
  );
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Modal
      isOpen={true}
      onClose={() => setPendingPriorPayment(null)}
      variant="floating"
      closeOnBackdropClick={false}
      ariaLabel="Confirm Prior Payment"
    >
      <div className="bg-surface-elevated border border-border-default rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-strong leading-tight">Was this payment already made?</h3>
          <p className="text-[11px] text-muted">
            {bill.name} starts in {bill.startMonth || month}. Select only installments you know were already paid. Your wallet balances stay the same.
          </p>
        </div>

        {onConfirmPriorBillPayments && (
          <fieldset className="max-h-52 space-y-2 overflow-y-auto">
            <legend className="text-xs font-semibold">Installments already paid</legend>
            {months.map(candidate => (
              <label key={candidate} className="flex items-center gap-2 py-1 text-xs">
                <input type="checkbox" checked={selected.includes(candidate)} onChange={event => {
                  const checked = event.target.checked;
                  setSelected(previous => checked ? [...previous, candidate] : previous.filter(value => value !== candidate));
                }} />
                {candidate}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setPendingPriorPayment(null)}
            className="flex-1 py-2.5 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl text-secondary transition"
          >
            Leave Unpaid
          </button>
          <button
            disabled={!!onConfirmPriorBillPayments && selected.length === 0}
            onClick={() => {
              if (onConfirmPriorBillPayments) {
                onConfirmPriorBillPayments(bill.id, selected);
                setPendingPriorPayment(null);
                return;
              }
              const billView: BillViewModel = {
                ...pendingPriorPayment.bill,
                baseAmount: pendingPriorPayment.bill.amount,
                paid: false,
                targetMonthForDue: pendingPriorPayment.month,
                daysLeft: 0,
                isOverridden: false
              };
              onToggleStatus(billView, true);
              setPendingPriorPayment(null);
            }}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-xl text-white shadow-lg shadow-blue-900/20 transition"
          >
            Mark as Paid
          </button>
        </div>
      </div>
    </Modal>
  );
};
