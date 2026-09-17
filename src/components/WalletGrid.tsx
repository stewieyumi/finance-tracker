import React, { useState, useEffect } from 'react';
import { Plus, X, CreditCard, CheckCircle2 } from 'lucide-react';
import { WalletState, CustomWallet } from '../types/finance';

interface WalletGridProps { wallets: WalletState; customWallets?: CustomWallet[]; milestoneWallet?: string; onCommit: (key: string, value: number) => void; onIncrement: (key: string, addAmount: number) => void; }

export const WalletGrid: React.FC<WalletGridProps> = React.memo(({ wallets, milestoneWallet, customWallets, onCommit, onIncrement }) => {
  const [editingWallet, setEditingWallet] = useState<{ id: string; label: string; color: string; balance: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setEditingWallet(null); };
    if (editingWallet) { window.addEventListener("keydown", handleKeyDown); document.body.style.overflow = "hidden"; }
    return () => { window.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = "unset"; };
  }, [editingWallet]);

  const openEdit = (wallet: any, currentBalance: number) => {
    setEditingWallet({ ...wallet, balance: currentBalance });
    setEditValue(currentBalance === 0 ? "" : String(Math.round(currentBalance * 100) / 100));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWallet) return;
    const cleaned = editValue.replace(/,/g, "").trim();
    const parsed = cleaned === "" ? 0 : parseFloat(cleaned);
    const validAmount = isNaN(parsed) ? editingWallet.balance : Math.round(parsed * 100) / 100;
    onCommit(editingWallet.id, validAmount);
    setEditingWallet(null);
  };

  return (
    <>
      <div className="bg-[#121217]/90 backdrop-blur-xl border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] rounded-2xl p-4 sm:p-5">
        <div className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase mb-3">Liquid Cash Wallets</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {(customWallets || []).map(w => {
            const currentBalance = wallets[w.id] ?? 0;
            const displayColor = w.id === milestoneWallet ? 'text-blue-400 font-bold' : (w.color || 'text-zinc-100');
            return (
              <button key={w.id} onClick={() => openEdit({ ...w, color: displayColor }, currentBalance)} className="flex items-center justify-between w-full bg-[#0b0b0e] border border-white/[0.05] rounded-xl px-3.5 py-3 hover:border-white/[0.12] hover:bg-white/[0.02] active:scale-[0.98] transition-all text-left group">
                <span className="privacy-blur text-xs text-zinc-300 font-medium truncate pr-2 group-hover:text-white transition-colors">{w.label}</span>
                <div className="flex items-baseline gap-0.5 shrink-0">
                  <span className="text-[10px] text-zinc-500 font-mono">₱</span>
                  <span className={`font-bold font-mono tracking-tight ${displayColor} text-xs`}>{currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </button>
            );
          })}
          {(!customWallets || customWallets.length === 0) && <div className="col-span-2 py-4 text-center text-zinc-500 text-xs italic">No accounts found. Manage accounts below.</div>}
        </div>
      </div>

      {editingWallet && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setEditingWallet(null); }}>
          <div className="bg-[#121217] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.05] flex items-center justify-center ${editingWallet.color}`}><CreditCard size={18} /></div>
                <div><h3 className="text-sm font-bold text-white leading-tight">Edit Balance</h3><p className="text-[11px] text-zinc-400 font-medium">{editingWallet.label}</p></div>
              </div>
              <button onClick={() => setEditingWallet(null)} className="text-zinc-500 hover:text-white p-2 bg-white/[0.03] hover:bg-white/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="relative flex items-center justify-center bg-[#09090c] border border-zinc-800 rounded-2xl p-5 focus-within:border-blue-500/50 transition-colors shadow-inner">
                <span className="absolute left-5 text-zinc-500 font-mono text-xl">₱</span>
                <input type="number" inputMode="decimal" step="0.01" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} className={`bg-transparent text-center text-3xl font-bold font-mono outline-none w-full ${editingWallet.color}`} placeholder="0.00" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 mb-2.5 text-center">Quick Add Income</div>
                <div className="grid grid-cols-3 gap-2">
                  {[100, 500, 1000].map(amt => <button key={amt} type="button" onClick={() => { onIncrement(editingWallet.id, amt); setEditingWallet(null); }} className="py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-mono font-bold transition active:scale-95 flex items-center justify-center gap-1 shadow-sm"><Plus size={12} />{amt}</button>)}
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition active:scale-[0.98]"><CheckCircle2 size={16} /> Save Balance</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
});