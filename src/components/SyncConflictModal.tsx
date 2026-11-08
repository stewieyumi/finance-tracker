import React from "react";
import { AlertOctagon } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import { Modal } from "./ui/Modal";
import { entryDialogStyles } from "./ui/dialogStyles";

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose?: () => void;
  localSnapshot: UnifiedFinanceData | undefined;
  cloudSnapshot: UnifiedFinanceData | undefined;
  cloudRevision: number | undefined;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  isOpen,
  localSnapshot,
  cloudSnapshot,
  cloudRevision,
  onKeepLocal,
  onKeepCloud
}) => {
  if (!isOpen || !localSnapshot || !cloudSnapshot) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Cannot close without resolving
      variant="floating"
      ariaLabel="Sync Conflict"
      manageFocus
      closeOnBackdropClick={false}
      closeOnEscape={false}
    >
      <div className={`${entryDialogStyles.card} max-w-lg space-y-4 text-xs font-mono`}>
        <div className="flex items-center justify-between pb-3 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2 text-amber-500">
            <AlertOctagon size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-strong">
              Sync Conflict Detected
            </h3>
          </div>
        </div>

        <div className="space-y-3 text-secondary">
          <p className="text-[11px] leading-relaxed">
            Your local device has changes that conflict with newer changes made on another device.
            Background syncing has been paused until you choose which version to keep.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-lowest p-3.5 rounded-2xl border border-inverse/[0.05] space-y-1">
              <div className="text-faint font-semibold text-[10px] uppercase tracking-wider">
                This Device (Local)
              </div>
              <div className="text-strong">
                {localSnapshot.updatedAt
                  ? new Date(localSnapshot.updatedAt).toLocaleString()
                  : "Unknown"}
              </div>
            </div>

            <div className="bg-surface-lowest p-3.5 rounded-2xl border border-inverse/[0.05] space-y-1">
              <div className="text-faint font-semibold text-[10px] uppercase tracking-wider">
                Other Device (Cloud)
              </div>
              <div className="text-primary font-bold">
                {cloudSnapshot.updatedAt
                  ? new Date(cloudSnapshot.updatedAt).toLocaleString()
                  : "Unknown"}
              </div>
              <div className="text-[10px] text-faint">
                Revision: {cloudRevision ?? "Unknown"}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2 text-xs leading-relaxed text-warning">
          The version you choose replaces the other. Recovery copies of both versions are saved in this browser before your choice is applied.
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={() => {
              if (confirm("Are you sure you want to keep THIS device's data and overwrite the cloud?")) {
                onKeepLocal();
              }
            }}
            className="min-h-11 bg-surface-lowest border border-inverse/10 hover:bg-surface text-strong font-semibold px-2 py-2.5 rounded-xl text-xs transition shadow-sm"
          >
            Keep This Device Data
          </button>

          <button
            onClick={() => {
              if (confirm("Are you sure you want to use the CLOUD data and discard your local changes?")) {
                onKeepCloud();
              }
            }}
            className="min-h-11 bg-amber-700 hover:bg-amber-800 text-white font-semibold px-2 py-2.5 rounded-xl text-xs transition shadow-md"
          >
            Use Cloud Data
          </button>
        </div>
      </div>
    </Modal>
  );
};
