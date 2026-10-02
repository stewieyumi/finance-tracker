import React, { useState, useEffect, useRef } from "react";
import { X, Target, Save } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import {
  createSettingsForm,
  applySettingsForm,
  SettingsForm,
} from "../utils/settingsForm";

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
  const modalBoxRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Goal Configuration Modal"
      onClick={(e) => {
        if (modalBoxRef.current && !modalBoxRef.current.contains(e.target as Node)) {
          handleCancel();
        }
      }}
      className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        ref={modalBoxRef}
        className="bg-surface-elevated border border-inverse/[0.08] rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-blue-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-strong">
              Milestone Goal Setup
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close goal setup modal"
            className="text-faint hover:text-strong p-1.5 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="goal-setup-name"
              className="text-[10px] text-faint uppercase font-semibold mb-1 block"
            >
              Goal Name
            </label>
            <input
              id="goal-setup-name"
              type="text"
              value={form.goalName}
              onChange={e => setForm(prev => ({ ...prev, goalName: e.target.value }))}
              placeholder="e.g. Japan Trip, Emergency Fund, New Laptop"
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="goal-setup-target"
              className="text-[10px] text-faint uppercase font-semibold mb-1 block"
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
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="goal-setup-wallet"
              className="text-[10px] text-faint uppercase font-semibold mb-1 block"
            >
              Linked Wallet (Tracks Progress)
            </label>
            <select
              id="goal-setup-wallet"
              value={form.milestoneWallet}
              onChange={e => setForm(prev => ({ ...prev, milestoneWallet: e.target.value }))}
              className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-blue-500 cursor-pointer"
            >
              {globalData?.settings?.customWallets?.map(cw => (
                <option key={cw.id} value={cw.id}>
                  {cw.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 bg-surface-elevated hover:bg-surface-elevated/80 border border-inverse/[0.1] text-secondary text-xs font-semibold py-2.5 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
          >
            <Save size={14} /> Save Goal
          </button>
        </div>
      </div>
    </div>
  );
};
