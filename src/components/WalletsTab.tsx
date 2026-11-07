import React, { useState } from 'react';
import { Plus, Archive, Edit2, CreditCard, Info, ArrowRightLeft } from 'lucide-react';
import { UnifiedFinanceData, CustomWallet } from '../types/finance';
import { formatPHP } from '../utils/currency';
import { getWalletForBill } from '../utils/financeHelpers';
import { WalletGrid } from './WalletGrid';

interface WalletsTabProps {
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  onCommit: (key: string, val: number) => void;
  onIncrement: (key: string, val: number) => void;
  onOpenSettings?: () => void;
  onTransfer?: () => void;
}

const COLORS = [
  "text-rose-400", "text-amber-400", "text-emerald-400", 
  "text-cyan-400", "text-indigo-400", "text-purple-400", 
  "text-pink-400", "text-secondary", "text-blue-400"
];

const WALLET_NAME_SUGGESTIONS = [
  "BDO", "BPI", "Metrobank", "UnionBank", "Security Bank",
  "GCash", "Maya", "GoTyme", "MariBank", "SeaBank",
  "CIMB", "Tonik", "Cash On-Hand"
];

export const WalletsTab: React.FC<WalletsTabProps> = ({ globalData, setGlobalData, onCommit, onIncrement, onTransfer }) => {
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

      return { ...prev, settings: { ...(prev.settings || {}), customWallets: updatedWallets }, wallets: nextWallets, updatedAt: Date.now() } as any;
    });
    setWalletName(""); setEditingId(null); setShowAdd(false);
  };

  const openEdit = (id: string, currentLabel: string, currentColor: string) => {
    setEditingId(id); setWalletName(currentLabel); setWalletColor(currentColor || COLORS[2]); setShowAdd(true);
  };

  const archiveBlock = (data: UnifiedFinanceData, id: string) => {
    if ((data.wallets[id] ?? 0) !== 0) return "Bring this wallet to zero before archiving it.";
    const settings = data.settings;
    const routes = [
      settings?.milestoneWallet, settings?.livingWallet, settings?.savingsWallet,
      settings?.transitWallet, settings?.defaultWallet,
      ...Object.values(settings?.expenseWallets ?? {}),
    ];
    if (routes.includes(id) || data.library.bills.some(bill => (bill.wallet || getWalletForBill(bill.name)) === id) ||
      data.library.receivables.some(receivable => receivable.wallet === id) ||
      id === "main") return "Change the wallet used by settings, commitments, or inflows before archiving.";
  };

  const handleArchive = (id: string, name: string) => {
    const blocked = archiveBlock(globalData, id);
    if (blocked) {
      alert(blocked);
      return;
    }
    if (!confirm(`Archive "${name}"? Its history will be kept and you can restore it anytime.`)) return;

    let reason: string | undefined;
    setGlobalData(prev => {
      const settings = prev.settings;
      const wallet = settings?.customWallets?.find(entry => entry.id === id);
      if (!wallet) return prev;
      reason = archiveBlock(prev, id);
      if (reason) return prev;
      const wallets = { ...prev.wallets };
      delete wallets[id];
      return {
        ...prev,
        wallets,
        settings: {
          ...settings,
          customWallets: settings?.customWallets?.filter(entry => entry.id !== id),
          archivedWallets: [...(settings?.archivedWallets ?? []), wallet],
        },
        updatedAt: Date.now(),
      };
    });
    if (reason) alert(reason);
  };

  const handleRestore = (id: string) => {
    setGlobalData(prev => {
      const settings = prev.settings;
      const wallet = settings?.archivedWallets?.find(entry => entry.id === id);
      if (!wallet || settings?.customWallets?.some(entry => entry.id === id)) return prev;
      return {
        ...prev,
        wallets: { ...prev.wallets, [id]: prev.wallets[id] ?? 0 },
        settings: {
          ...settings,
          customWallets: [...(settings?.customWallets ?? []), wallet],
          archivedWallets: settings?.archivedWallets?.filter(entry => entry.id !== id),
        },
        updatedAt: Date.now(),
      };
    });
  };

  const customWallets = globalData.settings?.customWallets || [];
  const totalWalletBalance = customWallets.reduce((total, wallet) => total + (Number(globalData.wallets[wallet.id]) || 0), 0);

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
      <section aria-labelledby="wallets-total" className="rounded-2xl border border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="wallets-total" className="text-sm font-semibold text-muted">Total Wallet Balance</h2>
          {onTransfer && <button type="button" onClick={onTransfer} disabled={customWallets.length < 2}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3 text-sm font-medium text-primary transition hover:bg-fill-strong disabled:cursor-not-allowed disabled:opacity-50">
            <ArrowRightLeft size={16} aria-hidden="true" /> Transfer
          </button>}
        </div>
        <p className="privacy-blur mt-1 break-words font-mono text-2xl font-bold text-strong">{formatPHP(totalWalletBalance)}</p>
        <p className="mt-1 text-xs text-muted">Across {customWallets.length} active {customWallets.length === 1 ? "wallet" : "wallets"}</p>
        {onTransfer && customWallets.length < 2 && <p className="mt-2 text-xs text-muted">Add another wallet to enable transfers.</p>}
      </section>
      <WalletGrid wallets={globalData.wallets} milestoneWallet={globalData.settings?.milestoneWallet} savingsWallet={globalData.settings?.savingsWallet} customWallets={customWallets} onCommit={onCommit} onIncrement={onIncrement} />
      <div className="rounded-2xl bg-surface p-3 sm:p-4">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2"><CreditCard size={14} className="text-emerald-400" /> Account Management</h2></div>
        {customWallets.length > 0 && !showAdd && (
          <div className="mb-4 overflow-hidden rounded-xl bg-surface-low divide-y divide-subtle">
            {customWallets.map(w => (
              <div key={w.id} className="flex min-h-12 items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2.5"><div className={`w-2.5 h-2.5 rounded-full bg-current ${w.color || 'text-emerald-400'} shadow-[0_0_8px_currentColor]`} /><span className="privacy-blur text-xs font-semibold text-primary">{w.label}</span></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(w.id, w.label, w.color || COLORS[2])} aria-label="Edit account" className="text-faint hover:text-amber-400 p-1.5 transition rounded-lg hover:bg-amber-500/10"><Edit2 size={14} /></button>
                  <button onClick={() => handleArchive(w.id, w.label)} aria-label="Archive account" className="text-faint hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-rose-500/10"><Archive size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!!globalData.settings?.archivedWallets?.length && (
          <details className="mb-4 rounded-xl border border-subtle p-3">
            <summary className="cursor-pointer text-xs font-semibold">Archived wallets</summary>
            {globalData.settings.archivedWallets.map(wallet => (
              <div key={wallet.id} className="mt-3 flex items-center justify-between text-xs">
                <span className="privacy-blur">{wallet.label}</span>
                <button type="button" onClick={() => handleRestore(wallet.id)} aria-label={`Restore ${wallet.label}`} className="rounded-lg px-3 py-2 text-emerald-400">Restore</button>
              </div>
            ))}
          </details>
        )}
        {showAdd ? (
          <form onSubmit={handleAddOrEdit} className="bg-surface border border-subtle rounded-xl p-4 space-y-4 shadow-inner">
            <div>
              <label className="text-[10px] text-faint uppercase font-semibold mb-1.5 block">Account Name</label>
              <input type="text" list="wallet-name-suggestions" placeholder="e.g., BPI, GCash, Vault..." value={walletName} onChange={e => setWalletName(e.target.value)} autoFocus className="w-full bg-surface-input border border-strong rounded-xl px-3 py-2.5 text-xs text-strong outline-none focus:border-emerald-500" required />
              <datalist id="wallet-name-suggestions">
                {WALLET_NAME_SUGGESTIONS.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div><label className="text-[10px] text-faint uppercase font-semibold mb-2 block">Accent Color</label>
              <div className="flex items-center flex-wrap gap-3">{COLORS.map(c => <button type="button" key={c} onClick={() => setWalletColor(c)} className={`w-6 h-6 rounded-full bg-current ${c} border-2 transition-all duration-300 ${walletColor === c ? 'border-white scale-110 shadow-[0_0_12px_currentColor]' : 'border-transparent opacity-40 hover:opacity-100 hover:scale-105'}`} />)}</div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-inverse/[0.04]">
              <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); setWalletName(""); }} className="flex-1 py-2.5 bg-inverse/[0.05] hover:bg-inverse/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-900/20 transition">{editingId ? "Update" : "Save"} Account</button>
            </div>
          </form>
        ) : (
          <button onClick={() => { setShowAdd(true); setEditingId(null); setWalletName(""); setWalletColor(COLORS[2]); }} className="w-full py-3.5 border border-dashed border-inverse/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-muted hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2"><Plus size={15} /> Add New Account</button>
        )}
      </div>
    </div>
  );
};
