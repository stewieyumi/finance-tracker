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

  return (
    <div
      className={`p-3 rounded-xl border transition-all ${
        rec.collected
          ? "bg-fill-subtle/40 border-strong/60 opacity-50"
          : "bg-surface-sunken border-strong/80 shadow-sm"
      }`}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onToggleStatus(rec)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1.5 py-1 -mx-1.5 text-left transition-colors hover:bg-inverse/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 group"
            aria-label={
              rec.collected
                ? `Undo received payment for ${rec.name}`
                : `Mark ${rec.name} as received`
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0">
                {rec.collected ? (
                  <span className="w-4 h-4 rounded-full chip-emerald flex items-center justify-center">
                    <Check size={9} className="stroke-[3]" />
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full chip-amber flex items-center justify-center">
                    <Hourglass size={8} />
                  </span>
                )}
              </div>

              <span className="privacy-blur text-xs font-semibold text-strong truncate group-hover:text-emerald-400 transition-colors">
                {rec.name}
              </span>
            </div>

            <div className="text-right">
              <span
                className={`font-mono text-xs font-bold shrink-0 ${
                  rec.collected ? "text-emerald-400" : "text-strong"
                }`}
              >
                ₱
                {rec.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>

              {!rec.collected && isBiMonthly && (
                <div className="text-[9px] text-faint font-mono">
                  (₱{(rec.amount / 2).toLocaleString()}/payout)
                </div>
              )}

              {!rec.collected && received > 0 && (
                <div className="text-[9px] text-cyan-400 font-mono">
                  +₱{received.toLocaleString("en-US")} rec'd
                </div>
              )}
            </div>
          </button>
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
          <div className="mt-2 pt-2 border-t border-strong/60 flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              placeholder="₱ Amount"
              value={customPayAmount}
              onChange={(e) => onCustomPayAmountChange(e.target.value)}
              className="w-24 bg-surface-input border border-strong rounded px-2 py-1 text-xs text-strong font-mono outline-none"
            />
            <button
              onClick={() => onCustomPaySubmit(rec)}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
            >
              Add
            </button>
            <button
              onClick={onClosePaymentPopover}
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
