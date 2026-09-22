import React, { useEffect, useRef } from "react";
import { X, Plus, Receipt, Calendar, ArrowDownLeft, Clapperboard, Wallet } from "lucide-react";

export type QuickAddAction = "expense" | "bill" | "inflow" | "gig" | "wallet";

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: QuickAddAction) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSelectAction
}) => {
  const modalBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions: { id: QuickAddAction; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    {
      id: "expense",
      label: "Scan / Add Expense",
      desc: "Receipt scan or manual expense entry",
      icon: <Receipt size={16} className="text-rose-400" />,
      color: "border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/5"
    },
    {
      id: "bill",
      label: "Add Bill or Commitment",
      desc: "Recurring bill, subscription, or installment",
      icon: <Calendar size={16} className="text-blue-400" />,
      color: "border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/5"
    },
    {
      id: "inflow",
      label: "Add Inflow / Receivable",
      desc: "Expected payment, salary, or collection",
      icon: <ArrowDownLeft size={16} className="text-emerald-400" />,
      color: "border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
    },
    {
      id: "gig",
      label: "Add Freelance Gig / Shoot",
      desc: "Project tracking and shoot earnings",
      icon: <Clapperboard size={16} className="text-purple-400" />,
      color: "border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/5"
    },
    {
      id: "wallet",
      label: "Manage Accounts & Wallets",
      desc: "Update balances, accounts, and targets",
      icon: <Wallet size={16} className="text-amber-400" />,
      color: "border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/5"
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Add Menu"
      onClick={(e) => {
        if (modalBoxRef.current && !modalBoxRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        ref={modalBoxRef}
        className="bg-surface-modal border border-inverse/[0.1] rounded-3xl p-5 sm:p-6 w-full max-w-sm space-y-4 shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between pb-2 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Plus size={14} className="text-blue-400" />
            </div>
            <h3 className="text-sm font-bold text-strong">Quick Add</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close quick add menu"
            className="text-faint hover:text-strong p-1 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {actions.map((act) => (
            <button
              key={act.id}
              onClick={() => {
                onSelectAction(act.id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl bg-surface border transition-all text-left group active:scale-[0.99] ${act.color}`}
            >
              <div className="p-2 rounded-xl bg-surface-elevated shrink-0 border border-inverse/[0.06]">
                {act.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-strong group-hover:text-primary">
                  {act.label}
                </div>
                <div className="text-[10px] text-faint truncate">
                  {act.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
