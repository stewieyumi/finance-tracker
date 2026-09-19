import React, { useState, useEffect, useRef } from "react";
import { X, Settings, Briefcase, Target, Save, Cloud, Database, ArrowRightLeft, Download, Upload } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import { getDefaultExpenseWalletId, getWalletForBill } from "../utils/financeHelpers";

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: "general" | "baselines" | "sync";
  onClose: () => void;
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  totalLiquid: number;
  debugLog: string;
  onForcePush: () => void | Promise<void>;
  onForcePull: () => void | Promise<void>;
  onExport: () => void;
  onImportClick: () => void;
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

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, initialTab = "general", onClose, globalData, setGlobalData, totalLiquid, debugLog, onForcePush, onForcePull, onExport, onImportClick }) => {
  const [activeTab, setActiveTab] = useState<"general"|"baselines"|"wallets"|"sync">(initialTab);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);
  const [form, setForm] = useState({
    goalName: "", targetFund: 0, paydayDays: [15, 30] as number[], milestoneWallet: "bpi", theme: "dark" as "dark" | "light" | "system",
    baseLivingAllowance: 2500, livingWallet: "gcash",
    baseSavingsTarget: 1000, savingsWallet: "bpi",
    defaultTransitAllocation: 1500, transitWallet: "gotyme",
    defaultWallet: "main",
    expenseWallets: {} as Record<string, string>,
    inflowsLabel: "RECEIVABLES & INFLOWS", gigsLabel: "UPCOMING SHOOTS & GIGS",
    inflowCategories: PRESETS.videographer.inflowCats, gigCategories: PRESETS.videographer.gigCats,
    walletLabels: { maribank: "MariBank", gcash: "GCash", maya: "Maya", gotyme: "GoTyme", bpi: "BPI", cash: "Cash On-Hand" } as Record<string, string>
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && globalData.settings) {
      setForm({
        goalName: globalData.settings.goalName || "",
        targetFund: globalData.settings.targetFund || 0, paydayDays: globalData.settings.paydayDays || [15, 30], theme: globalData.settings.theme || "dark",
        milestoneWallet: globalData.settings.milestoneWallet || "bpi",
        baseLivingAllowance: globalData.settings.baseLivingAllowance ?? 2500,
        livingWallet: globalData.settings.livingWallet || "gcash",
        baseSavingsTarget: globalData.settings.baseSavingsTarget ?? 1000,
        savingsWallet: globalData.settings.savingsWallet || "bpi",
        defaultTransitAllocation: globalData.settings.defaultTransitAllocation ?? 1500,
        transitWallet: globalData.settings.transitWallet || "gotyme",
        defaultWallet: globalData.settings.defaultWallet || "main",
        expenseWallets: Object.fromEntries(
          EXPENSE_CATEGORIES.map(category => [
            category,
            globalData.settings?.expenseWallets?.[category] ||
              getDefaultExpenseWalletId(category, globalData.settings, globalData.wallets)
          ])
        ),
        inflowsLabel: globalData.settings.inflowsLabel || "RECEIVABLES & INFLOWS",
        gigsLabel: globalData.settings.gigsLabel || "UPCOMING SHOOTS & GIGS",
        inflowCategories: globalData.settings.inflowCategories?.length ? globalData.settings.inflowCategories : PRESETS.videographer.inflowCats,
        gigCategories: globalData.settings.gigCategories?.length ? globalData.settings.gigCategories : PRESETS.videographer.gigCats,
        walletLabels: globalData.settings.walletLabels || { maribank: "MariBank", gcash: "GCash", maya: "Maya", gotyme: "GoTyme", bpi: "BPI", cash: "Cash On-Hand" }
      });
    }
  }, [isOpen, globalData.settings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) { window.addEventListener("keydown", handleKeyDown); document.body.style.overflow = "hidden"; }
    return () => { window.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = "unset"; };
  }, [isOpen, onClose]);

  const applyPreset = (key: keyof typeof PRESETS) => {
    const p = PRESETS[key];
    setForm(prev => ({ ...prev, inflowsLabel: p.inflows, gigsLabel: p.gigs, inflowCategories: p.inflowCats, gigCategories: p.gigCats }));
  };

  const [newPaydayDay, setNewPaydayDay] = useState(1);

  const handleSave = () => {
    setGlobalData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        targetFund: Number(form.targetFund),
        paydayDays: form.paydayDays, goalName: form.goalName, milestoneWallet: form.milestoneWallet, theme: form.theme,
        baseLivingAllowance: Number(form.baseLivingAllowance), livingWallet: form.livingWallet,
        baseSavingsTarget: Number(form.baseSavingsTarget), savingsWallet: form.savingsWallet,
        defaultTransitAllocation: Number(form.defaultTransitAllocation), transitWallet: form.transitWallet,
        defaultWallet: form.defaultWallet,
        expenseWallets: form.expenseWallets,
        inflowsLabel: form.inflowsLabel, gigsLabel: form.gigsLabel, inflowCategories: form.inflowCategories, gigCategories: form.gigCategories, walletLabels: form.walletLabels
      },
      updatedAt: Date.now()
    }));
    onClose();
  };

  const handleMigrateWallets = () => {
    if (confirm("Permanently lock all old bills to their automatically assigned wallets (using the old routing rules)?")) {
      setGlobalData(prev => ({
        ...prev,
        library: {
          ...prev.library,
          bills: prev.library.bills.map(b => ({ ...b, wallet: b.wallet || getWalletForBill(b.name) }))
        },
        updatedAt: Date.now()
      }));
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
    <div className="settings-modal-backdrop fixed inset-0 z-[110] backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose(); }}>
      <div ref={modalRef} className="bg-surface-elevated border border-inverse/[0.08] rounded-3xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-inverse/[0.06] mb-4">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-secondary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-strong">App Settings</h3>
          </div>
          <button onClick={onClose} className="text-faint hover:text-strong transition"><X size={18} /></button>
        </div>

        <div className="flex gap-4 border-b border-inverse/[0.06] mb-5 overflow-x-auto whitespace-nowrap hide-scrollbar">
          <button onClick={() => setActiveTab("general")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'general' ? 'text-strong border-b-2 border-blue-500' : 'text-faint hover:text-secondary'}`}>General</button>
          <button onClick={() => setActiveTab("baselines")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'baselines' ? 'text-strong border-b-2 border-purple-500' : 'text-faint hover:text-secondary'}`}>Flow & Baselines</button>
          
          <button onClick={() => setActiveTab("sync")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'sync' ? 'text-strong border-b-2 border-amber-500' : 'text-faint hover:text-secondary'}`}>Cloud Sync</button>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          {activeTab === "general" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider"><Target size={14} /> Main Milestone Goal</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Goal Name</label><input type="text" value={form.goalName} onChange={e => setForm({...form, goalName: e.target.value})} placeholder="e.g. Japan Trip, Emergency Fund, New Laptop" className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-blue-500" /></div>
                  <div><label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Target Amount (₱)</label><input type="number" value={form.targetFund} onChange={e => setForm({...form, targetFund: Number(e.target.value)})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong font-mono outline-none focus:border-blue-500" /></div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Linked Wallet (Tracks Progress)</label>
                    <select value={form.milestoneWallet} onChange={e => setForm({...form, milestoneWallet: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-blue-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider"><Briefcase size={14} /> Dashboard Terminology</div>
                <div className="flex gap-2">
                  {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(k => (
                    <button key={k} onClick={() => applyPreset(k)} className="flex-1 bg-inverse/[0.03] hover:bg-inverse/[0.08] border border-inverse/[0.05] py-2 px-1 rounded-lg text-[10px] text-secondary transition focus:bg-amber-500/20 focus:text-amber-300 focus:border-amber-500/40">{PRESETS[k].label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div><label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Receivables Title</label><input type="text" value={form.inflowsLabel} onChange={e => setForm({...form, inflowsLabel: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-amber-500" /></div>
                  <div><label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Gigs/Tasks Title</label><input type="text" value={form.gigsLabel} onChange={e => setForm({...form, gigsLabel: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-amber-500" /></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "baselines" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-xs text-muted mb-2">Configure the default amounts injected into your wallets during the 15th/30th Payday Distribution. (Note: These scale down safely if your bills consume too much of your paycheck).</div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider"><ArrowRightLeft size={14} /> Routing Rules</div>
                
                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 grid grid-cols-2 gap-3">
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

                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4 grid grid-cols-2 gap-3">
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

                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4">
                  <div>
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Default Wallet for New Bills</label>
                    <div className="text-[10px] text-faint mb-2">Pre-selected when you add a bill. Existing bills are unaffected.</div>
                    <select value={form.defaultWallet} onChange={e => setForm({...form, defaultWallet: e.target.value})} className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4">
                  <div className="mb-3">
                    <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Expense Routing</label>
                    <div className="text-[10px] text-faint">Choose the wallet automatically used for each new expense category.</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXPENSE_CATEGORIES.map(category => (
                      <div key={category} className="space-y-1.5">
                        <label className="text-[10px] text-muted font-semibold block">{category}</label>
                        <select
                          value={form.expenseWallets[category] || ""}
                          onChange={e => setForm({
                            ...form,
                            expenseWallets: {
                              ...form.expenseWallets,
                              [category]: e.target.value
                            }
                          })}
                          className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer"
                        >
                          <WalletSelectOptions />
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4">
                  <label className="text-[10px] text-faint uppercase font-semibold mb-2 block">Appearance</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["dark", "light", "system"] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setForm({...form, theme: opt})}
                        className={`py-2 rounded-xl text-[11px] font-semibold capitalize transition border ${form.theme === opt ? "bg-blue-600 border-blue-500 text-white" : "bg-surface-input border-strong text-muted hover:border-default"}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-surface-sunken border border-inverse/[0.05] rounded-2xl p-4">
                  <label className="text-[10px] text-faint uppercase font-semibold mb-1 block">Payday Schedule</label>
                  <div className="text-[10px] text-faint mb-2">These dates control payday funding and commitment allocation. Not the same as an individual bill's due date.</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(form.paydayDays.length ? form.paydayDays : [15, 30]).map(day => (
                      <span key={day} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg chip-blue text-[11px] font-semibold">
                        {formatOrdinal(day)}
                        <button
                          type="button"
                          onClick={() => setForm({...form, paydayDays: form.paydayDays.filter(d => d !== day)})}
                          disabled={form.paydayDays.length <= 1}
                          className="text-blue-400 hover:text-strong disabled:opacity-30 disabled:cursor-not-allowed w-4 h-4 flex items-center justify-center rounded-full hover:bg-blue-500/10 transition"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={newPaydayDay}
                      onChange={e => setNewPaydayDay(Number(e.target.value))}
                      className="flex-1 bg-surface-input border border-strong rounded-xl px-3 py-2 text-xs text-strong outline-none focus:border-purple-500 cursor-pointer"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{formatOrdinal(d)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (form.paydayDays.length >= 10) return;
                        if (form.paydayDays.includes(newPaydayDay)) return;
                        setForm({...form, paydayDays: [...form.paydayDays, newPaydayDay].sort((a, b) => a - b)});
                      }}
                      disabled={form.paydayDays.length >= 10 || form.paydayDays.includes(newPaydayDay)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-fill-strong disabled:cursor-not-allowed text-white text-xs font-semibold transition"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "sync" && (
            <div className="space-y-4 animate-in fade-in duration-200 text-xs font-mono text-secondary">
              <div className="bg-surface-lowest p-3.5 rounded-2xl border border-inverse/[0.05] space-y-1">
                <div className="text-faint font-semibold text-[10px] uppercase tracking-wider mb-2">Cloud Status</div>
                <div>• Endpoint: <span className="text-emerald-400 font-bold">/api/sync</span></div>
                <div>• Auth: <span className="text-blue-400">Secure Passcode</span></div>
                <div>• Local Liquid: <span className="text-emerald-400 font-bold">₱{totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
              </div>
              <div className="bg-surface-lowest p-3.5 rounded-2xl border border-inverse/[0.05] space-y-1">
                <div className="text-faint font-semibold text-[10px] uppercase tracking-wider mb-2">Network Log</div>
                <div className="text-[11px] text-amber-300 break-all">{debugLog || "No network action triggered yet."}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={onForcePush} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"><Cloud size={13} /> Push Data</button>
                <button onClick={onForcePull} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"><Database size={13} /> Pull Data</button>
              </div>
              
              <div className="flex flex-col gap-2 pt-2 border-t border-inverse/[0.05]">
                <button onClick={onExport} className="w-full bg-surface-high hover:bg-inverse/[0.06] border border-inverse/[0.06] text-primary font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Download size={13} /> Export JSON Backup</button>
                <button onClick={onImportClick} className="w-full bg-surface-high hover:bg-inverse/[0.06] border border-inverse/[0.06] text-primary font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Upload size={13} /> Import JSON Backup</button>
              </div>

              <details className="mt-4 bg-surface-lowest border border-inverse/[0.05] rounded-xl p-3 group">
                <summary className="text-[10px] text-muted font-semibold cursor-pointer outline-none flex items-center justify-between uppercase tracking-wider" style={{ listStyle: "none" }}>
                  <span>System & AI Scanner Debug Logs</span>
                  <span className="text-disabled text-[9px]">Tap to view</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-inverse/[0.05] space-y-3">
                  <div>
                    <div className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">Cloud Sync Log</div>
                    <pre className="text-[10px] text-muted font-mono overflow-auto whitespace-pre-wrap break-words bg-surface-input p-2 rounded-lg border border-inverse/[0.05]">{debugLog || 'No sync activity yet.'}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] text-purple-400 font-bold mb-1 uppercase tracking-wider">AI Scanner Log</div>
                    <pre className="text-[10px] text-faint font-mono overflow-auto max-h-32 whitespace-pre-wrap break-words bg-surface-input p-2 rounded-lg border border-inverse/[0.05]">
                      {(() => {
                        if (typeof window === 'undefined') return '';
                        try {
                          const log = window.localStorage.getItem('scanner_debug_log');
                          return log ? JSON.stringify(JSON.parse(log), null, 2) : 'No recent scans.';
                        } catch (e) {
                          return window.localStorage.getItem('scanner_debug_log') || 'No recent scans.';
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
          <button onClick={handleSave} className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
            <Save size={14} /> Save Settings
          </button>
        )}
      </div>
    </div>
  );
}
