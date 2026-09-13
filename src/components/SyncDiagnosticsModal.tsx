import React, { useEffect } from "react";
import { X, Wrench } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";

interface SyncDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  totalLiquid: number;
  debugLog: string;
  onForcePush: () => void | Promise<void>;
  onForcePull: () => void | Promise<void>;
}

export const SyncDiagnosticsModal: React.FC<SyncDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  globalData,
  totalLiquid,
  debugLog,
  onForcePush,
  onForcePull
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sync Diagnostics"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-[#121217] border border-white/[0.08] rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl text-xs font-mono">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Wrench size={15} className="text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Sync & Cloud Diagnostics
            </h3>
          </div>

          <button
            onClick={onClose}
            aria-label="Close diagnostics"
            className="text-zinc-500 hover:text-white p-1 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-zinc-300">
          <div className="bg-[#09090c] p-3.5 rounded-2xl border border-white/[0.05] space-y-1">
            <div className="text-zinc-500 font-semibold text-[10px] uppercase tracking-wider">
              1. Cloud Endpoint Status
            </div>

            <div>
              • Proxy Route:{" "}
              <span className="text-emerald-400 font-bold">
                /api/sync (Serverless Secure)
              </span>
            </div>

            <div>
              • Authentication:{" "}
              <span className="text-blue-400">
                Master passcode handled by sync engine
              </span>
            </div>
          </div>

          <div className="bg-[#09090c] p-3.5 rounded-2xl border border-white/[0.05] space-y-1">
            <div className="text-zinc-500 font-semibold text-[10px] uppercase tracking-wider">
              2. Active Local Browser State
            </div>

            <div>
              • Liquid Cash:{" "}
              <span className="text-emerald-400 font-bold">
                ₱
                {totalLiquid.toLocaleString("en-US", {
                  minimumFractionDigits: 2
                })}
              </span>
            </div>

            <div>
              • GoTyme Wallet:{" "}
              <span className="text-zinc-100">
                ₱{globalData?.wallets?.gotyme ?? 0}
              </span>
            </div>

            <div>
              • Bills in Memory:{" "}
              <span className="text-zinc-100">
                {globalData?.library?.bills?.length || 0}
              </span>
            </div>
          </div>

          <div className="bg-[#09090c] p-3.5 rounded-2xl border border-white/[0.05] space-y-1">
            <div className="text-zinc-500 font-semibold text-[10px] uppercase tracking-wider">
              3. Last Cloud Network Action
            </div>

            <div className="text-[11px] text-amber-300 break-all">
              {debugLog || "No network action triggered yet."}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={onForcePush}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-md"
          >
            Force Cloud Push (Upload)
          </button>

          <button
            onClick={onForcePull}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-md"
          >
            Force Cloud Pull (Download)
          </button>
        </div>
      </div>
    </div>
  );
};
