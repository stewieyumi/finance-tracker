import React, { useState, useEffect, useRef } from "react";
import { X, Target } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import {
  createSettingsForm,
  applySettingsForm,
  SettingsForm,
} from "../utils/settingsForm";
import { Modal } from "./ui/Modal";

export interface GoalSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
}

export const GoalSetupModal: React.FC<GoalSetupModalProps> = ({
  isOpen,
  onClose,
  globalData,
  setGlobalData,
}) => {
  const prevIsOpenRef = useRef(false);
  const [form, setForm] = useState<SettingsForm>(() =>
    createSettingsForm(globalData?.settings, globalData?.wallets)
  );

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setForm(createSettingsForm(globalData?.settings, globalData?.wallets));
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, globalData?.settings, globalData?.wallets]);

  const handleCancel = () => {
    if (globalData?.settings) {
      setForm(createSettingsForm(globalData.settings, globalData.wallets));
    }
    onClose();
  };

  if (!isOpen) return null;

  const handleSave = () => {
    setGlobalData(prev => {
      const currentForm = createSettingsForm(prev.settings, prev.wallets);
      const mergedForm: SettingsForm = {
        ...currentForm,
        goalName: form.goalName,
        targetFund: form.targetFund,
        milestoneWallet: form.milestoneWallet,
      };
      return {
        ...prev,
        settings: applySettingsForm(prev.settings, mergedForm),
        updatedAt: Date.now(),
      };
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      variant="floating"
      ariaLabel="Goal Configuration Modal"
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-subtle bg-surface-elevated shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-subtle px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-selection)] text-white">
              <Target size={21} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-strong">Milestone Goal Setup</h3>
              <p className="mt-0.5 text-xs text-muted">Choose what to save for and where to track it.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close goal setup modal"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="overflow-hidden rounded-2xl bg-surface divide-y divide-subtle">
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
              <label
                htmlFor="goal-setup-name"
                className="text-sm font-medium text-primary"
              >
                Goal Name
              </label>
              <input
                id="goal-setup-name"
                type="text"
                value={form.goalName}
                onChange={e => setForm(prev => ({ ...prev, goalName: e.target.value }))}
                placeholder="e.g. Emergency fund"
                className="min-w-0 w-full rounded-lg border border-strong bg-surface-input px-3 py-2 text-sm text-primary focus-visible:outline focus-visible:outline-blue-500"
              />
            </div>

            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
              <label
                htmlFor="goal-setup-target"
                className="text-sm font-medium text-primary"
              >
                Target Amount (₱)
              </label>
              <input
                id="goal-setup-target"
                type="number"
                value={form.targetFund}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    targetFund: e.target.value === "" ? 0 : Number(e.target.value),
                  }))
                }
                className="min-w-0 w-full rounded-lg border border-strong bg-surface-input px-3 py-2 text-sm text-primary tabular-nums focus-visible:outline focus-visible:outline-blue-500"
              />
            </div>

            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
              <label
                htmlFor="goal-setup-wallet"
                className="text-sm font-medium text-primary"
              >
                Linked Wallet (Tracks Progress)
              </label>
              <select
                id="goal-setup-wallet"
                value={form.milestoneWallet}
                onChange={e => setForm(prev => ({ ...prev, milestoneWallet: e.target.value }))}
                className="min-w-0 w-full rounded-lg border border-strong bg-surface-input px-3 py-2 text-sm text-primary focus-visible:outline focus-visible:outline-blue-500 cursor-pointer"
              >
                {globalData?.settings?.customWallets?.map(cw => (
                  <option key={cw.id} value={cw.id}>
                    {cw.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted">The linked wallet shows your progress toward the target. Saving a goal does not move money.</p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-subtle px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleCancel}
            className="min-h-11 flex-1 rounded-xl bg-fill px-4 text-sm font-semibold text-secondary transition hover:bg-fill-strong sm:flex-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-11 flex-1 rounded-xl bg-[var(--bg-selection)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--bg-selection-hover)] sm:flex-none"
          >
            Save Goal
          </button>
        </div>
      </div>
    </Modal>
  );
};
