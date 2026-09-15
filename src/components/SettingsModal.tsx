import React, { useState, useEffect, useRef } from "react";
import { X, Settings, Briefcase, Target, Save, Cloud, Database } from "lucide-react";
import { UnifiedFinanceData } from "../types/finance";
import { getWalletForBill } from "../utils/financeHelpers";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  totalLiquid: number;
  debugLog: string;
  onForcePush: () => void | Promise<void>;
  onForcePull: () => void | Promise<void>;
}

const PRESETS = {
  videographer: { label: "Multimedia Artist", inflows: "RECEIVABLES & INFLOWS", gigs: "UPCOMING SHOOTS & GIGS", inflowCats: ["Salary", "Shoot", "Edit", "Payment", "Other"], gigCats: ["Solo Shoot", "Assistant", "Video Edit", "Event", "Commercial", "Other"] },
  freelance: { label: "Freelancer / Dev", inflows: "INVOICES & PAYMENTS", gigs: "FREELANCE PROJECTS", inflowCats: ["Retainer", "Project", "Consulting", "Other"], gigCats: ["Frontend", "Backend", "Fullstack", "Design", "Maintenance", "Other"] },
  personal: { label: "Personal / Student", inflows: "INCOME & ALLOWANCE", gigs: "TASKS & HUSTLES", inflowCats: ["Allowance", "Salary", "Gift", "Side Hustle", "Other"], gigCats: ["Part-time", "Errand", "Online Selling", "Other"] }
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, globalData, setGlobalData, totalLiquid, debugLog, onForcePush, onForcePull }) => {
  const [activeTab, setActiveTab] = useState<"general"|"wallets"|"sync">("general");
  const [form, setForm] = useState({
    goalName: "Japan ADB Target Milestone", targetFund: 80000, milestoneWallet: "maribank",
    inflowsLabel: "RECEIVABLES & INFLOWS", gigsLabel: "UPCOMING SHOOTS & GIGS",
    inflowCategories: PRESETS.videographer.inflowCats, gigCategories: PRESETS.videographer.gigCats,
    walletLabels: { maribank: "MariBank", gcash: "GCash", maya: "Maya", gotyme: "GoTyme", bpi: "BPI", cash: "Cash On-Hand" } as Record<string, string>
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && globalData.settings) {
      setForm({
        goalName: globalData.settings.goalName || "Japan ADB Target Milestone",
        targetFund: globalData.settings.targetFund || 80000,
        milestoneWallet: globalData.settings.milestoneWallet || "maribank",
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
        ...(prev.settings || { perPayoutSalary: 15000, phpToJpyRate: 2.7, defaultTransitAllocation: 1500 }),
        targetFund: Number(form.targetFund), goalName: form.goalName, milestoneWallet: form.milestoneWallet,
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

        <div className="flex gap-4 border-b border-white/[0.06] mb-5">
          <button onClick={() => setActiveTab("general")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'general' ? 'text-white border-b-2 border-blue-500' : 'text-zinc-500 hover:text-zinc-300'}`}>General</button>
          <button onClick={() => setActiveTab("wallets")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'wallets' ? 'text-white border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Wallets</button>
          <button onClick={() => setActiveTab("sync")} className={`pb-2 text-xs font-semibold uppercase tracking-wide transition ${activeTab === 'sync' ? 'text-white border-b-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Cloud Sync</button>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
          {activeTab === "general" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider"><Target size={14} /> Main Milestone Goal</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Goal Name</label><input type="text" value={form.goalName} onChange={e => setForm({...form, goalName: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500" /></div>
                  <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Target Amount (₱)</label><input type="number" value={form.targetFund} onChange={e => setForm({...form, targetFund: Number(e.target.value)})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-blue-500" /></div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Linked Wallet (Tracks Progress)</label>
                    <select value={form.milestoneWallet} onChange={e => setForm({...form, milestoneWallet: e.target.value})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer">
                      <option value="maribank">{form.walletLabels?.maribank || "MariBank"}</option><option value="bpi">{form.walletLabels?.bpi || "BPI"}</option>
                      <option value="maya">{form.walletLabels?.maya || "Maya"}</option><option value="gcash">{form.walletLabels?.gcash || "GCash"}</option>
                      <option value="gotyme">{form.walletLabels?.gotyme || "GoTyme"}</option><option value="cash">{form.walletLabels?.cash || "Cash On-Hand"}</option>
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

          {activeTab === "wallets" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="text-xs text-zinc-400 mb-4">Rename the wallets to match your actual banking setup. These names will update across the entire dashboard.</div>
              <div className="grid grid-cols-2 gap-3">
                {['maribank', 'maya', 'gcash', 'gotyme', 'bpi', 'cash'].map(key => (
                  <div key={key}>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">
                      {key === 'maribank' ? 'Bank 1 (Default Main)' : key === 'maya' ? 'E-Wallet 1' : key === 'gcash' ? 'E-Wallet 2' : key === 'gotyme' ? 'Digital Bank' : key === 'bpi' ? 'Bank 2 (Vault)' : 'Cash'}
                    </label>
                    <input type="text" value={(form.walletLabels as any)[key]} onChange={e => setForm({...form, walletLabels: {...form.walletLabels, [key]: e.target.value}})} className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500" />
                  </div>
                ))}
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
