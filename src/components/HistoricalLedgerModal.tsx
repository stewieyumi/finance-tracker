import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, ArrowRight } from 'lucide-react';
import { UnifiedFinanceData, ManualTransaction } from '../types/finance';
import { generateId } from '../utils/idHelpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  globalData: UnifiedFinanceData;
  setGlobalData: React.Dispatch<React.SetStateAction<UnifiedFinanceData>>;
  showToast: (msg: string) => void;
}

export const HistoricalLedgerModal: React.FC<Props> = ({ isOpen, onClose, globalData, setGlobalData, showToast }) => {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    date: new Date().toISOString().split('T')[0],
    wallet: globalData.settings?.defaultWallet || 'main',
    destinationWallet: '',
    category: '',
    note: ''
  });

  if (!isOpen) return null;

  const transactions = globalData.library?.manualTransactions || [];
  const customWallets = globalData.settings?.customWallets || [];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!form.title || isNaN(amt) || amt <= 0) return;
    if (form.type === 'transfer' && !form.destinationWallet) {
       showToast("Please select a destination wallet.");
       return;
    }

    setGlobalData(prev => {
      const nextWallets = { ...prev.wallets };

      // REVERSE OLD TRANSACTION EFFECT
      if (editingId) {
         const oldTx = prev.library?.manualTransactions?.find(t => t.id === editingId);
         if (oldTx) {
             if (oldTx.type === 'income') nextWallets[oldTx.wallet!] = (nextWallets[oldTx.wallet!] || 0) - oldTx.amount;
             if (oldTx.type === 'expense') nextWallets[oldTx.wallet!] = (nextWallets[oldTx.wallet!] || 0) + oldTx.amount;
             if (oldTx.type === 'transfer') {
                 nextWallets[oldTx.wallet!] = (nextWallets[oldTx.wallet!] || 0) + oldTx.amount;
                 nextWallets[oldTx.destinationWallet!] = (nextWallets[oldTx.destinationWallet!] || 0) - oldTx.amount;
             }
         }
      }

      // APPLY NEW TRANSACTION EFFECT
      if (form.type === 'income') nextWallets[form.wallet] = (nextWallets[form.wallet] || 0) + amt;
      if (form.type === 'expense') nextWallets[form.wallet] = (nextWallets[form.wallet] || 0) - amt;
      if (form.type === 'transfer') {
          nextWallets[form.wallet] = (nextWallets[form.wallet] || 0) - amt;
          nextWallets[form.destinationWallet] = (nextWallets[form.destinationWallet] || 0) + amt;
      }

      Object.keys(nextWallets).forEach(k => nextWallets[k] = Math.round(nextWallets[k] * 100) / 100);

      const newTx: ManualTransaction = {
        id: editingId || generateId('mtx'),
        title: form.title.trim(),
        amount: amt,
        type: form.type,
        date: form.date,
        wallet: form.wallet,
        destinationWallet: form.type === 'transfer' ? form.destinationWallet : undefined,
        category: form.category,
        note: form.note,
        createdAt: editingId ? (prev.library?.manualTransactions?.find(t => t.id === editingId)?.createdAt || Date.now()) : Date.now()
      };

      const existingTxs = prev.library?.manualTransactions || [];
      const updatedTxs = editingId
         ? existingTxs.map(t => t.id === editingId ? newTx : t)
         : [newTx, ...existingTxs];

      return {
         ...prev,
         wallets: nextWallets,
         library: { ...prev.library, manualTransactions: updatedTxs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt) },
         updatedAt: Date.now()
      };
    });

    showToast(editingId ? "Transaction updated" : "Transaction recorded");
    setView('list');
  };

  const handleDelete = (tx: ManualTransaction) => {
    if (!confirm(`Delete "${tx.title}" and reverse its wallet impact?`)) return;
    setGlobalData(prev => {
      const nextWallets = { ...prev.wallets };
      if (tx.type === 'income') nextWallets[tx.wallet!] = (nextWallets[tx.wallet!] || 0) - tx.amount;
      if (tx.type === 'expense') nextWallets[tx.wallet!] = (nextWallets[tx.wallet!] || 0) + tx.amount;
      if (tx.type === 'transfer') {
         nextWallets[tx.wallet!] = (nextWallets[tx.wallet!] || 0) + tx.amount;
         nextWallets[tx.destinationWallet!] = (nextWallets[tx.destinationWallet!] || 0) - tx.amount;
      }
      Object.keys(nextWallets).forEach(k => nextWallets[k] = Math.round(nextWallets[k] * 100) / 100);

      return {
         ...prev,
         wallets: nextWallets,
         library: { ...prev.library, manualTransactions: (prev.library?.manualTransactions || []).filter(t => t.id !== tx.id) },
         updatedAt: Date.now()
      };
    });
    showToast("Transaction deleted");
  };

  const openEdit = (tx: ManualTransaction) => {
    setEditingId(tx.id);
    setForm({
      title: tx.title,
      amount: String(tx.amount),
      type: tx.type,
      date: tx.date,
      wallet: tx.wallet || 'main',
      destinationWallet: tx.destinationWallet || '',
      category: tx.category || '',
      note: tx.note || ''
    });
    setView('form');
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({
      title: '', amount: '', type: 'expense',
      date: new Date().toISOString().split('T')[0],
      wallet: globalData.settings?.defaultWallet || 'main',
      destinationWallet: '', category: '', note: ''
    });
    setView('form');
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#121217] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">{view === 'form' ? (editingId ? 'Edit Transaction' : 'New Transaction') : 'Historical Ledger'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 rounded-full hover:bg-white/[0.05] transition"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5">
          {view === 'list' ? (
            <div className="space-y-4">
              <button onClick={openAdd} className="w-full py-3.5 border border-dashed border-white/[0.15] hover:border-emerald-500/50 hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2">
                <Plus size={15} /> Add Manual Transaction
              </button>
              <div className="space-y-2">
                {transactions.length === 0 && <div className="text-center text-xs text-zinc-500 py-6 italic">No manual transactions recorded.</div>}
                {transactions.map(tx => (
                  <div key={tx.id} className="bg-[#14141a] border border-white/[0.04] p-3.5 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold text-zinc-200">{tx.title}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{tx.date} • {tx.type.toUpperCase()}</div>
                      </div>
                      <div className={`text-xs font-mono font-bold ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'expense' ? 'text-zinc-100' : 'text-blue-400'}`}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}₱{tx.amount.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.02]">
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-zinc-800 rounded">{customWallets.find(w => w.id === tx.wallet)?.label || tx.wallet}</span>
                        {tx.type === 'transfer' && (
                          <>
                            <ArrowRight size={10} />
                            <span className="px-1.5 py-0.5 bg-zinc-800 rounded">{customWallets.find(w => w.id === tx.destinationWallet)?.label || tx.destinationWallet}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(tx)} className="p-1.5 text-zinc-500 hover:text-amber-400 rounded hover:bg-amber-500/10 transition"><Edit2 size={13}/></button>
                        <button onClick={() => handleDelete(tx)} className="p-1.5 text-zinc-500 hover:text-rose-400 rounded hover:bg-rose-500/10 transition"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-2 bg-[#09090c] p-1.5 rounded-xl border border-white/[0.05]">
                {['expense', 'income', 'transfer'].map(t => (
                  <button key={t} type="button" onClick={() => setForm({...form, type: t as any})} className={`py-2 text-[10px] font-bold uppercase rounded-lg transition ${form.type === t ? (t === 'income' ? 'bg-emerald-500/20 text-emerald-400' : t === 'expense' ? 'bg-zinc-800 text-white' : 'bg-blue-500/20 text-blue-400') : 'text-zinc-500 hover:bg-white/[0.02]'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Title / Description</label>
                <input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500" placeholder="e.g., Backdated Salary, Bank Transfer..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Amount</label>
                  <input type="number" step="0.01" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500 font-mono" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">Date</label>
                  <input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">{form.type === 'transfer' ? 'From Wallet' : 'Wallet'}</label>
                  <select required value={form.wallet} onChange={e => setForm({...form, wallet: e.target.value})} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500">
                    {customWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </div>
                {form.type === 'transfer' && (
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold mb-1 block">To Wallet</label>
                    <select required value={form.destinationWallet} onChange={e => setForm({...form, destinationWallet: e.target.value})} className="w-full bg-[#0b0b0d] border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500">
                      <option value="" disabled>Select...</option>
                      {customWallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-3">
                <button type="button" onClick={() => setView('list')} className="flex-1 py-3 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold rounded-xl transition">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-900/20">{editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
