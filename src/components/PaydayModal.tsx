import React, { useEffect, useRef } from "react";
import { X, Banknote, Settings, CheckCircle2, ArrowRight } from "lucide-react";
import { PaydayExecution, CustomWallet } from "../types/finance";

interface PaydayModalProps {
  isOpen: boolean;
  onClose: () => void;
  paydayDays?: number[];
  paydayAllocations: Record<string, number>;
  remainingBuffer: number;
  walletLabels?: Record<string, string>;
  customWallets?: CustomWallet[];
  onConfigureBaselines: () => void;
  onExecutePaydaySplit: () => void;
  disabled?: boolean;
  latestExecution?: PaydayExecution;
  onUndoSplit?: (id: string) => void;
}

export const PaydayModal: React.FC<PaydayModalProps> = ({
  isOpen,
  onClose,
  paydayDays,
  paydayAllocations,
  remainingBuffer,
  walletLabels,
  customWallets,
  onConfigureBaselines,
  onExecutePaydaySplit,
  disabled = false,
  latestExecution,
  onUndoSplit
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

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });
  const pdDays = paydayDays?.length ? paydayDays : [15, 30];
  const formatOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const titleText = `Payday Flow (${pdDays.map(formatOrdinal).join(" & ")})`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payday Distribution Modal"
      onClick={(e) => {
        if (modalBoxRef.current && !modalBoxRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        ref={modalBoxRef}
        className="bg-surface-modal border border-inverse/[0.1] rounded-3xl p-5 sm:p-6 w-full max-w-md space-y-4 shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between pb-3 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2">
            <Banknote size={16} className="text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
              {titleText}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                onClose();
                onConfigureBaselines();
              }}
              className="text-faint hover:text-amber-400 p-1.5 rounded-lg transition"
              title="Configure Baselines & Routing"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close payday modal"
              className="text-faint hover:text-strong p-1.5 rounded-lg transition"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="text-muted text-[11px] font-medium mb-1">
            Planned wallet allocations for this payout:
          </div>

          <div className="space-y-1.5 bg-surface-low border border-inverse/[0.05] rounded-2xl p-3.5">
            {Object.entries(paydayAllocations)
              .filter(([_, amount]) => amount > 0)
              .map(([walletKey, amount]) => (
                <div key={walletKey} className="flex items-center justify-between py-1 border-b border-inverse/[0.03] last:border-0">
                  <span className="privacy-blur text-muted">
                    {customWallets?.find(w => w.id === walletKey)?.label ||
                      walletLabels?.[walletKey] ||
                      walletKey.charAt(0).toUpperCase() + walletKey.slice(1)}
                  </span>
                  <span className="font-mono font-semibold text-primary">₱{fmt(amount)}</span>
                </div>
              ))}

            <div className="flex items-center justify-between pt-2 mt-1 border-t border-inverse/[0.06] text-emerald-400 font-medium">
              <span className="no-privacy-blur">Remaining Buffer</span>
              <span className="font-mono font-bold">₱{fmt(remainingBuffer)}</span>
            </div>
          </div>
        </div>

        {latestExecution && onUndoSplit && (
          <div className="flex items-center justify-between bg-fill/40 border border-strong/80 p-2.5 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span className="text-[11px] text-secondary">Distributed {latestExecution.date}</span>
            </div>
            <button
              onClick={() => onUndoSplit(latestExecution.id)}
              className="text-[10px] px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-lg transition font-medium"
            >
              Undo
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onExecutePaydaySplit();
            onClose();
          }}
          disabled={disabled}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-fill-strong disabled:text-faint disabled:cursor-not-allowed text-white font-semibold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20 no-privacy-blur"
        >
          <span>{disabled ? "Distribution locked / completed" : "Auto-Distribute to Wallets"}</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
