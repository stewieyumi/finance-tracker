import React from "react";
import { Edit2 } from "lucide-react";
import { ReceivableViewModel } from "../types/finance";

interface ReceivablePaymentActionsProps {
  rec: ReceivableViewModel;
  isBiMonthly: boolean;
  onQuickAddHalf: (rec: ReceivableViewModel) => void;
  onTogglePaymentPopover: (recId: string) => void;
  onEdit: (rec: ReceivableViewModel) => void;
  variant: "mobile" | "desktop";
}

export const ReceivablePaymentActions: React.FC<ReceivablePaymentActionsProps> = ({
  rec,
  isBiMonthly,
  onQuickAddHalf,
  onTogglePaymentPopover,
  onEdit,
  variant,
}) => {
  const isMobile = variant === "mobile";

  return (
    <>
      {!rec.collected && (
        <>
          {isBiMonthly && (
            <button
              onClick={() => onQuickAddHalf(rec)}
              title={isMobile ? undefined : "Add 1st/2nd half payment"}
              className={
                isMobile
                  ? "whitespace-nowrap shrink-0 px-1.5 py-0.5 chip-cyan rounded text-[9px] font-medium"
                  : "whitespace-nowrap shrink-0 px-1.5 py-0.5 text-[9px] font-mono chip-cyan rounded transition"
              }
            >
              +1/2
            </button>
          )}

          <button
            onClick={() => onTogglePaymentPopover(rec.id)}
            title={isMobile ? undefined : "Add custom payment"}
            className={
              isMobile
                ? "whitespace-nowrap shrink-0 px-1.5 py-0.5 chip-emerald rounded text-[9px] font-medium"
                : "whitespace-nowrap shrink-0 px-1.5 py-0.5 text-[10px] font-mono chip-emerald rounded transition"
            }
          >
            +₱
          </button>
        </>
      )}

      <button
        onClick={() => onEdit(rec)}
        className={
          isMobile
            ? "whitespace-nowrap shrink-0 px-2 py-0.5 text-muted hover:text-amber-300 bg-fill-strong/70 rounded text-[10px]"
            : "whitespace-nowrap shrink-0 px-2 py-1 text-muted hover:text-amber-300 hover:bg-inverse/[0.05] rounded-md text-[11px] flex items-center transition"
        }
      >
        {!isMobile && <Edit2 size={10} className="mr-1" />}
        Edit
      </button>
    </>
  );
};
