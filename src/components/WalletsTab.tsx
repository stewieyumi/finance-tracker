import React, { useState } from 'react';
import { Plus, Trash2, Edit2, CreditCard, Info } from 'lucide-react';
import { UnifiedFinanceData, CustomWallet } from '../types/finance';
import { WalletGrid } from './WalletGrid';

interface WalletsTabProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  onCommit: (key: string, val: number) => void;
  onIncrement: (key: string, val: number) => void;
  onOpenSettings?: () => void;
}

const COLORS = [
  "text-rose-400", "text-amber-400", "text-emerald-400", 
  "text-cyan-400", "text-indigo-400", "text-purple-400", 
  "text-pink-400", "text-zinc-300", "text-blue-400"
];

const WALLET_NAME_SUGGESTIONS = [
  "BDO", "BPI", "Metrobank", "UnionBank", "Security Bank",
  "GCash", "Maya", "GoTyme", "MariBank", "SeaBank",
  "CIMB", "Tonik", "Cash On-Hand"
];

export const WalletsTab: React.FC<WalletsTabProps> = ({ globalData, setGlobalData, onCommit, onIncrement }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState("");
  const [walletColor, setWalletColor] = useState(COLORS[2]);

  const handleAddOrEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = walletName.trim();
    if (!name) return;

    setGlobalData(prev => {
      let updatedWallets = [...(prev.settings?.customWallets || [])];
      const nextWallets = { ...prev.wallets };
      
      if (editingId) {
        updatedWallets = updatedWallets.map(w => w.id === editingId ? { ...w, label: name, color: walletColor } : w);
      } else {
        const newId = "cw_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        updatedWallets.push({ id: newId, label: name, color: walletColor });
        nextWallets[newId] = 0;
      }

      return { ...prev, settings: { ...(prev.settings || {}), customWallets: updatedWallets }, wallets: nextWallets, updatedAt: Date.now() };
    });
    setWalletName(""); setEditingId(null); setShowAdd(false);
  };

  const openEdit = (id: string, currentLabel: string, currentColor: string) => {
    setEditingId(id); setWalletName(currentLabel); setWalletColor(currentColor || COLORS[2]); setShowAdd(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nIts balance will be permanently removed from your Total Liquid Cash. Any bills or transactions using this account will be automatically reassigned to another available account.`)) return;
    setGlobalData(prev => {
      const nextWallets = { ...prev.wallets };
      delete nextWallets[id];
      
      const remainingCustom = prev.settings?.customWallets?.filter(w => w.id !== id) || [];
      const fallbackWallet = remainingCustom.length > 0 ? remainingCustom[0].id : "main";
      
      const safeW = (wId?: string) => wId === id ? fallbackWallet : wId;
      const safeWReq = (wId: string) => wId === id ? fallbackWallet : wId;

      return { 
        ...prev, 
        settings: { 
          ...(prev.settings || {}), 
          customWallets: remainingCustom,
          milestoneWallet: safeW(prev.settings?.milestoneWallet),
          livingWallet: safeW(prev.settings?.livingWallet),
          savingsWallet: safeW(prev.settings?.savingsWallet),
          transitWallet: safeW(prev.settings?.transitWallet),
          defaultWallet: safeW(prev.settings?.defaultWallet)
        }, 
        library: {
          ...prev.library,
          bills: prev.library?.bills.map(b => ({ ...b, wallet: safeW(b.wallet) })) || [],
          receivables: prev.library?.receivables.map(r => ({ ...r, wallet: safeW(r.wallet) })) || [],
          expenses: prev.library?.expenses?.map(e => ({ ...e, wallet: safeWReq(e.wallet) })) || []
        },
        wallets: nextWallets, 
        updatedAt: Date.now() 
      };
    });
  };

  const customWallets = globalData.settings?.customWallets || [];

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
      <WalletGrid wallets={globalData.wallets} milestoneWallet={globalData.settings?.milestoneWallet} savingsWallet={globalData.settings?.savingsWallet} customWallets={customWallets} onCommit={onCommit} onIncrement={onIncrement} />
      <div className="bg-[#101014] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2"><CreditCard size={14} className="text-emerald-400" /> Account Management</h2></div>
        {customWallets.length > 0 && !showAdd && (
          <div className="space-y-2.5 mb-4">
            {customWallets.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-[#14141a] border border-white/[0.04] p-3.5 rounded-xl shadow-sm">
                <div className="flex items-center gap-2.5"><div className={`w-2.5 h-2.5 rounded-full bg-current ${w.color || 'text-emerald-400'} shadow-[0_0_8px_currentColor]`} /><span className="privacy-blur text-xs font-semibold text-zinc-200">{w.label}</span></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(w.id, w.label, w.color || COLORS[2])} aria-label="Edit account" className="text-zinc-500 hover:text-amber-400 p-1.5 transition rounded-lg hover:bg-amber-500/10"><Edit2 size={14} /></button>
                  <button onClick={() => handleDelete(w.id, w.label)} aria-label="Delete account" className="text-zinc-500 hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-rose-500/10"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {showAdd ? (
          <form onSubmit={handleAddOrEdit} className="bg-[#14141a] border border-white/[0.06] rounded-xl p-4 space-y-4 shadow-inner">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5 block">Account Name</label>
              <input type="text" list="wallet-name-suggestions" placeholder="e.g., BPI, GCash, Vault..." value={walletName} onChange={e => setWalletName(e.target.value)} autoFocus className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500" required />
              <datalist id="wallet-name-suggestions">
                {WALLET_NAME_SUGGESTIONS.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div><label className="text-[10px] text-zinc-500 uppercase font-semibold mb-2 block">Accent Color</label>
              <div className="flex items-center flex-wrap gap-3">{COLORS.map(c => <button type="button" key={c} onClick={() => setWalletColor(c)} className={`w-6 h-6 rounded-full bg-current ${c} border-2 transition-all duration-300 ${walletColor === c ? 'border-white scale-110 shadow-[0_0_12px_currentColor]' : 'border-transparent opacity-40 hover:opacity-100 hover:scale-105'}`} />)}</div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
              <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); setWalletName(""); }} className="flex-1 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-900/20 transition">{editingId ? "Update" : "Save"} Account</button>
            </div>
          </form>
        ) : (
          <button onClick={() => { setShowAdd(true); setEditingId(null); setWalletName(""); setWalletColor(COLORS[2]); }} className="w-full py-3.5 border border-dashed border-white/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2"><Plus size={15} /> Add New Account</button>
        )}
      </div>
    </div>
  );
};
