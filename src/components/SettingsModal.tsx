import React, { useState, useEffect, useRef } from "react";
import { X, Settings, Briefcase, Target, Save, Cloud, Database, ArrowRightLeft, Download, Upload } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import { getWalletForBill } from "../utils/financeHelpers";

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

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, initialTab = "general", onClose, globalData, setGlobalData, totalLiquid, debugLog, onForcePush, onForcePull, onExport, onImportClick }) => {
  const [activeTab, setActiveTab] = useState<"general"|"baselines"|"wallets"|"sync">(initialTab);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);
  const [form, setForm] = useState({
    goalName: "", targetFund: 0, milestoneWallet: "bpi",
    baseLivingAllowance: 2500, livingWallet: "gcash",
    baseSavingsTarget: 1000, savingsWallet: "bpi",
    defaultTransitAllocation: 1500, transitWallet: "gotyme",
    defaultWallet: "main",
    inflowsLabel: "RECEIVABLES & INFLOWS", gigsLabel: "UPCOMING SHOOTS & GIGS",
    inflowCategories: PRESETS.videographer.inflowCats, gigCategories: PRESETS.videographer.gigCats,
    walletLabels: { maribank: "MariBank", gcash: "GCash", maya: "Maya", gotyme: "GoTyme", bpi: "BPI", cash: "Cash On-Hand" } as Record<string, string>
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && globalData.settings) {
      setForm({
        goalName: globalData.settings.goalName || "",
        targetFund: globalData.settings.targetFund || 0,
        milestoneWallet: globalData.settings.milestoneWallet || "bpi",
        baseLivingAllowance: globalData.settings.baseLivingAllowance ?? 2500,
        livingWallet: globalData.settings.livingWallet || "gcash",
        baseSavingsTarget: globalData.settings.baseSavingsTarget ?? 1000,
        savingsWallet: globalData.settings.savingsWallet || "bpi",
        defaultTransitAllocation: globalData.settings.defaultTransitAllocation ?? 1500,
        transitWallet: globalData.settings.transitWallet || "gotyme",
        defaultWallet: globalData.settings.defaultWallet || "main",
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

  const handleSave = () => {
    setGlobalData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        targetFund: Number(form.targetFund), goalName: form.goalName, milestoneWallet: form.milestoneWallet,
        baseLivingAllowance: Number(form.baseLivingAllowance), livingWallet: form.livingWallet,
        baseSavingsTarget: Number(form.baseSavingsTarget), savingsWallet: form.savingsWallet,
        defaultTransitAllocation: Number(form.defaultTransitAllocation), transitWallet: form.transitWallet,
        defaultWallet: form.defaultWallet,
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
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose(); }}>
      <div ref={modalRef} className="bg-[#121217] border border-white/[0.08] rounded-3xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-zinc-300" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">App Settings</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition"><X size={18} /></button>
        </div>

        <div className="flex gap-4 border-b border-white/[0.06] mb-5 overflow-x-auto whitespace-nowrap hide-scrollbar">
          <button onClick={() => setActiveTab("general")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'general' ? 'text-white border-b-2 border-blue-500' : 'text-zinc-500 hover:text-zinc-300'}`}>General</button>
          <button onClick={() => setActiveTab("baselines")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'baselines' ? 'text-white border-b-2 border-purple-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Flow & Baselines</button>
          
          <button onClick={() => setActiveTab("sync")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'sync' ? 'text-white border-b-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Cloud Sync</button>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          {activeTab === "general" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider"><Target size={14} /> Main Milestone Goal</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Goal Name</label><input type="text" value={form.goalName} onChange={e => setForm({...form, goalName: e.target.value})} placeholder="e.g. Japan Trip, Emergency Fund, New Laptop" className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500" /></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Target Amount (₱)</label><input type="number" value={form.targetFund} onChange={e => setForm({...form, targetFund: Number(e.target.value)})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-blue-500" /></div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Linked Wallet (Tracks Progress)</label>
                    <select value={form.milestoneWallet} onChange={e => setForm({...form, milestoneWallet: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider"><Briefcase size={14} /> Dashboard Terminology</div>
                <div className="flex gap-2">
                  {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(k => (
                    <button key={k} onClick={() => applyPreset(k)} className="flex-1 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] py-2 px-1 rounded-lg text-[10px] text-zinc-300 transition focus:bg-amber-500/20 focus:text-amber-300 focus:border-amber-500/40">{PRESETS[k].label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Receivables Title</label><input type="text" value={form.inflowsLabel} onChange={e => setForm({...form, inflowsLabel: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500" /></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Gigs/Tasks Title</label><input type="text" value={form.gigsLabel} onChange={e => setForm({...form, gigsLabel: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500" /></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "baselines" && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-xs text-zinc-400 mb-2">Configure the default amounts injected into your wallets during the 15th/30th Payday Distribution. (Note: These scale down safely if your bills consume too much of your paycheck).</div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider"><ArrowRightLeft size={14} /> Routing Rules</div>
                
                <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Living Allowance (₱)</label>
                    <input type="number" value={form.baseLivingAllowance} onChange={e => setForm({...form, baseLivingAllowance: Number(e.target.value)})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Routes To</label>
                    <select value={form.livingWallet} onChange={e => setForm({...form, livingWallet: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Savings Target (₱)</label>
                    <input type="number" value={form.baseSavingsTarget} onChange={e => setForm({...form, baseSavingsTarget: Number(e.target.value)})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Routes To</label>
                    <select value={form.savingsWallet} onChange={e => setForm({...form, savingsWallet: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Transit / Misc (₱)</label>
                    <input type="number" value={form.defaultTransitAllocation} onChange={e => setForm({...form, defaultTransitAllocation: Number(e.target.value)})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Routes To</label>
                    <select value={form.transitWallet} onChange={e => setForm({...form, transitWallet: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>

                <div className="bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Default Wallet for New Bills</label>
                    <div className="text-[10px] text-zinc-500 mb-2">Pre-selected when you add a bill. Existing bills are unaffected.</div>
                    <select value={form.defaultWallet} onChange={e => setForm({...form, defaultWallet: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 cursor-pointer">
                      <WalletSelectOptions />
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "sync" && (
            <div className="space-y-4 animate-in fade-in duration-200 text-xs font-mono text-zinc-300">
              <div className="bg-[#09090c] p-3.5 rounded-2xl border border-white/[0.05] space-y-1">
                <div className="text-zinc-500 font-semibold text-[10px] uppercase tracking-wider mb-2">Cloud Status</div>
                <div>• Endpoint: <span className="text-emerald-400 font-bold">/api/sync</span></div>
                <div>• Auth: <span className="text-blue-400">Secure Passcode</span></div>
                <div>• Local Liquid: <span className="text-emerald-400 font-bold">₱{totalLiquid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
              </div>
              <div className="bg-[#09090c] p-3.5 rounded-2xl border border-white/[0.05] space-y-1">
                <div className="text-zinc-500 font-semibold text-[10px] uppercase tracking-wider mb-2">Network Log</div>
                <div className="text-[11px] text-amber-300 break-all">{debugLog || "No network action triggered yet."}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={onForcePush} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"><Cloud size={13} /> Push Data</button>
                <button onClick={onForcePull} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"><Database size={13} /> Pull Data</button>
              </div>
              
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.05]">
                <button onClick={onExport} className="w-full bg-[#1a1a22] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-200 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Download size={13} /> Export JSON Backup</button>
                <button onClick={onImportClick} className="w-full bg-[#1a1a22] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-200 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-md"><Upload size={13} /> Import JSON Backup</button>
              </div>

              <details className="mt-4 bg-[#09090c] border border-white/[0.05] rounded-xl p-3 group">
                <summary className="text-[10px] text-zinc-400 font-semibold cursor-pointer outline-none flex items-center justify-between uppercase tracking-wider" style={{ listStyle: "none" }}>
                  <span>System & AI Scanner Debug Logs</span>
                  <span className="text-zinc-600 text-[9px]">Tap to view</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-3">
                  <div>
                    <div className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">Cloud Sync Log</div>
                    <pre className="text-[10px] text-zinc-400 font-mono overflow-auto whitespace-pre-wrap break-words bg-[#0b0b0d] p-2 rounded-lg border border-white/[0.05]">{debugLog || 'No sync activity yet.'}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] text-purple-400 font-bold mb-1 uppercase tracking-wider">AI Scanner Log</div>
                    <pre className="text-[10px] text-zinc-500 font-mono overflow-auto max-h-32 whitespace-pre-wrap break-words bg-[#0b0b0d] p-2 rounded-lg border border-white/[0.05]">
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
              <button onClick={handleMigrateWallets} className="w-full mt-2 bg-amber-900/30 hover:bg-amber-800/40 text-amber-400 border border-amber-800/50 font-semibold py-2.5 rounded-xl text-xs transition">
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
