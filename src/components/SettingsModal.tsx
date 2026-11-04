import React, { useState, useEffect, useRef } from "react";
import { X, Settings, Briefcase, Save, Cloud, Database, ArrowRightLeft, Download, Upload, Banknote, Plus, Trash2, CalendarPlus, Search, Wallet, ChevronRight } from "lucide-react";
import { Deduction, DeductionType, UnifiedFinanceData } from "../types/finance";
import { migrateLegacyBills } from "../utils/financeMigrations";
import { Modal } from "./ui/Modal";
import {
  createSettingsForm,
  applySettingsForm,
} from "../utils/settingsForm";
import {
  calculateDeductionAmount,
  calculateNetSalary,
} from "../utils/financeHelpers";
import { generateId } from "../utils/idHelpers";
import { exportPaydaysToCalendar } from "../utils/calendarExport";
import { applyTheme, ThemeMode } from "../hooks/useTheme";

const SETTINGS_SECTIONS = {
  general: {
    label: "General", icon: Settings, color: "bg-neutral-500",
    description: "Personalize your appearance and dashboard labels.",
    keywords: "appearance theme dark light system terminology employee",
  },
  baselines: {
    label: "Payday", icon: Banknote, color: "bg-emerald-700",
    description: "Set your salary, deductions, and pay dates.",
    keywords: "salary deductions pay dates schedule calendar income tax baselines",
  },
  wallets: {
    label: "Wallet Defaults", icon: Wallet, color: "bg-blue-700",
    description: "Choose which wallets handle payments and allocations.",
    keywords: "bill payments expenses routing savings transit living allowance",
  },
  sync: {
    label: "Cloud Sync", icon: Cloud, color: "bg-violet-700",
    description: "Manage sync, backups, and recovery.",
    keywords: "backup import export restore recovery network diagnostics scanner migration",
  },
} as const;

type SettingsSection = keyof typeof SETTINGS_SECTIONS;
const sectionKeys = Object.keys(SETTINGS_SECTIONS) as SettingsSection[];

const settingsGroup = "overflow-hidden rounded-2xl bg-surface divide-y divide-subtle";
const settingsRow = "flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3";
const settingsAction = `${settingsRow} w-full text-left text-sm font-medium text-primary transition hover:bg-fill focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500`;

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsSection;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  totalLiquid: number;
  debugLog: string;
  onForcePush: () => void | Promise<void>;
  onForcePull: () => void | Promise<void>;
  onExport: () => void;
  onImportClick: () => void;
  onRestoreImportBackup?: () => void;
}

const PRESETS = {
  employee: { label: "9-to-5 Employee", inflows: "SALARY & BONUSES", gigs: "SIDE HUSTLES", inflowCats: ["Salary", "Bonus", "13th Month", "Reimbursement", "Other"], gigCats: ["Freelance", "Tutoring", "Online Selling", "Other"] },
  videographer: { label: "Multimedia Artist", inflows: "RECEIVABLES & INFLOWS", gigs: "UPCOMING SHOOTS & GIGS", inflowCats: ["Salary", "Shoot", "Edit", "Payment", "Other"], gigCats: ["Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"] },
  freelance: { label: "Freelancer / Dev", inflows: "INVOICES & PAYMENTS", gigs: "FREELANCE PROJECTS", inflowCats: ["Retainer", "Project", "Consulting", "Other"], gigCats: ["Frontend", "Backend", "Fullstack", "Design", "Maintenance", "Other"] },
  personal: { label: "Personal / Student", inflows: "INCOME & ALLOWANCE", gigs: "TASKS & HUSTLES", inflowCats: ["Allowance", "Salary", "Gift", "Side Hustle", "Other"], gigCats: ["Part-time", "Errand", "Online Selling", "Other"] }
};

const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Transport",
  "Utilities",
  "Laundry & Home",
  "Shopping",
  "Other"
] as const;

const formatOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, initialTab = "general", onClose, globalData, setGlobalData, totalLiquid, debugLog, onForcePush, onForcePull, onExport, onImportClick, onRestoreImportBackup }) => {
  const [activeTab, setActiveTab] = useState<SettingsSection>(initialTab);
  const [sectionSearch, setSectionSearch] = useState("");
  const searchWords = sectionSearch.trim().toLowerCase().split(/\s+/);
  const matchingSections = sectionKeys.filter(key => {
    const { label, keywords } = SETTINGS_SECTIONS[key];
    return searchWords.every(word => `${label} ${keywords}`.toLowerCase().includes(word));
  });
  const activeSection = SETTINGS_SECTIONS[activeTab];
  const SectionIcon = activeSection.icon;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSectionSearch("");
    }
  }, [isOpen, initialTab]);
  const [form, setForm] = useState(() =>
    createSettingsForm(globalData.settings, globalData.wallets, {
      inflowCategories: PRESETS.videographer.inflowCats,
      gigCategories: PRESETS.videographer.gigCats,
    })
  );


  useEffect(() => {
    if (isOpen && globalData.settings) {
      setForm(
        createSettingsForm(globalData.settings, globalData.wallets, {
          inflowCategories: PRESETS.videographer.inflowCats,
          gigCategories: PRESETS.videographer.gigCats,
        })
      );
    }
  }, [isOpen, globalData.settings]);

  const baselineThemeRef = useRef<ThemeMode>(
    (globalData.settings?.theme as ThemeMode) || "dark"
  );
  const isSavedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    baselineThemeRef.current =
      (globalData.settings?.theme as ThemeMode) || "dark";
    isSavedRef.current = false;

    return () => {
      if (!isSavedRef.current) {
        applyTheme(baselineThemeRef.current);
      }
    };
  }, [isOpen, globalData.settings?.theme]);

  useEffect(() => {
    if (!isOpen) return;
    return applyTheme(form.theme as ThemeMode);
  }, [isOpen, form.theme]);

  const handleCancel = () => {
    if (!isSavedRef.current) {
      applyTheme(baselineThemeRef.current);
    }
    if (globalData.settings) {
      setForm(
        createSettingsForm(globalData.settings, globalData.wallets, {
          inflowCategories: PRESETS.videographer.inflowCats,
          gigCategories: PRESETS.videographer.gigCats,
        })
      );
    }
    onClose();
  };

  const applyPreset = (key: keyof typeof PRESETS) => {
    const p = PRESETS[key];
    setForm(prev => ({ ...prev, inflowsLabel: p.inflows, gigsLabel: p.gigs, inflowCategories: p.inflowCats, gigCategories: p.gigCats }));
  };

  const handleAddDeduction = () => {
    setForm(prev => ({
      ...prev,
      salaryDeductions: [
        ...prev.salaryDeductions,
        {
          id: generateId("ded"),
          name: "",
          type: "fixed",
          value: 0,
        },
      ],
    }));
  };

  const handleUpdateDeduction = (id: string, patch: Partial<Deduction>) => {
    setForm(prev => ({
      ...prev,
      salaryDeductions: prev.salaryDeductions.map(d =>
        d.id === id ? { ...d, ...patch } : d
      ),
    }));
  };

  const handleRemoveDeduction = (id: string) => {
    setForm(prev => ({
      ...prev,
      salaryDeductions: prev.salaryDeductions.filter(d => d.id !== id),
    }));
  };

  const currentGross = Math.max(0, Number(form.grossPerPayoutSalary) || 0);
  const currentDeductions = form.salaryDeductions || [];
  const totalDeductions = Math.min(
    currentGross,
    currentDeductions.reduce(
      (sum, d) => sum + calculateDeductionAmount(currentGross, d),
      0
    )
  );
  const calculatedNet = calculateNetSalary(currentGross, currentDeductions);

  const [newPaydayDay, setNewPaydayDay] = useState(() => {
    const existing = globalData.settings?.paydayDays || [];
    return Array.from({ length: 31 }, (_, i) => i + 1).find(d => !existing.includes(d)) || 1;
  });

  const handleSave = () => {
    isSavedRef.current = true;
    setGlobalData(prev => ({
      ...prev,
      settings: applySettingsForm(prev.settings, form),
      updatedAt: Date.now()
    }));
    onClose();
  };

  const handleMigrateWallets = () => {
    if (confirm("Permanently lock all old bills to their automatically assigned wallets (using the old routing rules)?")) {
      setGlobalData(migrateLegacyBills);
      alert("Migration complete! All old bills are securely linked.");
    }
  };

  if (!isOpen) return null;

  const WalletSelectOptions = () => (
    <>
      {globalData.settings?.customWallets?.map(cw => <option key={cw.id} value={cw.id}>{cw.label}</option>)}
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      variant="floating"
      ariaLabel="App Settings"
    >
      <div className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-default bg-surface-low shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-secondary" />
            <h3 className="text-lg font-bold tracking-tight text-strong">App Settings</h3>
          </div>
          <button
            onClick={handleCancel}
            aria-label="Close settings modal"
            className="text-faint hover:text-strong p-1.5 rounded-lg transition"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 min-[480px]:flex-row">
          <nav aria-label="Settings sections" className="shrink-0 rounded-2xl border border-default bg-surface-low px-2 py-2 min-[480px]:w-[34%] min-[480px]:max-w-56 min-[480px]:overflow-y-auto">
            <label className="flex min-h-9 items-center gap-2 rounded-xl bg-fill px-3 text-muted focus-within:ring-2 focus-within:ring-blue-500">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search settings"
                placeholder="Search"
                value={sectionSearch}
                onChange={event => setSectionSearch(event.target.value)}
                className="min-w-0 w-full bg-transparent text-sm text-primary outline-none placeholder:text-muted"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-0.5 min-[480px]:grid-cols-1">
              {matchingSections.map(tab => {
                const { label, color, icon: Icon } = SETTINGS_SECTIONS[tab];
                const selected = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setActiveTab(tab);
                      setSectionSearch("");
                    }}
                    className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 md:text-sm ${selected ? "bg-[var(--bg-selection)] text-white" : "text-primary hover:bg-fill-strong"}`}
                  >
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-white ${color}`}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{label}</span>
                    <ChevronRight size={13} aria-hidden="true" className="hidden shrink-0 opacity-60 min-[480px]:block" />
                  </button>
                );
              })}
            </div>
            {matchingSections.length === 0 && (
              <p role="status" className="px-2 py-2 text-xs text-muted">No matching settings.</p>
            )}
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div key={activeTab} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-2 sm:px-5">
              <header className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${activeSection.color}`}>
                  <SectionIcon size={22} aria-hidden="true" />
                </span>
                <div>
                  <h4 className="text-base font-semibold tracking-tight text-strong">{activeSection.label}</h4>
                  <p className="text-xs leading-relaxed text-muted">{activeSection.description}</p>
                </div>
              </header>
          {activeTab === "general" && (
            <div className="space-y-5">
              <div className={settingsGroup}>
                <div className={settingsRow}>
                  <span className="text-sm font-medium text-primary">Appearance</span>
                  <div className="flex max-w-full gap-1 rounded-xl bg-fill p-1">
                    {(["dark", "light", "system"] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={form.theme === opt}
                        onClick={() => setForm(prev => ({ ...prev, theme: opt }))}
                        className={`min-h-9 rounded-lg px-3 text-xs font-semibold capitalize transition ${form.theme === opt ? "bg-blue-600 text-white" : "text-muted hover:text-primary"}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <section aria-labelledby="settings-terminology">
                <h5 id="settings-terminology" className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-muted">
                  <Briefcase size={14} /> Dashboard terminology
                </h5>
                <div className={settingsGroup}>
                  <div className={settingsRow}>
                    <span className="text-sm font-medium text-primary">Preset</span>
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
                      {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(key => (
                        <button key={key} type="button" onClick={() => applyPreset(key)}
                          className="min-h-10 rounded-lg bg-fill px-2 py-1 text-xs text-secondary hover:bg-fill-strong">
                          {PRESETS[key].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {([
                    ["inflowsLabel", "Receivables Title"],
                    ["gigsLabel", "Gigs/Tasks Title"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className={settingsRow}>
                      <span className="text-sm font-medium text-primary">{label}</span>
                      <input type="text" value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-strong bg-surface-input px-3 py-2 text-xs text-primary focus-visible:outline focus-visible:outline-blue-500" />
                    </label>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === "baselines" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-xs text-muted mb-2">Configure the default amounts injected into your wallets on your configured payday schedule. (Note: These scale down safely if your bills consume too much of your paycheck).</div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider">
                  <Banknote size={14} /> Payday Salary & Deductions
                </div>

                <div className="bg-surface-sunken border border-subtle rounded-2xl p-4 space-y-4">
                  <div>
                    <label
                      htmlFor="gross-salary-input"
                      className="text-[10px] text-faint uppercase font-semibold mb-1 block"
                    >
                      Gross Salary / Pay Period (₱)
                    </label>
                    <input
                      id="gross-salary-input"
                      aria-label="Gross Salary / Pay Period"
                      type="number"
                      min="0"
                      step="1"
                      value={form.grossPerPayoutSalary}
                      onChange={e =>
                        setForm({
                          ...form,
                          grossPerPayoutSalary: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-faint uppercase font-semibold block">
                        Deductions
                      </label>
                      <button
                        type="button"
                        onClick={handleAddDeduction}
                        className="flex items-center gap-1 text-[11px] font-semibold text-purple-400 hover:text-purple-300 transition"
                      >
                        <Plus size={12} /> Add Deduction
                      </button>
                    </div>

                    {form.salaryDeductions.length === 0 ? (
                      <div className="text-[11px] text-faint py-2.5 px-3 rounded-xl bg-surface-lowest border border-subtle">
                        No deductions configured. Net equals gross.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {form.salaryDeductions.map(deduction => (
                          <div
                            key={deduction.id}
                            data-testid={`deduction-row-${deduction.id}`}
                            className="flex items-center gap-2 bg-surface-lowest p-2 rounded-xl border border-subtle"
                          >
                            <input
                              type="text"
                              placeholder="Name (e.g. Tax)"
                              value={deduction.name}
                              onChange={e =>
                                handleUpdateDeduction(deduction.id, { name: e.target.value })
                              }
                              aria-label="Deduction name"
                              className="flex-1 min-w-0 bg-surface-input border border-strong rounded-lg px-2.5 py-1.5 text-xs text-strong outline-none focus:border-purple-500"
                            />
                            <select
                              value={deduction.type}
                              onChange={e =>
                                handleUpdateDeduction(deduction.id, {
                                  type: e.target.value as DeductionType,
                                })
                              }
                              aria-label="Deduction type"
                              className="w-24 bg-surface-input border border-strong rounded-lg px-2 py-1.5 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer"
                            >
                              <option value="fixed">Fixed (₱)</option>
                              <option value="percentage">Percent (%)</option>
                            </select>
                            <div className="w-24">
                              <input
                                type="number"
                                min="0"
                                step={deduction.type === "percentage" ? "0.1" : "1"}
                                placeholder="0"
                                value={deduction.value}
                                onChange={e =>
                                  handleUpdateDeduction(deduction.id, {
                                    value: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                aria-label="Deduction value"
                                className="w-full bg-surface-input border border-strong rounded-lg px-2 py-1.5 text-xs text-strong font-mono outline-none focus:border-purple-500"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveDeduction(deduction.id)}
                              aria-label={`Remove ${deduction.name || "deduction"}`}
                              className="text-faint hover:text-rose-400 p-1.5 rounded-lg transition"
                              title="Remove deduction"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-subtle">
                    <div className="bg-surface-lowest border border-subtle rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-faint uppercase font-semibold">
                          Gross
                        </div>
                        <div
                          data-testid="salary-gross-display"
                          className="text-xs font-mono font-bold text-strong mt-0.5"
                        >
                          ₱{currentGross.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-faint uppercase font-semibold">
                          Total Deductions
                        </div>
                        <div
                          data-testid="salary-deductions-display"
                          className="text-xs font-mono font-bold text-rose-400 mt-0.5"
                        >
                          -₱{totalDeductions.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-500 uppercase font-bold">
                          Net Usable Salary
                        </div>
                        <div
                          data-testid="salary-net-display"
                          className="text-xs font-mono font-bold text-emerald-400 mt-0.5"
                        >
                          ₱{calculatedNet.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-faint mt-2">
                      💡 Payday distribution and wallet allocations consume this{" "}
                      <span className="text-emerald-400 font-semibold font-mono">
                        Net Usable Salary (₱{calculatedNet.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })})
                      </span>
                      .
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-surface-sunken border border-subtle rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Payday Schedule</label>
                      <div className="text-[10px] text-faint">These dates control payday funding and commitment allocation. Not the same as an individual bill's due date.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => exportPaydaysToCalendar(form.paydayDays.length ? form.paydayDays : [15, 30])}
                      className="px-2.5 py-1 text-muted hover:text-emerald-400 bg-inverse/[0.04] hover:bg-inverse/[0.08] border border-subtle rounded-lg text-[10px] uppercase font-bold tracking-wider transition flex items-center gap-1 shrink-0 ml-2"
                      title="Export Paydays to Calendar (.ics)"
                      aria-label="Export Paydays to Calendar"
                    >
                      <CalendarPlus size={11} className="text-emerald-400" />
                      <span>Export (.ics)</span>
                    </button>
                  </div>

                  {form.paydayDays.length === 0 ? (
                    <div className="p-3 rounded-xl bg-surface-lowest border border-subtle mb-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-strong flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          System Default
                        </div>
                        <div className="text-[11px] text-muted">15th and 30th of each month</div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Default
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {form.paydayDays.map(day => (
                        <span
                          key={day}
                          data-testid={`payday-chip-${day}`}
                          className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg chip-blue text-[11px] font-semibold"
                        >
                          {formatOrdinal(day)}
                          <button
                            type="button"
                            onClick={() => setForm({
                              ...form,
                              paydayDays: form.paydayDays.filter(d => d !== day),
                            })}
                            aria-label={`Remove payday ${day}`}
                            className="text-blue-400 hover:text-strong w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-500/10 transition"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <select
                      id="new-payday-day"
                      aria-label="Select payday day"
                      value={newPaydayDay}
                      onChange={e => setNewPaydayDay(Number(e.target.value))}
                      className="flex-1 bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option
                          key={d}
                          value={d}
                          disabled={form.paydayDays.includes(d)}
                        >
                          {formatOrdinal(d)}{form.paydayDays.includes(d) ? " (Added)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (form.paydayDays.includes(newPaydayDay)) return;
                        const nextDays = [...form.paydayDays, newPaydayDay].sort((a, b) => a - b);
                        setForm({ ...form, paydayDays: nextDays });
                        const nextAvailable = Array.from({ length: 31 }, (_, i) => i + 1).find(
                          d => !nextDays.includes(d)
                        );
                        if (nextAvailable) {
                          setNewPaydayDay(nextAvailable);
                        }
                      }}
                      disabled={form.paydayDays.includes(newPaydayDay)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-fill-strong disabled:cursor-not-allowed text-white text-xs font-semibold transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "wallets" && (
            <div className="space-y-4">
              <p className="text-xs text-muted">Choose the wallets used for new payments, expenses, and payday allocations.</p>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider"><ArrowRightLeft size={14} /> Routing Rules</div>

                <div className="bg-surface-sunken border border-subtle rounded-2xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Living Allowance (₱)</label>
                    <input type="number" value={form.baseLivingAllowance} onChange={e => setForm({...form, baseLivingAllowance: Number(e.target.value)})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Routes To</label>
                    <select value={form.livingWallet} onChange={e => setForm({...form, livingWallet: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-surface-sunken border border-emerald-500/20 rounded-2xl p-4 grid grid-cols-2 gap-3 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-400" />
                  <div className="col-span-2 flex items-center justify-between mb-0.5">
                    <div>
                      <div className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider">Savings</div>
                      <div className="text-[10px] text-faint mt-0.5">
                        Set your savings allocation and destination wallet.
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_currentColor]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Savings Target (₱)</label>
                    <input type="number" value={form.baseSavingsTarget} onChange={e => setForm({...form, baseSavingsTarget: Number(e.target.value)})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Routes To</label>
                    <select value={form.savingsWallet} onChange={e => setForm({...form, savingsWallet: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-surface-sunken border border-subtle rounded-2xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Transit / Misc (₱)</label>
                    <input type="number" value={form.defaultTransitAllocation} onChange={e => setForm({...form, defaultTransitAllocation: Number(e.target.value)})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Routes To</label>
                    <select value={form.transitWallet} onChange={e => setForm({...form, transitWallet: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-surface-sunken border border-subtle rounded-2xl p-4">
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Default Wallet for New Bills</label>
                    <div className="text-[10px] text-faint mb-2">Pre-selected when you add a bill. Existing bills are unaffected.</div>
                    <select value={form.defaultWallet} onChange={e => setForm({...form, defaultWallet: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-surface-sunken border border-subtle rounded-2xl p-4">
                  <div className="mb-3">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Expense Routing</label>
                    <div className="text-[10px] text-faint">Choose the wallet automatically used for each new expense category.</div>
                  </div>

                  <div className={settingsGroup}>
                    {EXPENSE_CATEGORIES.map(category => (
                      <label key={category} className={settingsRow}>
                        <span className="text-sm font-medium text-primary">{category}</span>
                        <select
                          value={form.expenseWallets[category] || ""}
                          onChange={e => setForm({
                            ...form,
                            expenseWallets: {
                              ...form.expenseWallets,
                              [category]: e.target.value
                            }
                          })}
                          className="max-w-full min-w-0 bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer"
                        >
                          <WalletSelectOptions />
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === "sync" && (
            <div className="space-y-4 animate-in fade-in duration-200 text-xs font-mono text-secondary">
              <section aria-labelledby="settings-cloud-status" className="font-sans">
                <h4 id="settings-cloud-status" className="mb-2 px-1 text-xs font-semibold text-muted">Cloud Status</h4>
                <dl className={settingsGroup}>
                  <div className={settingsRow}>
                    <dt className="text-sm text-primary">Endpoint</dt>
                    <dd className="font-mono text-xs text-muted">/api/sync</dd>
                  </div>
                  <div className={settingsRow}>
                    <dt className="text-sm text-primary">Authentication</dt>
                    <dd className="text-xs text-muted">Google sign-in</dd>
                  </div>
                  <div className={settingsRow}>
                    <dt className="text-sm text-primary">Local liquid cash</dt>
                    <dd className="privacy-blur text-xs tabular-nums text-muted">₱{totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</dd>
                  </div>
                </dl>
              </section>
              <details className="rounded-2xl bg-surface px-4 py-3 font-sans">
                <summary className="cursor-pointer text-sm font-medium text-primary">Network Log</summary>
                <p className="mt-2 break-all font-mono text-xs text-muted">{debugLog || "No network action triggered yet."}</p>
              </details>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={onForcePush} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"><Cloud size={13} /> Push Data</button>
                <button onClick={onForcePull} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"><Database size={13} /> Pull Data</button>
              </div>
              
              <section aria-labelledby="settings-backups">
                <h4 id="settings-backups" className="mb-2 px-1 font-sans text-xs font-semibold text-muted">Backups &amp; recovery</h4>
                <div className={`${settingsGroup} font-sans`}>
                  {[
                    { label: "Export JSON Backup", action: onExport, icon: Download },
                    { label: "Import JSON Backup", action: onImportClick, icon: Upload },
                    { label: "Restore Pre-Import Backup", action: onRestoreImportBackup, icon: Database },
                  ].map(({ label, action, icon: Icon }) => action && (
                    <button key={label} type="button" onClick={action} className={settingsAction}>
                      <span className="flex items-center gap-2"><Icon size={15} aria-hidden="true" />{label}</span>
                      <ChevronRight size={15} aria-hidden="true" className="text-muted" />
                    </button>
                  ))}
                </div>
              </section>

              <details className="mt-4 bg-surface-lowest border border-subtle rounded-xl p-3 group">
                <summary className="text-[10px] text-muted font-semibold cursor-pointer outline-none flex items-center justify-between uppercase tracking-wider" style={{ listStyle: "none" }}>
                  <span>System & AI Scanner Debug Logs</span>
                  <span className="text-disabled text-[9px]">Tap to view</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-subtle space-y-3">
                  <div>
                    <div className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">Cloud Sync Log</div>
                    <pre className="text-[10px] text-muted font-mono overflow-auto whitespace-pre-wrap break-words bg-surface-input p-2 rounded-lg border border-subtle">{debugLog || 'No sync activity yet.'}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] text-purple-400 font-bold mb-1 uppercase tracking-wider">AI Scanner Log</div>
                    <pre className="text-[10px] text-faint font-mono overflow-auto max-h-32 whitespace-pre-wrap break-words bg-surface-input p-2 rounded-lg border border-subtle">
                      {(() => {
                        if (typeof window === 'undefined') return '';
                        try {
                          const log = window.localStorage.getItem('scanner_status');
                          return log ? JSON.stringify(JSON.parse(log), null, 2) : 'No recent scans.';
                        } catch (e) {
                          return 'No recent scans.';
                        }
                      })()}
                    </pre>
                  </div>
                </div>
              </details>
              <button onClick={handleMigrateWallets} className="settings-legacy-migration-button w-full mt-2 font-semibold py-2.5 rounded-xl text-xs transition">
                ⚡ Force Legacy Bill Migration
              </button>
            </div>
          )}
        </div>

        {activeTab !== "sync" && (
          <div className="flex shrink-0 items-center gap-2 border-t border-subtle bg-surface-elevated p-4 sm:px-6">
            <button
              type="button"
              onClick={handleCancel}
              className="w-1/3 bg-inverse/[0.04] hover:bg-inverse/[0.08] text-secondary text-xs font-semibold py-3 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 bg-[var(--bg-selection)] hover:bg-[var(--bg-selection-hover)] text-white text-xs font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              <Save size={14} /> Save Settings
            </button>
          </div>
        )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
