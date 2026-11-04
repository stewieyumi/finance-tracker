import React, { useState, useEffect } from 'react';
import { Plus, X, CreditCard, CheckCircle2 } from 'lucide-react';
import { WalletState, CustomWallet } from '../types/finance';

interface WalletGridProps { wallets: WalletState; customWallets?: CustomWallet[]; milestoneWallet?: string; savingsWallet?: string; onCommit: (key: string, value: number) => void; onIncrement: (key: string, addAmount: number) => void; }

export const WalletGrid: React.FC<WalletGridProps> = React.memo(({ wallets, milestoneWallet, savingsWallet, customWallets, onCommit, onIncrement }) => {
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
      <div className="rounded-2xl bg-surface p-3 sm:p-4">
        <div className="mb-2 px-1 text-sm font-semibold text-primary">Liquid Cash Wallets</div>
        <div className="overflow-hidden rounded-xl bg-surface-low divide-y divide-subtle">
          {(customWallets || []).map(w => {
            const currentBalance = wallets[w.id] ?? 0;
            const isMilestoneWallet = w.id === milestoneWallet;
            const isSavingsWallet = w.id === savingsWallet;

            const roleClasses =
              isMilestoneWallet && isSavingsWallet
                ? "ring-1 ring-inset ring-violet-400/50"
                : isMilestoneWallet
                  ? "ring-1 ring-inset ring-blue-500/55"
                  : isSavingsWallet
                    ? "ring-1 ring-inset ring-emerald-500/45"
                    : "";

            const displayColor = `${w.color || "text-strong"} font-bold`;

            return (
              <button key={w.id} onClick={() => openEdit({ ...w, color: displayColor }, currentBalance)} className={`group flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-high ${roleClasses}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full bg-current ${w.color || "text-muted"}`} />
                  <span className="privacy-blur truncate text-sm font-medium text-primary">{w.label}</span>
                  {isMilestoneWallet && <span className="sr-only">Goal wallet</span>}
                </span>
                <div className="flex items-baseline gap-0.5 shrink-0">
                  <span className="text-[10px] text-faint font-mono">₱</span>
                  <span className="text-sm font-semibold tabular-nums text-strong">{currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </button>
            );
          })}
          {(!customWallets || customWallets.length === 0) && <div className="col-span-2 py-4 text-center text-faint text-xs italic">No accounts found. Manage accounts below.</div>}
        </div>
      </div>

      {editingWallet && (
        <div className="fixed inset-0 z-[200] bg-[var(--bg-modal-scrim)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setEditingWallet(null); }}>
          <div className="bg-surface-elevated border border-subtle rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-inverse/[0.05] border border-subtle flex items-center justify-center ${editingWallet.color}`}><CreditCard size={18} /></div>
                <div><h3 className="text-sm font-bold text-strong leading-tight">Edit Balance</h3><p className="text-[11px] text-muted font-medium">{editingWallet.label}</p></div>
              </div>
              <button onClick={() => setEditingWallet(null)} className="text-faint hover:text-strong p-2 bg-inverse/[0.03] hover:bg-inverse/[0.08] rounded-full transition"><X size={16}/></button>
            </div>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="relative flex items-center justify-center bg-surface-lowest border border-strong rounded-2xl p-5 focus-within:border-blue-500/50 transition-colors shadow-inner">
                <span className="absolute left-5 text-faint font-mono text-xl">₱</span>
                <input type="number" inputMode="decimal" step="0.01" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} className={`bg-transparent text-center text-3xl font-bold font-mono outline-none w-full ${editingWallet.color}`} placeholder="0.00" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-faint mb-2.5 text-center">Quick Add Income</div>
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
