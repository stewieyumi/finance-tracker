import React from "react";
import { Bill, BillViewModel } from "../types/finance";

type PendingPriorPayment = {
  bill: Bill;
  month: string;
};

interface BillPriorPaymentModalProps {
  pendingPriorPayment: PendingPriorPayment;
  setPendingPriorPayment: React.Dispatch<React.SetStateAction<PendingPriorPayment | null>>;
  onToggleStatus: (bill: BillViewModel, paid: boolean) => void;
}

export const BillPriorPaymentModal: React.FC<BillPriorPaymentModalProps> = ({
  pendingPriorPayment,
  setPendingPriorPayment,
  onToggleStatus,
}) => {
  return (
    <div className="fixed inset-0 z-[250] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-surface-elevated border border-border-default rounded-3xl p-6 w-full max-w-sm shadow-[0_0_60px_rgba(0,0,0,0.8)] space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-strong leading-tight">Was this payment already made?</h3>
          <p className="text-[11px] text-muted">
            {pendingPriorPayment.bill.name} starts in {pendingPriorPayment.month}. This marks the bill as already paid for this month without changing your wallet balance.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setPendingPriorPayment(null)}
            className="flex-1 py-2.5 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl text-secondary transition"
          >
            Leave Unpaid
          </button>
          <button
            onClick={() => {
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
    </div>
  );
};
