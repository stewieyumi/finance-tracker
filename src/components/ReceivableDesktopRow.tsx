import React from "react";
import { Calendar, Check, CreditCard, Hourglass, X } from "lucide-react";
import { ReceivableViewModel } from "../types/finance";
import { formatOrdinal, formatShortDate } from "../utils/displayHelpers";
import { ReceivablePaymentActions } from "./ReceivablePaymentActions";

interface ReceivableDesktopRowProps {
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

export const ReceivableDesktopRow: React.FC<ReceivableDesktopRowProps> = ({
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
    <tr
      className={`group transition-all duration-150 ${
        rec.collected ? "opacity-45" : "hover:bg-inverse/[0.02]"
      }`}
    >
      <td className="py-3 px-4 whitespace-nowrap">
        <button
          onClick={() => onToggleStatus(rec)}
          className="flex items-center gap-1.5 focus:outline-none"
        >
          {rec.collected ? (
            <span className="flex items-center justify-center gap-1 w-[82px] text-[10px] font-semibold chip-emerald px-2 py-0.5 rounded-lg">
              <Check size={10} className="stroke-[3]" /> Received
            </span>
          ) : isPartial ? (
            <span className="flex items-center justify-center gap-1 w-[82px] text-[10px] font-semibold chip-cyan px-2 py-0.5 rounded-lg">
              <CreditCard size={9} /> Partial
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1 w-[82px] text-[10px] font-medium chip-amber px-2 py-0.5 rounded-lg">
              <Hourglass size={8} /> Pending
            </span>
          )}
        </button>
      </td>

      <td className="py-3 px-4 text-primary font-medium">
        <button
          type="button"
          onClick={() => onToggleStatus(rec)}
          className="privacy-blur text-left hover:text-emerald-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
        >
          {rec.name}
        </button>
      </td>

      <td
        className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${
          rec.collected ? "text-emerald-400" : "text-strong"
        }`}
      >
        <div>
          <div>
            ₱
            {rec.amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </div>
          {isBiMonthly && (
            <div className="text-[9px] text-faint font-mono font-normal">
              ₱{(rec.amount / 2).toLocaleString()}/payout
            </div>
          )}
          {isPartial && (
            <div className="text-[9px] text-cyan-400 font-mono">
              +₱{received.toLocaleString()} rec'd
            </div>
          )}
        </div>
      </td>

      <td className="py-3 px-4 text-center whitespace-nowrap">
        <div className="flex flex-col items-center gap-1">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
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
        </div>
      </td>

      <td className="py-3 px-4 text-center">
        <div className="text-secondary text-xs min-w-0 break-words leading-tight">
          {rec.frequency === "Bi-monthly" && (
            <span className="text-secondary font-medium text-[11px]">
              Bi-Monthly (
              {rec.biMonthlyDays && rec.biMonthlyDays.length > 0
                ? rec.biMonthlyDays.map(formatOrdinal).join(" & ")
                : "15th & 30th"}
              )
            </span>
          )}
          {rec.frequency === "Monthly" && (
            <span className="text-muted text-[11px]">
              Monthly • Day {rec.monthlyDay || 15}
            </span>
          )}
          {rec.frequency === "By Date" &&
            (rec.date ? (
              <span className="inline-flex items-center gap-1 text-secondary font-mono text-[11px]">
                <Calendar size={10} className="text-faint" />
                {formatShortDate(rec.date)}
              </span>
            ) : (
              <span className="text-disabled">—</span>
            ))}
        </div>
      </td>

      <td className="py-3 px-4 text-right relative min-w-[150px]">
        <div className="flex flex-nowrap items-center gap-1 justify-end whitespace-nowrap">
          <ReceivablePaymentActions
            rec={rec}
            isBiMonthly={isBiMonthly}
            onQuickAddHalf={onQuickAddHalf}
            onTogglePaymentPopover={onTogglePaymentPopover}
            onEdit={onEdit}
            variant="desktop"
          />
        </div>

        {payPopoverId === rec.id && (
          <div className="absolute right-3 top-9 z-20 bg-surface-elevated border border-border-default rounded-xl p-2 shadow-2xl flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              placeholder="+₱"
              value={customPayAmount}
              onChange={(e) => onCustomPayAmountChange(e.target.value)}
              className="w-20 bg-surface-input border border-strong rounded px-1.5 py-0.5 text-xs text-strong font-mono outline-none text-right"
            />
            <button
              onClick={() => onCustomPaySubmit(rec)}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-medium"
            >
              Add
            </button>
            <button
              onClick={onClosePaymentPopover}
              className="p-1 text-muted hover:text-strong"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};
