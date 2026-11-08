import React, { useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Banknote,
  Wallet,
  Target,
  Plus,
  Trash2,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Sparkles,
} from "lucide-react";
import {
  UnifiedFinanceData,
  CustomWallet,
  Deduction,
  DeductionType,
} from "../types/finance";
import { calculateNetSalary } from "../utils/financeHelpers";
import { normalizePaydayDays } from "../utils/dateHelpers";

interface OnboardingWizardProps {
  globalData: UnifiedFinanceData;
  onComplete: (completedData: UnifiedFinanceData) => void;
  onSkip: () => void;
  userName?: string;
}

const DEFAULT_WALLETS: CustomWallet[] = [
  { id: "main", label: "Main Account", color: "text-blue-400" },
  { id: "savings", label: "Savings", color: "text-emerald-400" },
  { id: "cash", label: "Cash On-Hand", color: "text-secondary" },
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  globalData,
  onComplete,
  onSkip,
  userName,
}) => {
  const [step, setStep] = useState<number>(1);
  const formId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  // Step 2: Salary & Paydays
  const [grossSalary, setGrossSalary] = useState<number>(
    globalData.settings?.grossPerPayoutSalary ??
      globalData.settings?.perPayoutSalary ??
      0
  );
  const [deductions, setDeductions] = useState<Deduction[]>(
    globalData.settings?.salaryDeductions ?? []
  );
  const [paydayPreset, setPaydayPreset] = useState<"15_30" | "custom">(
    globalData.settings?.paydayDays?.length &&
      !(
        globalData.settings.paydayDays.length === 2 &&
        globalData.settings.paydayDays.includes(15) &&
        globalData.settings.paydayDays.includes(30)
      )
      ? "custom"
      : "15_30"
  );
  const [customPaydayInput, setCustomPaydayInput] = useState<string>(
    globalData.settings?.paydayDays?.length
      ? globalData.settings.paydayDays.join(", ")
      : "15, 30"
  );
  const [showPaydayError, setShowPaydayError] = useState(false);
  const paydayParts = customPaydayInput.split(",").map(value => value.trim());
  const validCustomPaydays = paydayParts.every(value => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 31);
  const customPaydayDays = normalizePaydayDays(paydayParts.map(Number));

  // Step 3: Wallets
  const [wallets, setWallets] = useState<CustomWallet[]>(
    globalData.settings?.customWallets?.length
      ? globalData.settings.customWallets.map(w => ({ ...w }))
      : DEFAULT_WALLETS.map(w => ({ ...w }))
  );
  const [newWalletLabel, setNewWalletLabel] = useState("");

  // Step 4: Milestone Goal
  const [goalName, setGoalName] = useState<string>(
    globalData.settings?.goalName || "Emergency Fund"
  );
  const [targetFund, setTargetFund] = useState<number>(
    globalData.settings?.targetFund || 50000
  );
  const [milestoneWallet, setMilestoneWallet] = useState<string>(
    globalData.settings?.milestoneWallet || "main"
  );

  // Step 5: Theme
  const [theme, setTheme] = useState<"dark" | "light" | "system">(
    globalData.settings?.theme || "dark"
  );

  const netSalary = calculateNetSalary(grossSalary, deductions);

  const handleAddDeduction = () => {
    const newId = `ded_${Date.now()}`;
    setDeductions(prev => [
      ...prev,
      { id: newId, name: "Tax / SSS", type: "fixed", value: 1000 },
    ]);
  };

  const handleRemoveDeduction = (id: string) => {
    setDeductions(prev => prev.filter(d => d.id !== id));
  };

  const handleUpdateDeduction = (id: string, updates: Partial<Deduction>) => {
    setDeductions(prev =>
      prev.map(d => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const handleAddWallet = () => {
    const trimmed = newWalletLabel.trim();
    if (!trimmed) return;
    const newId = `w_${Date.now()}`;
    setWallets(prev => [
      ...prev,
      { id: newId, label: trimmed, color: "text-purple-400" },
    ]);
    setNewWalletLabel("");
  };

  const handleRemoveWallet = (id: string) => {
    if (wallets.length <= 1) return; // Keep at least one wallet
    setWallets(prev => prev.filter(w => w.id !== id));
    if (milestoneWallet === id) {
      const remaining = wallets.filter(w => w.id !== id);
      if (remaining[0]) setMilestoneWallet(remaining[0].id);
    }
  };

  const handleFinish = () => {
    const finalPaydays = paydayPreset === "15_30" ? [15, 30] : customPaydayDays;

    // Build the wallets map, preserving existing balances or initializing to 0
    const nextWallets = { ...(globalData.wallets || {}) };
    wallets.forEach(w => {
      if (nextWallets[w.id] === undefined) {
        nextWallets[w.id] = 0;
      }
    });

    const completedData: UnifiedFinanceData = {
      ...globalData,
      settings: {
        ...(globalData.settings || {}),
        grossPerPayoutSalary: grossSalary,
        salaryDeductions: deductions,
        perPayoutSalary: netSalary,
        paydayDays: finalPaydays,
        goalName,
        targetFund,
        milestoneWallet: wallets.some(w => w.id === milestoneWallet)
          ? milestoneWallet
          : wallets[0]?.id || "main",
        theme,
        customWallets: wallets,
        hasCompletedOnboarding: true,
        hasMigratedBaseWallets: true,
      },
      targetFund,
      wallets: nextWallets,
      updatedAt: Date.now(),
    };

    onComplete(completedData);
  };

  return (
    <div className="min-h-screen bg-shell flex flex-col justify-center items-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-lg bg-surface-modal border border-inverse/[0.1] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden animate-fade-in">
        {/* Step Indicator Progress Bar */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-inverse/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">
              {step}
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Step {step} of 5
            </span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(s => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step
                    ? "w-6 bg-blue-500"
                    : s < step
                    ? "w-2.5 bg-blue-500/40"
                    : "w-2.5 bg-fill"
                }`}
              />
            ))}
          </div>
        </div>

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2 py-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3 shadow-[0_0_24px_rgba(59,130,246,0.15)]">
                <Sparkles size={28} />
              </div>
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-strong tracking-tight">
                {userName ? `Welcome, ${userName}!` : "Welcome to Finance Tracker"}
              </h1>
              <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
                Set up your wallets, paydays, and savings goal now, or head straight to the dashboard.
                The Getting Started guide in Quick Actions shows you how to add your first entries.
              </p>
            </div>

            <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold text-strong block">
                    Zero guesswork setup
                  </span>
                  <span className="text-muted text-[11px]">
                    We've provided sensible defaults for everything. You can adjust any of this now or anytime in Settings.
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/20"
            >
              Get Started <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* STEP 2: Salary & Payday */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-base font-bold text-strong flex items-center gap-2">
                <Banknote size={16} className="text-purple-400" /> Payday Salary & Schedule
              </h2>
              <p className="text-xs text-muted mt-1">
                Configure your gross paycheck per period and payday dates.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor={`${formId}-salary`} className="text-[10px] text-faint uppercase font-semibold mb-1 block">
                  Gross Salary / Pay Period (₱)
                </label>
                <input
                  id={`${formId}-salary`}
                  type="number"
                  min="0"
                  step="100"
                  aria-label="Gross Salary"
                  value={grossSalary}
                  onChange={e => setGrossSalary(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong font-mono focus:border-purple-500"
                />
              </div>

              {/* Payday Schedule */}
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">
                  Payday Schedule
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={paydayPreset === "15_30"}
                    onClick={() => { setPaydayPreset("15_30"); setShowPaydayError(false); }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition text-center ${
                      paydayPreset === "15_30"
                        ? "chip-purple"
                        : "bg-surface-input border-strong text-muted"
                    }`}
                  >
                    15th & 30th (Default)
                  </button>
                  <button
                    type="button"
                    aria-pressed={paydayPreset === "custom"}
                    onClick={() => { setPaydayPreset("custom"); setShowPaydayError(false); }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition text-center ${
                      paydayPreset === "custom"
                        ? "chip-purple"
                        : "bg-surface-input border-strong text-muted"
                    }`}
                  >
                    Custom Days
                  </button>
                </div>

                {paydayPreset === "custom" && (
                  <div className="mt-2.5 space-y-1.5">
                    <label htmlFor={`${formId}-paydays`} className="block text-[11px] text-muted">Days of month (comma-separated):</label>
                    <input
                      id={`${formId}-paydays`}
                      type="text"
                      aria-label="Custom Payday Days"
                      aria-invalid={showPaydayError || undefined}
                      aria-describedby={showPaydayError ? `${formId}-payday-error` : undefined}
                      value={customPaydayInput}
                      onChange={e => {
                        setCustomPaydayInput(e.target.value);
                        setShowPaydayError(false);
                      }}
                      placeholder="e.g. 10, 25"
                      className="min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-xl px-3 py-1.5 text-xs text-strong font-mono focus:border-purple-500"
                    />
                    {showPaydayError && <p id={`${formId}-payday-error`} role="alert" className="text-xs text-negative">Enter whole days from 1 to 31, separated by commas, like 5, 20.</p>}
                  </div>
                )}
              </div>

              {/* Deductions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-faint uppercase font-semibold block">
                    Deductions (Tax, SSS, etc.)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDeduction}
                    className="flex items-center gap-1 text-[11px] font-semibold text-violet-accent hover:text-primary transition"
                  >
                    <Plus size={12} /> Add Deduction
                  </button>
                </div>

                {deductions.length === 0 ? (
                  <div className="text-[11px] text-faint py-2.5 px-3 rounded-xl bg-surface-sunken border border-inverse/[0.05]">
                    No deductions added. Net usable salary equals gross.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {deductions.map((d, index) => (
                      <div
                        key={d.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-2 bg-surface-sunken p-2 rounded-xl border border-inverse/[0.05] sm:flex"
                      >
                        <input
                          type="text"
                          aria-label={`Deduction ${index + 1} name`}
                          value={d.name}
                          onChange={e => handleUpdateDeduction(d.id, { name: e.target.value })}
                          className="col-span-2 min-h-11 min-w-0 flex-1 bg-surface-input border border-strong rounded-lg px-2.5 py-1.5 text-xs text-strong"
                        />
                        <select
                          aria-label={`Deduction ${index + 1} type`}
                          value={d.type}
                          onChange={e =>
                            handleUpdateDeduction(d.id, { type: e.target.value as DeductionType })
                          }
                          className="col-start-1 row-start-2 min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-lg px-1.5 py-1.5 text-xs text-strong sm:w-20"
                        >
                          <option value="fixed">Fixed ₱</option>
                          <option value="percentage">%</option>
                        </select>
                        <input
                          type="number"
                          aria-label={`Deduction ${index + 1} value`}
                          min="0"
                          value={d.value}
                          onChange={e =>
                            handleUpdateDeduction(d.id, {
                              value: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="col-start-2 row-start-2 min-h-11 w-full min-w-0 bg-surface-input border border-strong rounded-lg px-2 py-1.5 text-xs text-strong font-mono sm:w-20"
                        />
                        <button
                          type="button"
                          aria-label={`Remove deduction ${index + 1}`}
                          onClick={() => handleRemoveDeduction(d.id)}
                          className="col-start-3 row-start-1 row-span-2 grid size-11 shrink-0 place-items-center text-faint hover:text-rose-400 rounded-lg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Net Summary Preview */}
                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-xl p-3 flex justify-between items-center text-xs">
                  <span className="text-muted">Net Usable Salary:</span>
                  <span className="font-mono font-bold text-positive text-sm">
                    ₱{netSalary.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 bg-surface-high hover:bg-inverse/[0.06] border border-inverse/[0.06] text-secondary font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (paydayPreset === "custom" && !validCustomPaydays) {
                    setShowPaydayError(true);
                    return;
                  }
                  setStep(3);
                }}
                className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-blue-900/20"
              >
                Next: Wallets <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Baseline Wallets */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-base font-bold text-strong flex items-center gap-2">
                <Wallet size={16} className="text-amber-400" /> Accounts & Wallets
              </h2>
              <p className="text-xs text-muted mt-1">
                Customize your cash buckets. You can track liquid bank accounts, e-wallets, or cash.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {wallets.map((w, index) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-sunken border border-inverse/[0.05]"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${w.color || "text-blue-400"} bg-current shrink-0`} />
                    <input
                      type="text"
                      aria-label={`Wallet ${index + 1} name`}
                      value={w.label}
                      onChange={e => {
                        const val = e.target.value;
                        setWallets(prev =>
                          prev.map(item => (item.id === w.id ? { ...item, label: val } : item))
                        );
                      }}
                      className="min-h-11 min-w-0 flex-1 bg-surface-input border border-strong rounded-lg px-2.5 py-1.5 text-xs text-strong"
                    />
                    {wallets.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove wallet ${index + 1}`}
                        onClick={() => handleRemoveWallet(w.id)}
                        className="grid size-11 shrink-0 place-items-center text-faint hover:text-rose-400 rounded-lg"
                        title="Delete wallet"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add New Wallet */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  aria-label="New wallet name"
                  placeholder="New wallet name (e.g. Maya, GCash)..."
                  value={newWalletLabel}
                  onChange={e => setNewWalletLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddWallet();
                    }
                  }}
                  className="min-h-11 min-w-0 flex-1 bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleAddWallet}
                  className="px-3 py-2 bg-inverse/[0.05] hover:bg-inverse/[0.1] border border-inverse/[0.08] text-secondary rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/3 bg-surface-high hover:bg-inverse/[0.06] border border-inverse/[0.06] text-secondary font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-blue-900/20"
              >
                Next: Milestone Goal <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Milestone Goal */}
        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-base font-bold text-strong flex items-center gap-2">
                <Target size={16} className="text-blue-400" /> Milestone Goal
              </h2>
              <p className="text-xs text-muted mt-1">
                Set a primary savings milestone to track directly on your dashboard.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">
                  Goal Name
                </label>
                <input
                  type="text"
                  aria-label="Goal Name"
                  placeholder="e.g. Emergency Fund, Japan Trip, Laptop"
                  value={goalName}
                  onChange={e => setGoalName(e.target.value)}
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">
                  Target Amount (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  aria-label="Target Amount"
                  value={targetFund}
                  onChange={e => setTargetFund(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong font-mono focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">
                  Linked Wallet (Tracks Progress)
                </label>
                <select
                  aria-label="Linked Wallet"
                  value={milestoneWallet}
                  onChange={e => setMilestoneWallet(e.target.value)}
                  className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong focus:border-blue-500 cursor-pointer"
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-1/3 bg-surface-high hover:bg-inverse/[0.06] border border-inverse/[0.06] text-secondary font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-blue-900/20"
              >
                Next: Appearance <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Theme & Launch */}
        {step === 5 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-base font-bold text-strong flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" /> Appearance & Launch
              </h2>
              <p className="text-xs text-muted mt-1">
                Choose your preferred theme and finalize your setup.
              </p>
            </div>

            <div className="space-y-4">
              {/* Theme Selector */}
              <div>
                <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">
                  Theme
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                    className={`py-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1.5 border transition ${
                      theme === "dark"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-surface-input border-strong text-muted hover:border-default"
                    }`}
                  >
                    <Moon size={16} /> Dark
                  </button>
                  <button
                    type="button"
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                    className={`py-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1.5 border transition ${
                      theme === "light"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-surface-input border-strong text-muted hover:border-default"
                    }`}
                  >
                    <Sun size={16} /> Light
                  </button>
                  <button
                    type="button"
                    aria-pressed={theme === "system"}
                    onClick={() => setTheme("system")}
                    className={`py-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1.5 border transition ${
                      theme === "system"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-surface-input border-strong text-muted hover:border-default"
                    }`}
                  >
                    <Monitor size={16} /> System
                  </button>
                </div>
              </div>

              {/* Review Summary Card */}
              <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-muted">
                  <span>Net Salary:</span>
                  <span className="font-mono font-semibold text-strong">
                    ₱{netSalary.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted">
                  <span>Payday Dates:</span>
                  <span className="font-semibold text-strong">
                    {paydayPreset === "15_30" ? "15th & 30th" : customPaydayDays.join(", ")}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted">
                  <span>Wallets:</span>
                  <span className="font-semibold text-strong">
                    {wallets.map(w => w.label).join(", ")}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted">
                  <span>Milestone Goal:</span>
                  <span className="font-semibold text-strong">
                    {goalName} (₱{targetFund.toLocaleString()})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="w-1/3 bg-surface-high hover:bg-inverse/[0.06] border border-inverse/[0.06] text-secondary font-semibold py-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="w-2/3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/20"
              >
                <CheckCircle2 size={16} /> Finish Setup & Launch
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onSkip}
          className="mt-4 min-h-11 w-full rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-fill hover:text-primary"
        >
          Skip setup for now
        </button>
      </div>
    </div>
  );
};
