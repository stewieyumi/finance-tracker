import React, { useState } from 'react';
import { Plus, Trash2, CreditCard, Settings, Info } from 'lucide-react';
import { UnifiedFinanceData } from '../types/finance';
import { WalletGrid } from './WalletGrid';

interface WalletsTabProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  onCommit: (key: string, val: number) => void;
  onIncrement: (key: string, val: number) => void;
  onOpenSettings: () => void;
}

const COLORS = ["text-rose-400", "text-amber-400", "text-emerald-400", "text-cyan-400", "text-indigo-400", "text-purple-400", "text-pink-400", "text-zinc-300"];

export const WalletsTab: React.FC<WalletsTabProps> = ({ globalData, setGlobalData, onCommit, onIncrement, onOpenSettings }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletColor, setNewWalletColor] = useState(COLORS[2]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWalletName.trim();
    if (!name) return;

    const newId = "cw_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    setGlobalData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || { targetFund: 100000, perPayoutSalary: 15000, phpToJpyRate: 2.7, defaultTransitAllocation: 1500 }),
        customWallets: [...(prev.settings?.customWallets || []), { id: newId, label: name, color: newWalletColor }]
      },
      wallets: {
        ...prev.wallets,
        [newId]: 0
      },
      updatedAt: Date.now()
    }));

    setNewWalletName("");
    setShowAdd(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nIts balance will be permanently removed from your Total Liquid Cash.`)) return;
    
    setGlobalData(prev => {
      const nextWallets = { ...prev.wallets };
      delete nextWallets[id];
      
      return {
        ...prev,
        settings: {
          ...(prev.settings || { targetFund: 100000, perPayoutSalary: 15000, phpToJpyRate: 2.7, defaultTransitAllocation: 1500 }),
          customWallets: prev.settings?.customWallets?.filter(w => w.id !== id) || []
        },
        wallets: nextWallets,
        updatedAt: Date.now()
      };
    });
  };

  const customWallets = globalData.settings?.customWallets || [];

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
      <WalletGrid
        wallets={globalData.wallets}
        milestoneWallet={globalData.settings?.milestoneWallet}
        walletLabels={globalData.settings?.walletLabels}
        customWallets={customWallets}
        onCommit={onCommit}
        onIncrement={onIncrement}
      />

      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <CreditCard size={14} className="text-emerald-400" />
            Custom Accounts
          </h2>
          <button onClick={onOpenSettings} className="text-[10px] font-semibold bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.05] px-2.5 py-1.5 rounded-lg text-zinc-300 transition flex items-center gap-1.5">
            <Settings size={11} /> Rename Core
          </button>
        </div>

        {customWallets.length > 0 && (
          <div className="space-y-2.5 mb-4">
            {customWallets.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-[#14141a] border border-white/[0.04] p-3.5 rounded-xl shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full bg-current ${w.color || 'text-emerald-400'} shadow-[0_0_8px_currentColor]`} />
                  <span className="text-xs font-semibold text-zinc-200">{w.label}</span>
                </div>
                <button onClick={() => handleDelete(w.id, w.label)} aria-label="Delete account" className="text-zinc-500 hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-rose-500/10">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showAdd ? (
          <form onSubmit={handleAdd} className="bg-[#14141a] border border-white/[0.06] rounded-xl p-4 space-y-4 shadow-inner">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Account Name</label>
              <input type="text" placeholder="e.g., Crypto Ledger, Safe Vault..." value={newWalletName} onChange={e => setNewWalletName(e.target.value)} autoFocus className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500" />
            </div>
            
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-2 block">Accent Color</label>
              <div className="flex items-center gap-3">
                {COLORS.map(c => (
                  <button type="button" key={c} onClick={() => setNewWalletColor(c)} className={`w-6 h-6 rounded-full bg-current ${c} border-2 transition-all duration-300 ${newWalletColor === c ? 'border-white scale-110 shadow-[0_0_12px_currentColor]' : 'border-transparent opacity-40 hover:opacity-100 hover:scale-105'}`} />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-900/20 transition">Save Account</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)} className="w-full py-3.5 border border-dashed border-white/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
            <Plus size={15} /> Add Custom Account
          </button>
        )}
        
        <div className="mt-4 flex items-start gap-2.5 bg-blue-950/20 border border-blue-900/30 p-3.5 rounded-xl text-blue-300 text-[11px] leading-relaxed">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>Custom accounts are automatically added to your Total Liquid Cash. You can select them as targets for your Payday Flow or Milestone Goal in settings.</p>
        </div>
      </div>
    </div>
  );
};
