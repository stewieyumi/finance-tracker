import React from "react";
import { Check, Hourglass, X } from "lucide-react";
import { ReceivableViewModel } from "../types/finance";
import { formatOrdinal, formatShortDate } from "../utils/displayHelpers";
import { ReceivablePaymentActions } from "./ReceivablePaymentActions";

interface ReceivableMobileRowProps {
  rec: ReceivableViewModel;
  walletLabel?: string;
  customPayAmount: string;
  payPopoverId: string | null;
  onToggleStatus: (rec: ReceivableViewModel) => void;
  onQuickAddHalf: (rec: ReceivableViewModel) => void;
  onTogglePaymentPopover: (id: string) => void;
  onEdit: (rec: ReceivableViewModel) => void;
  onCustomPayAmountChange: (value: string) => void;
  onCustomPaySubmit: (rec: ReceivableViewModel) => void;
  onClosePaymentPopover: () => void;
}

export const ReceivableMobileRow: React.FC<ReceivableMobileRowProps> = ({
  rec,
  walletLabel,
  customPayAmount,
  payPopoverId,
  onToggleStatus,
  onQuickAddHalf,
  onTogglePaymentPopover,
  onEdit,
  onCustomPayAmountChange,
  onCustomPaySubmit,
  onClosePaymentPopover,
}) => {
  const isBiMonthly = rec.frequency === "Bi-monthly";
  const received = rec.amountReceived || 0;
  const isPartial = !rec.collected && received > 0;

  return (
    <div
      key={rec.id}
      data-testid={`receivable-mobile-row-${rec.id}`}
      onClick={() => onEdit(rec)}
      className={`p-3 rounded-xl border transition-all cursor-pointer ${
        rec.collected
          ? "bg-fill-subtle/40 border-strong/60 opacity-50 hover:opacity-75"
          : "bg-surface-sunken border-strong/80 shadow-sm hover:border-inverse/[0.15]"
      }`}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus(rec);
              }}
              aria-label={
                rec.collected
                  ? `Undo received payment for ${rec.name}`
                  : `Mark ${rec.name} as received`
              }
              className="shrink-0 min-w-[44px] min-h-[44px] -ml-2 -my-2 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-full"
            >
              {rec.collected ? (
                <span className="w-5 h-5 rounded-full chip-emerald flex items-center justify-center">
                  <Check size={11} className="stroke-[3]" />
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full chip-amber flex items-center justify-center">
                  <Hourglass size={9} />
                </span>
              )}
            </button>

            <span className="privacy-blur text-xs font-semibold text-strong truncate">
              {rec.name}
            </span>
          </div>

          <div className="text-right shrink-0">
            <span
              className={`font-mono text-xs font-bold ${
                rec.collected ? "text-emerald-400" : "text-strong"
              }`}
            >
              ₱
              {rec.amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </span>

            {isPartial ? (
              <div className="space-y-0.5 mt-0.5">
                <div className="text-[10px] text-emerald-400 font-mono font-medium">
                  ₱{received.toLocaleString("en-US", { minimumFractionDigits: 2 })} received
                </div>
                <div className="text-[9px] text-muted font-mono">
                  ₱{(rec.amount - received).toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining
                </div>
              </div>
            ) : (
              !rec.collected && isBiMonthly && (
                <div className="text-[9px] text-faint font-mono">
                  (₱{(rec.amount / 2).toLocaleString()}/payout)
                </div>
              )
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 pl-6 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-1.5 py-0.5 rounded font-medium ${
                rec.category === "Salary"
                  ? "chip-cyan"
                  : rec.category === "Shoot"
                    ? "chip-amber"
                    : rec.category === "Edit"
                      ? "chip-purple"
                      : "chip-neutral"
              }`}
            >
              {rec.category || "Other"}
            </span>

            {rec.wallet && (
              <span className="chip-wallet px-1.5 py-0.5 rounded font-semibold tracking-wider text-[9px] uppercase">
                {walletLabel || rec.wallet}
              </span>
            )}

            {isBiMonthly && (
              <span>
                Bi-Monthly (
                {rec.biMonthlyDays && rec.biMonthlyDays.length > 0
                  ? rec.biMonthlyDays.map(formatOrdinal).join(" &")
                  : "15th & 30th"}
                )
              </span>
            )}

            {rec.frequency === "Monthly" && (
              <span>Day {rec.monthlyDay || 15}</span>
            )}

            {rec.frequency === "By Date" && rec.date && (
              <span>{formatShortDate(rec.date)}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <ReceivablePaymentActions
              rec={rec}
              isBiMonthly={isBiMonthly}
              onQuickAddHalf={onQuickAddHalf}
              onTogglePaymentPopover={onTogglePaymentPopover}
              onEdit={onEdit}
              variant="mobile"
            />
          </div>
        </div>

        {payPopoverId === rec.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2 pt-2 border-t border-strong/60 flex items-center gap-1.5"
          >
            <input
              type="number"
              inputMode="decimal"
              placeholder="₱ Amount"
              value={customPayAmount}
              onChange={(e) => onCustomPayAmountChange(e.target.value)}
              className="w-24 bg-surface-input border border-strong rounded px-2 py-1 text-xs text-strong font-mono outline-none"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCustomPaySubmit(rec);
              }}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
            >
              Add
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClosePaymentPopover();
              }}
              className="p-1 text-muted hover:text-strong"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
