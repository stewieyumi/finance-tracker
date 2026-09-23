import React from "react";
import { Check, Circle, Edit2 } from "lucide-react";
import { BillViewModel, CustomWallet } from "../types/finance";
import { formatDaysRemaining } from "../utils/dateHelpers";
import { LoanProgressBadge } from "./LoanProgressBadge";

interface BillMobileRowProps {
  bill: BillViewModel;
  customWallets?: CustomWallet[];
  highlightOverdue: boolean;
  onToggleStatus: (bill: BillViewModel) => void;
  onEdit: (bill: BillViewModel) => void;
}

export const BillMobileRow: React.FC<BillMobileRowProps> = ({
  bill,
  customWallets,
  highlightOverdue,
  onToggleStatus,
  onEdit,
}) => (
  <div
    key={bill.id}
    data-testid={`bill-mobile-row-${bill.id}`}
    onClick={() => onEdit(bill)}
    className={`p-3 rounded-xl border transition-all cursor-pointer ${
      bill.paid
        ? "bg-fill-subtle/40 border-strong/60 opacity-40 hover:opacity-60"
        : "bg-surface-sunken border-strong/80 shadow-sm hover:border-inverse/[0.15]"
    } ${
      highlightOverdue &&
      (bill.daysLeft ?? 0) < 0 &&
      !bill.paid
        ? "ring-2 ring-orange-500/50"
        : ""
    }`}
  >
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus(bill);
            }}
            aria-label={bill.paid ? `Mark ${bill.name} as pending` : `Mark ${bill.name} as paid`}
            className="shrink-0 min-w-[44px] min-h-[44px] -ml-2 -my-2 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
          >
            {bill.paid ? (
              <span className="w-5 h-5 rounded-full chip-blue flex items-center justify-center">
                <Check size={11} className="stroke-[3]" />
              </span>
            ) : (
              <span className="w-5 h-5 rounded-full chip-rose flex items-center justify-center">
                <Circle size={7} className="fill-current/40" />
              </span>
            )}
          </button>
          <span className="privacy-blur text-xs font-semibold text-strong truncate">
            {bill.name}
          </span>
          {bill.isOverridden && (
            <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1 rounded shrink-0">
              adj
            </span>
          )}
        </div>

        <span
          className={`font-mono text-xs font-bold shrink-0 ${
            bill.paid ? "text-blue-400" : "text-strong"
          }`}
        >
          ₱
          {bill.amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
          })}
        </span>
      </div>

      <div className="flex items-start justify-between pl-7 text-[10px] text-muted">
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-1.5 py-0.5 rounded font-medium ${
                bill.type === "Subscription"
                  ? "chip-purple"
                  : bill.type === "Loan / Installment"
                    ? "chip-amber"
                    : "chip-blue"
              }`}
            >
              {bill.type}
            </span>

            {bill.wallet && (
              <span className="chip-wallet px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">
                {customWallets?.find((cw) => cw.id === bill.wallet)?.label ||
                  bill.wallet}
              </span>
            )}

            {bill.dueDay && (
              <span className="font-mono">Day {bill.dueDay}</span>
            )}

            {bill.paid ? (
              <span className="px-2 py-0.5 rounded font-semibold tracking-wide chip-emerald">
                Settled
              </span>
            ) : (
              <span
                className={`px-2 py-0.5 rounded font-semibold tracking-wide ${
                  formatDaysRemaining(bill.daysLeft).tone === "urgent"
                    ? "chip-rose animate-pulse"
                    : formatDaysRemaining(bill.daysLeft).tone === "overdue"
                      ? "chip-rose"
                      : formatDaysRemaining(bill.daysLeft).tone === "warning"
                        ? "chip-amber"
                        : "chip-neutral"
                }`}
              >
                {formatDaysRemaining(bill.daysLeft).text}
              </span>
            )}
          </div>

          {bill.type === "Loan / Installment" && (
            <div className="mt-1">
              <LoanProgressBadge
                startMonth={bill.startMonth}
                endMonth={bill.endMonth}
                targetMonthForDue={bill.targetMonthForDue}
                isPaid={bill.paid}
                monthlyAmount={bill.baseAmount}
                totalPaid={bill.totalLoanPaid}
                paidInstallments={bill.paidLoanInstallments}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(bill);
          }}
          className="px-2 py-0.5 text-muted hover:text-amber-300 bg-fill-strong/70 hover:bg-fill-strong border border-strong/40 rounded-md transition flex items-center gap-1 text-[10px] shrink-0 mt-1"
        >
          <Edit2 size={9} />
          <span>Edit</span>
        </button>
      </div>
    </div>
  </div>
);
