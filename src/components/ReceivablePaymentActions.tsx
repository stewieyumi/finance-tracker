import React from "react";
import { Edit2 } from "lucide-react";
import { ReceivableViewModel } from "../types/finance";

interface ReceivablePaymentActionsProps {
  rec: ReceivableViewModel;
  onTogglePaymentPopover: (recId: string) => void;
  onEdit: (rec: ReceivableViewModel) => void;
  variant: "mobile" | "desktop";
}

export const ReceivablePaymentActions: React.FC<ReceivablePaymentActionsProps> = ({
  rec,
  onTogglePaymentPopover,
  onEdit,
  variant,
}) => {
  const isMobile = variant === "mobile";

  return (
    <>
      {!rec.collected && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePaymentPopover(rec.id);
            }}
            title={isMobile ? undefined : "Add custom payment"}
            className={
              isMobile
                ? "min-h-10 min-w-10 whitespace-nowrap shrink-0 rounded-lg px-2 chip-emerald text-xs font-semibold"
                : "whitespace-nowrap shrink-0 px-1.5 py-0.5 text-[10px] font-mono chip-emerald rounded transition"
            }
          >
            +₱
          </button>
        </>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(rec);
        }}
        className={
          isMobile
            ? "min-h-10 min-w-10 whitespace-nowrap shrink-0 rounded-lg bg-fill px-2 text-xs text-muted hover:bg-fill-strong hover:text-primary"
            : "whitespace-nowrap shrink-0 px-2 py-1 text-muted hover:text-amber-300 hover:bg-inverse/[0.05] rounded-md text-[11px] flex items-center transition"
        }
      >
        {!isMobile && <Edit2 size={10} className="mr-1" />}
        Edit
      </button>
    </>
  );
};
